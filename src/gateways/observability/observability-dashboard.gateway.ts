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
import type { Namespace, Socket } from 'socket.io';
import { CoreObservabilityDashboardError } from '../../database/entities/core-observability-dashboard-error.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ObservabilityService } from '../../modules/observability/observability.service';
import { RedisSocketStateService } from '../redis-socket-state.service';

@Injectable()
@WebSocketGateway({ namespace: '/observability_dashboards', transports: ['websocket'] })
export class ObservabilityDashboardGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  private static readonly REDIS_PREFIX = 'observability_dashboards:';
  private static readonly ROOM = 'observability_dashboards';

  private readonly logger = new Logger(ObservabilityDashboardGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly observabilityService: ObservabilityService,
    private readonly redisState: RedisSocketStateService,
    @InjectRepository(CoreObservabilityDashboardError)
    private readonly obsErrorRepo: Repository<CoreObservabilityDashboardError>,
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
    client.join(ObservabilityDashboardGateway.ROOM);
    this.logger.log(`ObservabilityDashboard client connected: ${client.id}, total in room available via fetchSockets`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    await this.redisState.del(ObservabilityDashboardGateway.REDIS_PREFIX + client.id);
    this.logger.log(`ObservabilityDashboard client disconnected: ${client.id}`);
  }

  @SubscribeMessage('run_chart')
  async handleRunChart(client: Socket, body: Record<string, unknown>): Promise<void> {
    const chartId = body.chartId as string;
    if (!chartId) return;

    const redisKey = ObservabilityDashboardGateway.REDIS_PREFIX + client.id;

    // Deduplicate by chartId
    const existing = await this.redisState.lrange(redisKey, 0, -1);
    if (existing.includes(chartId)) {
      return;
    }
    await this.redisState.rpush(redisKey, chartId);

    try {
      const result = await this.observabilityService.generateChartByType(body);
      client.emit(chartId, result);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`ObservabilityDashboard chart error [${chartId}]: ${err.message}`);

      // Persist error — fire-and-forget
      this.obsErrorRepo
        .save(
          this.obsErrorRepo.create({
            error_stack: err.stack ?? err.message,
            error_date: new Date(),
            chartId,
          }),
        )
        .catch((saveErr: Error) => this.logger.error(`Error saving observability dashboard error: ${saveErr.message}`));

      client.emit(chartId, {
        hasError: true,
        message: 'Chart not loaded',
        error: err.stack,
      });
    }
  }
}
