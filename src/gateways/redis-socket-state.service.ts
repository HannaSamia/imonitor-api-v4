import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * Thin wrapper around the raw ioredis client for Socket.IO gateway state management.
 * Provides list, string, and scan operations used by all gateways to track
 * connected sockets and their associated chart/user data across cluster workers.
 */
@Injectable()
export class RedisSocketStateService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Returns a range of elements from a Redis list (LRANGE).
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.redis.lrange(key, start, stop);
  }

  /**
   * Appends a value to the tail of a Redis list (RPUSH).
   */
  async rpush(key: string, value: string): Promise<void> {
    await this.redis.rpush(key, value);
  }

  /**
   * Deletes a key (DEL).
   */
  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Sets a string key-value pair (SET).
   */
  async set(key: string, value: string): Promise<void> {
    await this.redis.set(key, value);
  }

  /**
   * Gets the value of a string key (GET). Returns null if the key does not exist.
   */
  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  /**
   * Scans for all keys matching the given glob pattern using SCAN STREAM.
   * Uses a count hint of 100 per iteration batch.
   */
  async scan(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    return new Promise((resolve, reject) => {
      stream.on('data', (resultKeys: string[]) => {
        keys.push(...resultKeys);
      });
      stream.on('end', () => resolve(keys));
      stream.on('error', (err: Error) => reject(err));
    });
  }
}
