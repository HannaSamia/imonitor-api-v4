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
import { CoreDataModule } from './database/core-data.module';
import { HealthModule } from './health/health.module';
import { AuthEndpointsModule } from './modules/auth/auth-endpoints.module';
import { UsersModule } from './modules/users/users.module';
import { ModulesModule } from './modules/modules/modules.module';
import { ParametersModule } from './modules/parameters/parameters.module';
import { NodeDefinitionModule } from './modules/node-definition/node-definition.module';
import { ReportsModule } from './modules/reports/reports.module';
import { WidgetBuilderModule } from './modules/widget-builder/widget-builder.module';
import { QbeModule } from './modules/qbe/qbe.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RotatingDashboardModule } from './modules/rotating-dashboard/rotating-dashboard.module';
import { DataAnalysisModule } from './modules/data-analysis/data-analysis.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { ConnectivityModule } from './modules/connectivity/connectivity.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { CustomerCareModule } from './modules/customer-care/customer-care.module';
import { BulkProcessingModule } from './modules/bulk-processing/bulk-processing.module';
import { BulkEdaReportModule } from './modules/bulk-eda-report/bulk-eda-report.module';
import { CdrDecoderModule } from './modules/cdr-decoder/cdr-decoder.module';
import { BillRunModule } from './modules/bill-run/bill-run.module';
import { TarrifLogModule } from './modules/tarrif-log/tarrif-log.module';
import { AutomatedReportModule } from './modules/automated-report/automated-report.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { UtilityModule } from './modules/utility/utility.module';
import { DeploymentModule } from './modules/deployment/deployment.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { GatewaysModule } from './gateways/gateways.module';
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
    CoreDataModule,
    LegacyDataDbModule,
    LegacyEtlDbModule,
    LegacyPrestoModule,
    RedisModule,
    LoggerModule,
    AuthModule,
    SharedModule,
    HealthModule,
    AuthEndpointsModule,
    UsersModule,
    ModulesModule,
    ParametersModule,
    NodeDefinitionModule,
    ReportsModule,
    WidgetBuilderModule,
    QbeModule,
    DashboardModule,
    RotatingDashboardModule,
    DataAnalysisModule,
    ObservabilityModule,
    ConnectivityModule,
    NotificationModule,
    CustomerCareModule,
    BulkProcessingModule,
    BulkEdaReportModule,
    CdrDecoderModule,
    BillRunModule,
    TarrifLogModule,
    AutomatedReportModule,
    AuditLogModule,
    UtilityModule,
    DeploymentModule,
    SchedulerModule,
    GatewaysModule,
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
