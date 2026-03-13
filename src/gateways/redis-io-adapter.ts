import cluster from 'node:cluster';
import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { setupWorker } from '@socket.io/sticky';
import type { Server, ServerOptions } from 'socket.io';
import Redis from 'ioredis';

/**
 * Custom NestJS IoAdapter that attaches the Redis adapter for cross-worker
 * Socket.IO pub/sub and calls setupWorker in cluster worker mode for
 * sticky-session load balancing.
 *
 * Usage in main.ts:
 *   const adapter = new RedisIoAdapter(app);
 *   await adapter.connectToRedis(host, port, password);
 *   app.useWebSocketAdapter(adapter);
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  /**
   * Creates Redis pub/sub clients, attaches error listeners, and builds the
   * Socket.IO Redis adapter constructor.
   */
  async connectToRedis(host: string, port: number, password?: string): Promise<void> {
    const pubClient = new Redis({ host, port, password: password || undefined });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err: Error) => this.logger.error(`Redis pub error: ${err.message}`));
    subClient.on('error', (err: Error) => this.logger.error(`Redis sub error: ${err.message}`));

    this.adapterConstructor = createAdapter(pubClient, subClient, {
      requestsTimeout: 20000,
      key: 'imonitor-master',
    });

    this.logger.log('Redis adapter ready');
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...(options ?? {}),
      transports: ['websocket'],
    }) as Server;

    server.adapter(this.adapterConstructor);

    if (cluster.isWorker) {
      setupWorker(server);
      this.logger.log(`setupWorker called on pid ${process.pid}`);
    }

    return server;
  }
}
