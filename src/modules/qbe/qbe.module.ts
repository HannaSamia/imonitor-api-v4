import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportCharts } from '../../database/entities/core-report-charts.entity';
import { CoreSharedQbeReport } from '../../database/entities/core-shared-qbe-report.entity';
import { QbeController } from './qbe.controller';
import { QbeService } from './qbe.service';
import { QbeQueryService } from './services/qbe-query.service';

@Module({
  imports: [TypeOrmModule.forFeature([CoreReport, CoreReportCharts, CoreSharedQbeReport])],
  controllers: [QbeController],
  providers: [QbeService, QbeQueryService],
  exports: [QbeService],
})
export class QbeModule {}
