import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { RedisHealthIndicator } from './redis.health';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.isHealthy('redis'),
      () => this.memory.checkHeap('memory_heap', 256 * 1024 * 1024),
    ]);
  }
}
