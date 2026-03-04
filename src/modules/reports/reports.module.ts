import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportCharts } from '../../database/entities/core-report-charts.entity';
import { CoreReportModule as CoreReportModuleEntity } from '../../database/entities/core-report-module.entity';
import { CoreReportUsedTable } from '../../database/entities/core-report-used-table.entity';
import { CoreSharedReport } from '../../database/entities/core-shared-report.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { QueryBuilderService } from './services/query-builder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoreReport,
      CoreReportCharts,
      CoreReportModuleEntity,
      CoreReportUsedTable,
      CoreSharedReport,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, QueryBuilderService],
  exports: [ReportsService, QueryBuilderService],
})
export class ReportsModule {}
