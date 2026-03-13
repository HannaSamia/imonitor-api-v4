import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket, RemoteSocket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { CoreDashboardError } from '../../database/entities/core-dashboard-error.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { WidgetBuilderService } from '../../modules/widget-builder/widget-builder.service';
import { GenerateChartByTypeDto } from '../../modules/widget-builder/dto/generate-chart-by-type.dto';
import { RedisSocketStateService } from '../redis-socket-state.service';

@Injectable()
@WebSocketGateway({ namespace: '/dashboard', transports: ['websocket'] })
export class DashboardGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  private static readonly REDIS_PREFIX = 'dashboard:';
  private static readonly ROOM = 'dashboard';
  private static readonly MAX_RETRIES = 10;

  private readonly logger = new Logger(DashboardGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly widgetBuilderService: WidgetBuilderService,
    private readonly redisState: RedisSocketStateService,
    private readonly legacyDataDb: LegacyDataDbService,
    @InjectRepository(CoreDashboardError)
    private readonly dashboardErrorRepo: Repository<CoreDashboardError>,
    private readonly dateHelper: DateHelperService,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket: Socket, next: (err?: Error) => void) => {
      const token: string | undefined = socket.handshake?.auth?.token;
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }
      try {
        const payload = this.jwtService.verify(token, { clockTolerance: 60 });
        socket.data.user = payload;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
  }

  handleConnection(client: Socket): void {
    client.join(DashboardGateway.ROOM);
    this.logger.log(`Dashboard client connected: ${client.id}`);
    // Fire-and-forget: update the Redis client map
    this.getClientsFromStorage().catch((err: Error) =>
      this.logger.error(`getClientsFromStorage error: ${err.message}`),
    );
  }

  async handleDisconnect(client: Socket): Promise<void> {
    await this.redisState.del(DashboardGateway.REDIS_PREFIX + client.id);
    this.logger.log(`Dashboard client disconnected: ${client.id}`);
  }

  @SubscribeMessage('run_chart')
  async handleRunChart(client: Socket, body: GenerateChartByTypeDto): Promise<void> {
    const { widgetBuilderId, chartId } = body;
    const redisKey = DashboardGateway.REDIS_PREFIX + client.id;

    // Deduplicate: check if this chart is already queued for this socket
    const existing = await this.redisState.lrange(redisKey, 0, -1);
    const chartEntry = JSON.stringify({ widgetBuilderId, chartId });
    if (existing.includes(chartEntry)) {
      return;
    }

    // Push to list so we can track active charts per socket
    await this.redisState.rpush(redisKey, chartEntry);

    try {
      const result = await this.widgetBuilderService.generateChartByType(body);
      client.emit(`${widgetBuilderId}_${chartId}`, result);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Chart error [${widgetBuilderId}/${chartId}]: ${err.message}`);

      // Persist error — fire-and-forget
      this.dashboardErrorRepo
        .save(
          this.dashboardErrorRepo.create({
            errorstack: err.stack ?? err.message,
            errorDate: new Date(),
            widgetBuilderId,
            chartId,
          }),
        )
        .catch((saveErr: Error) => this.logger.error(`Error saving dashboard error: ${saveErr.message}`));

      client.emit(`${widgetBuilderId}_${chartId}`, {
        hasError: true,
        message: 'Chart not loaded',
        error: err.stack,
      });
    }
  }

  /**
   * Builds a map of { socketId → GenerateChartByTypeDto[] } by scanning all
   * dashboard:* Redis keys and cross-referencing with live sockets in the room.
   * Also inserts a row into V3_opened_dashboards_stats for analytics.
   * Returns the map for use by EtlGateway.
   */
  async getClientsFromStorage(): Promise<Record<string, GenerateChartByTypeDto[]>> {
    const keys = await this.redisState.scan(`${DashboardGateway.REDIS_PREFIX}*`);
    let connectedSockets: RemoteSocket<DefaultEventsMap, unknown>[];
    try {
      connectedSockets = await this.fetchSocketsWithRetry(DashboardGateway.ROOM);
    } catch (err: unknown) {
      this.logger.error(`fetchSockets failed: ${(err as Error).message}`);
      connectedSockets = [];
    }

    const connectedIds = new Set(connectedSockets.map((s) => s.id));

    const clientMap: Record<string, GenerateChartByTypeDto[]> = {};

    for (const key of keys) {
      const socketId = key.replace(DashboardGateway.REDIS_PREFIX, '');
      if (!connectedIds.has(socketId)) continue;

      const entries = await this.redisState.lrange(key, 0, -1);
      const charts: GenerateChartByTypeDto[] = [];
      for (const entry of entries) {
        try {
          charts.push(JSON.parse(entry) as GenerateChartByTypeDto);
        } catch {
          // Ignore malformed entries
        }
      }
      clientMap[socketId] = charts;
    }

    // Analytics: insert opened dashboard count — fire-and-forget
    const socketCount = Object.keys(clientMap).length;
    const statDate = this.dateHelper.formatDate();
    const dbDataName = process.env.DB_DATA_NAME;
    if (dbDataName) {
      this.legacyDataDb
        .affectedQuery(
          `INSERT INTO ${dbDataName}.V3_opened_dashboards_stats (stat_date, nb_opened_dashboards) VALUES (?, ?)`,
          [statDate, socketCount],
        )
        .catch((err: Error) => this.logger.error(`Error inserting dashboard stats: ${err.message}`));
    }

    return clientMap;
  }

  private async fetchSocketsWithRetry(
    room: string,
    maxRetries = DashboardGateway.MAX_RETRIES,
  ): Promise<RemoteSocket<DefaultEventsMap, unknown>[]> {
    let lastError!: Error;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.server.in(room).fetchSockets();
      } catch (err: unknown) {
        lastError = err as Error;
      }
    }
    throw lastError;
  }
}
