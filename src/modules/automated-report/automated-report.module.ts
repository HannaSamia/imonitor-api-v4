import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreAutomatedReport } from '../../database/entities/core-automated-report.entity';
import { CoreAutomatedReportCleaning } from '../../database/entities/core-automated-report-cleaning.entity';
import { CoreAutomatedReportEmail } from '../../database/entities/core-automated-report-email.entity';
import { CoreAutomatedReportSftp } from '../../database/entities/core-automated-report-sftp.entity';
import { CoreReport } from '../../database/entities/core-report.entity';
import { SharedModule } from '../../shared/shared.module';
import { AutomatedReportController } from './automated-report.controller';
import { AutomatedReportService } from './automated-report.service';

@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([
      CoreAutomatedReport,
      CoreAutomatedReportEmail,
      CoreAutomatedReportSftp,
      CoreAutomatedReportCleaning,
      CoreReport,
    ]),
  ],
  controllers: [AutomatedReportController],
  providers: [AutomatedReportService],
  exports: [AutomatedReportService],
})
export class AutomatedReportModule {}
