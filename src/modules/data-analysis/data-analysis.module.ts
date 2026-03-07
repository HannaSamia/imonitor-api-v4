import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreDataAnalysis } from '../../database/entities/core-data-analysis.entity';
import { CoreDataAnalysisChart } from '../../database/entities/core-data-analysis-chart.entity';
import { CoreDataAnalysisReport } from '../../database/entities/core-data-analysis-report.entity';
import { CoreSharedDataAnalysis } from '../../database/entities/core-shared-data-analysis.entity';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportCharts } from '../../database/entities/core-report-charts.entity';
import { ReportsModule } from '../reports/reports.module';
import { DataAnalysisController } from './data-analysis.controller';
import { DataAnalysisService } from './data-analysis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoreDataAnalysis,
      CoreDataAnalysisChart,
      CoreDataAnalysisReport,
      CoreSharedDataAnalysis,
      CoreReport,
      CoreReportCharts,
    ]),
    ReportsModule,
  ],
  controllers: [DataAnalysisController],
  providers: [DataAnalysisService],
  exports: [DataAnalysisService],
})
export class DataAnalysisModule {}
