import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreAutomatedReport } from '../../database/entities/core-automated-report.entity';
import { CoreAutomatedReportCleaning } from '../../database/entities/core-automated-report-cleaning.entity';
import { SharedModule } from '../../shared/shared.module';
import { LegacyDataDbModule } from '../../database/legacy-data-db/legacy-data-db.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([CoreAutomatedReport, CoreAutomatedReportCleaning]),
    SharedModule,
    LegacyDataDbModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
