import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { WidgetBuilderModule } from '../modules/widget-builder/widget-builder.module';
import { ConnectivityModule } from '../modules/connectivity/connectivity.module';
import { NotificationModule } from '../modules/notifications/notification.module';
import { ObservabilityModule } from '../modules/observability/observability.module';
import { CoreDashboardError } from '../database/entities/core-dashboard-error.entity';
import { CoreObservabilityDashboardError } from '../database/entities/core-observability-dashboard-error.entity';
import { RedisSocketStateService } from './redis-socket-state.service';
import { WsJwtGuard } from './ws-jwt.guard';
import { DashboardGateway } from './dashboard/dashboard.gateway';
import { ObservabilityDashboardGateway } from './observability/observability-dashboard.gateway';
import { NotificationsGateway } from './notifications/notifications.gateway';
import { ConnectivityGateway } from './connectivity/connectivity.gateway';
import { ObservabilityAlertsGateway } from './observability/observability-alerts.gateway';
import { EtlGateway } from './etl/etl.gateway';

@Module({
  imports: [
    AuthModule,
    WidgetBuilderModule,
    ConnectivityModule,
    NotificationModule,
    ObservabilityModule,
    TypeOrmModule.forFeature([CoreDashboardError, CoreObservabilityDashboardError]),
  ],
  providers: [
    RedisSocketStateService,
    WsJwtGuard,
    DashboardGateway,
    ObservabilityDashboardGateway,
    NotificationsGateway,
    ConnectivityGateway,
    ObservabilityAlertsGateway,
    EtlGateway,
  ],
  exports: [NotificationsGateway, ConnectivityGateway, ObservabilityAlertsGateway],
})
export class GatewaysModule {}
