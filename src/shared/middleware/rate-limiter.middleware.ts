import { Inject, Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/**
 * Dual-layer rate limiter — Redis primary with in-memory insurance fallback.
 * Matches v3's rateLimiter middleware. Logs blocked IPs to core_rate_limiter.
 * Returns 429 (fixing v3's inconsistency).
 */
@Injectable()
export class RateLimiterMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimiterMiddleware.name);
  private rateLimiter: RateLimiterRedis;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    const nbOfPoints = this.configService.get<number>('NB_OF_REQUESTS', 200);
    const duration = this.configService.get<number>('RATE_LIMIT_DURATION_SEC', 60);
    const blockDuration = this.configService.get<number>('RATE_BLOCK_DURATION', 60);

    const rateLimiterMemory = new RateLimiterMemory({
      points: nbOfPoints,
      duration,
    });

    this.rateLimiter = new RateLimiterRedis({
      storeClient: this.redisClient,
      points: nbOfPoints,
      duration,
      inMemoryBlockOnConsumed: nbOfPoints + 1,
      inMemoryBlockDuration: blockDuration,
      insuranceLimiter: rateLimiterMemory,
    });
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const remoteIp = (req.ip || '').replace(/^.*:/, '');

    try {
      await this.rateLimiter.consume(remoteIp);
      next();
    } catch (err: any) {
      // On first excess (consumed === points+1), log IP to database
      if (err.consumedPoints === this.rateLimiter.points + 1) {
        this.logger.warn(`Rate limit exceeded for IP: ${remoteIp}`);
        try {
          await this.dataSource.query(
            'INSERT INTO core_rate_limiter (ipAddress) VALUES (?)',
            [remoteIp],
          );
        } catch (dbErr: unknown) {
          this.logger.error(`Failed to log blocked IP: ${(dbErr as Error).message}`);
        }
      }

      res.status(429).json({
        statusCode: 429,
        message: 'Too Many Requests',
      });
    }
  }
}
