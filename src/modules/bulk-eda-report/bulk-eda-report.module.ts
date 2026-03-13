import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreBulkEdaReports } from '../../database/entities/core-bulk-eda-reports.entity';
import { SharedModule } from '../../shared/shared.module';
import { CustomerCareModule } from '../customer-care/customer-care.module';
import { BulkEdaReportController } from './bulk-eda-report.controller';
import { BulkEdaReportService } from './bulk-eda-report.service';

@Module({
  imports: [SharedModule, CustomerCareModule, TypeOrmModule.forFeature([CoreBulkEdaReports])],
  controllers: [BulkEdaReportController],
  providers: [BulkEdaReportService],
})
export class BulkEdaReportModule {}
