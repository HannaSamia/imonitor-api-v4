import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { LegacyDataDbModule } from './database/legacy-data-db/legacy-data-db.module';
import { LegacyEtlDbModule } from './database/legacy-etl-db/legacy-etl-db.module';
import { LegacyPrestoModule } from './database/legacy-presto/legacy-presto.module';
import { RedisModule } from './redis/redis.module';
import { LoggerModule } from './logger/logger.module';
import { AuthModule } from './auth/auth.module';
import { SharedModule } from './shared/shared.module';
import { HealthModule } from './health/health.module';
import { CorrelationIdMiddleware } from './logger/correlation-id.middleware';
import { RequestFilterMiddleware } from './shared/middleware/request-filter.middleware';
import { RateLimiterMiddleware } from './shared/middleware/rate-limiter.middleware';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TransformInterceptor } from './shared/interceptors/transform.interceptor';
import { RequestArchiveInterceptor } from './shared/interceptors/request-archive.interceptor';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    EventEmitterModule.forRoot({ maxListeners: 50 }),
    DatabaseModule,
    LegacyDataDbModule,
    LegacyEtlDbModule,
    LegacyPrestoModule,
    RedisModule,
    LoggerModule,
    AuthModule,
    SharedModule,
    HealthModule,
  ],
  providers: [
    // Global guard — JWT auth on all routes (unless @Public())
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global interceptors — response envelope + request archive
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestArchiveInterceptor,
    },
    // Global exception filter — matches v3 error response format
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Middleware order: request filter → rate limiter → correlation ID → routes
    consumer.apply(RequestFilterMiddleware, RateLimiterMiddleware, CorrelationIdMiddleware).forRoutes('*');
  }
}
