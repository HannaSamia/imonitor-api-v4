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
@WebSocketGateway({ namespace: '/notifications', transports: ['websocket'] })
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  private static readonly REDIS_PREFIX = 'notifications:';
  private static readonly ROOM = 'notifications';

  private readonly logger = new Logger(NotificationsGateway.name);

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
    client.join(NotificationsGateway.ROOM);
    const userId = client.handshake.query.id as string | undefined;
    if (userId) {
      this.addSocket(client.id, userId).catch((err: Error) => this.logger.error(`addSocket error: ${err.message}`));
    }
    this.logger.log(`Notifications client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    await this.redisState.del(NotificationsGateway.REDIS_PREFIX + client.id);
    this.logger.log(`Notifications client disconnected: ${client.id}`);
  }

  /**
   * Stores a socketId → userId mapping in Redis.
   */
  private async addSocket(socketId: string, userId: string): Promise<void> {
    await this.redisState.set(NotificationsGateway.REDIS_PREFIX + socketId, JSON.stringify({ [socketId]: userId }));
  }

  /**
   * Emits the `alert` event to all sockets belonging to the given userId.
   */
  async sendAlert(userId: string, payload: unknown): Promise<void> {
    await this.emitToUser(userId, 'alert', payload);
  }

  /**
   * Emits the `connectivity_alert` event to all sockets belonging to the given userId.
   */
  async sendConnectivityAlert(userId: string, payload: unknown): Promise<void> {
    await this.emitToUser(userId, 'connectivity_alert', payload);
  }

  @OnEvent('socket.notification.send')
  handleNotificationSendEvent(data: { userId: string; payload: unknown }): void {
    this.sendAlert(data.userId, data.payload).catch((err: Error) =>
      this.logger.error(`sendAlert error: ${err.message}`),
    );
  }

  @OnEvent('socket.connectivity.alert')
  handleConnectivityAlertEvent(data: { userId: string; payload: unknown }): void {
    this.sendConnectivityAlert(data.userId, data.payload).catch((err: Error) =>
      this.logger.error(`sendConnectivityAlert error: ${err.message}`),
    );
  }

  /**
   * Scans Redis for all notification socket keys, resolves the userId for each,
   * checks whether the socket is still live, and emits `eventName` to matching sockets.
   */
  private async emitToUser(userId: string, eventName: string, payload: unknown): Promise<void> {
    const keys = await this.redisState.scan(`${NotificationsGateway.REDIS_PREFIX}*`);
    if (keys.length === 0) return;

    let connectedSockets: RemoteSocket<DefaultEventsMap, unknown>[];
    try {
      connectedSockets = await this.server.in(NotificationsGateway.ROOM).fetchSockets();
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

      this.server.to(socketId).emit(eventName, payload);
    }
  }
}
