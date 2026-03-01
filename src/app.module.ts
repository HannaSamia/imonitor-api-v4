import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { LegacyDataDbModule } from './database/legacy-data-db/legacy-data-db.module';
import { LegacyEtlDbModule } from './database/legacy-etl-db/legacy-etl-db.module';
import { LegacyPrestoModule } from './database/legacy-presto/legacy-presto.module';
import { RedisModule } from './redis/redis.module';
import { LoggerModule } from './logger/logger.module';
import { AuthModule } from './auth/auth.module';
import { CorrelationIdMiddleware } from './logger/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    LegacyDataDbModule,
    LegacyEtlDbModule,
    LegacyPrestoModule,
    RedisModule,
    LoggerModule,
    AuthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
