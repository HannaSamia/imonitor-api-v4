import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket, RemoteSocket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { RedisSocketStateService } from '../redis-socket-state.service';

@Injectable()
@WebSocketGateway({ namespace: '/observability_alerts', transports: ['websocket'] })
export class ObservabilityAlertsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  private static readonly REDIS_PREFIX = 'observabilityNotifications:';
  private static readonly ROOM = 'observability_alerts';

  private readonly logger = new Logger(ObservabilityAlertsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisState: RedisSocketStateService,
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
    client.join(ObservabilityAlertsGateway.ROOM);
    const userId = client.handshake.query.id as string | undefined;
    if (userId) {
      this.addSocket(client.id, userId).catch((err: Error) => this.logger.error(`addSocket error: ${err.message}`));
    }
    this.logger.log(`ObservabilityAlerts client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    await this.redisState.del(ObservabilityAlertsGateway.REDIS_PREFIX + client.id);
    this.logger.log(`ObservabilityAlerts client disconnected: ${client.id}`);
  }

  /**
   * Stores a socketId → userId mapping in Redis.
   */
  private async addSocket(socketId: string, userId: string): Promise<void> {
    await this.redisState.set(
      ObservabilityAlertsGateway.REDIS_PREFIX + socketId,
      JSON.stringify({ [socketId]: userId }),
    );
  }

  /**
   * Emits the `alert` event to all sockets belonging to the given userId.
   */
  async sendAlert(userId: string, payload: unknown): Promise<void> {
    const keys = await this.redisState.scan(`${ObservabilityAlertsGateway.REDIS_PREFIX}*`);
    if (keys.length === 0) return;

    let connectedSockets: RemoteSocket<DefaultEventsMap, unknown>[];
    try {
      connectedSockets = await this.server.in(ObservabilityAlertsGateway.ROOM).fetchSockets();
    } catch (err: unknown) {
      this.logger.error(`fetchSockets failed: ${(err as Error).message}`);
      return;
    }
    const connectedIds = new Set(connectedSockets.map((s) => s.id));

    for (const key of keys) {
      const raw = await this.redisState.get(key);
      if (!raw) continue;

      let entry: Record<string, string>;
      try {
        entry = JSON.parse(raw) as Record<string, string>;
      } catch {
        continue;
      }

      const [socketId, mappedUserId] = Object.entries(entry)[0] ?? [];
      if (!socketId || mappedUserId !== userId) continue;
      if (!connectedIds.has(socketId)) continue;

      this.server.to(socketId).emit('alert', payload);
    }
  }

  @OnEvent('socket.observability.alert')
  handleObservabilityAlertEvent(data: { userId: string; payload: unknown }): void {
    this.sendAlert(data.userId, data.payload).catch((err: Error) =>
      this.logger.error(`sendAlert error: ${err.message}`),
    );
  }
}
