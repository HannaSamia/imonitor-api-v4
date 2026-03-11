import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreObservabilityMetrics } from '../../database/entities/core-observability-metrics.entity';
import { CoreObservabilityMetricsModule } from '../../database/entities/core-observability-metrics-module.entity';
import { CoreObservabilityMetricsUsedTables } from '../../database/entities/core-observability-metrics-used-tables.entity';
import { CoreObservabilityMetricsFilters } from '../../database/entities/core-observability-metrics-filters.entity';
import { CoreObservabilityMetricsThresholds } from '../../database/entities/core-observability-metrics-thresholds.entity';
import { CoreObservabilityMetricsAlerts } from '../../database/entities/core-observability-metrics-alerts.entity';
import { CoreObservabilityMetricsTypes } from '../../database/entities/core-observability-metrics-types.entity';
import { CoreObservabilityCharts } from '../../database/entities/core-observability-charts.entity';
import { CoreObservabilityMetricCharts } from '../../database/entities/core-observability-metric-charts.entity';
import { CoreObservabilityDashboard } from '../../database/entities/core-observability-dashboard.entity';
import { CoreObservabilityDashboardCharts } from '../../database/entities/core-observability-dashboard-charts.entity';
import { CoreObservabilityDashboardError } from '../../database/entities/core-observability-dashboard-error.entity';
import { CoreObservabilityNotificationSent } from '../../database/entities/core-observability-notification-sent.entity';
import { ReportsModule } from '../reports/reports.module';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';
import { ObservabilityQueryService } from './services/observability-query.service';
import { ObservabilityUtilService } from './services/observability-util.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoreObservabilityMetrics,
      CoreObservabilityMetricsModule,
      CoreObservabilityMetricsUsedTables,
      CoreObservabilityMetricsFilters,
      CoreObservabilityMetricsThresholds,
      CoreObservabilityMetricsAlerts,
      CoreObservabilityMetricsTypes,
      CoreObservabilityCharts,
      CoreObservabilityMetricCharts,
      CoreObservabilityDashboard,
      CoreObservabilityDashboardCharts,
      CoreObservabilityDashboardError,
      CoreObservabilityNotificationSent,
    ]),
    ReportsModule,
  ],
  controllers: [ObservabilityController],
  providers: [ObservabilityService, ObservabilityQueryService, ObservabilityUtilService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
