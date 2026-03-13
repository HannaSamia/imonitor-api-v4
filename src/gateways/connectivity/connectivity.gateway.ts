import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket, RemoteSocket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { ConnectivityService } from '../../modules/connectivity/connectivity.service';
import { RedisSocketStateService } from '../redis-socket-state.service';

@Injectable()
@WebSocketGateway({ namespace: '/connectivities', transports: ['websocket'] })
export class ConnectivityGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  private static readonly REDIS_PREFIX = 'connectivities:';
  private static readonly ROOM = 'connectivities';

  private readonly logger = new Logger(ConnectivityGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly connectivityService: ConnectivityService,
    private readonly redisState: RedisSocketStateService,
    private readonly eventEmitter: EventEmitter2,
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
    client.join(ConnectivityGateway.ROOM);

    const userId = client.handshake.query.id as string | undefined;
    if (userId) {
      // Persist socket → userId mapping then push initial data
      this.addSocket(client.id, userId)
        .then(() =>
          this.connectivityService.getAllConnectivities(userId).then((result) => {
            client.emit('fetchData', result);
          }),
        )
        .catch((err: Error) => this.logger.error(`Connectivity initial data error for ${client.id}: ${err.message}`));
    }

    this.logger.log(`Connectivity client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    await this.redisState.del(ConnectivityGateway.REDIS_PREFIX + client.id);
    this.logger.log(`Connectivity client disconnected: ${client.id}`);
  }

  /**
   * Stores a socketId → userId mapping in Redis.
   */
  private async addSocket(socketId: string, userId: string): Promise<void> {
    await this.redisState.set(ConnectivityGateway.REDIS_PREFIX + socketId, JSON.stringify({ [socketId]: userId }));
  }

  /**
   * Scans all connected users and broadcasts updated connectivity data to each.
   * Called by EtlGateway on `connectivityCheck` event.
   */
  async broadcastConnectivityUpdate(): Promise<void> {
    const userSocketMap = await this.buildUserSocketMap();

    await Promise.allSettled(
      Object.entries(userSocketMap).map(async ([userId, socketIds]) => {
        try {
          const result = await this.connectivityService.getAllConnectivities(userId);
          for (const socketId of socketIds) {
            this.server.to(socketId).emit('fetchData', result);
          }
        } catch (err: unknown) {
          this.logger.error(`broadcastConnectivityUpdate error for ${userId}: ${(err as Error).message}`);
        }
      }),
    );

    await this.emitConnectivityAlerts(userSocketMap);
  }

  /**
   * For each connected user checks failed nodes; if any, emits
   * `socket.connectivity.alert` via EventEmitter2 so NotificationsGateway
   * can forward the alert to the correct client.
   */
  private async emitConnectivityAlerts(userSocketMap: Record<string, string[]>): Promise<void> {
    for (const [userId] of Object.entries(userSocketMap)) {
      try {
        const failedNodes = await this.connectivityService.getFailedNodes(userId);
        if (failedNodes && failedNodes.length > 0) {
          this.eventEmitter.emit('socket.connectivity.alert', {
            userId,
            payload: { failedNodes, type: 'connectivity_failure' },
          });
        }
      } catch (err: unknown) {
        this.logger.error(`emitConnectivityAlerts error for ${userId}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Builds a map of { userId → socketId[] } for all currently connected sockets.
   */
  private async buildUserSocketMap(): Promise<Record<string, string[]>> {
    const keys = await this.redisState.scan(`${ConnectivityGateway.REDIS_PREFIX}*`);
    if (keys.length === 0) return {};

    let connectedSockets: RemoteSocket<DefaultEventsMap, unknown>[];
    try {
      connectedSockets = await this.server.in(ConnectivityGateway.ROOM).fetchSockets();
    } catch (err: unknown) {
      this.logger.error(`fetchSockets failed: ${(err as Error).message}`);
      return {};
    }
    const connectedIds = new Set(connectedSockets.map((s) => s.id));

    const userSocketMap: Record<string, string[]> = {};

    for (const key of keys) {
      const raw = await this.redisState.get(key);
      if (!raw) continue;

      let entry: Record<string, string>;
      try {
        entry = JSON.parse(raw) as Record<string, string>;
      } catch {
        continue;
      }

      const [socketId, userId] = Object.entries(entry)[0] ?? [];
      if (!socketId || !userId) continue;
      if (!connectedIds.has(socketId)) continue;

      if (!userSocketMap[userId]) userSocketMap[userId] = [];
      userSocketMap[userId].push(socketId);
    }

    return userSocketMap;
  }
}
