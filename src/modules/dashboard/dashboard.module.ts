import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreDashboard } from '../../database/entities/core-dashboard.entity';
import { CoreDashboardWidgetBuilder } from '../../database/entities/core-dashboard-widget-builder.entity';
import { CoreDashboardChart } from '../../database/entities/core-dashboard-chart.entity';
import { CoreDashboardError } from '../../database/entities/core-dashboard-error.entity';
import { CoreSharedDashboard } from '../../database/entities/core-shared-dashboard.entity';
import { CoreWidgetBuilder } from '../../database/entities/core-widget-builder.entity';
import { CoreWidgetBuilderCharts } from '../../database/entities/core-widget-builder-charts.entity';
import { WidgetBuilderModule } from '../widget-builder/widget-builder.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoreDashboard,
      CoreDashboardWidgetBuilder,
      CoreDashboardChart,
      CoreDashboardError,
      CoreSharedDashboard,
      CoreWidgetBuilder,
      CoreWidgetBuilderCharts,
    ]),
    WidgetBuilderModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
