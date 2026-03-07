import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreRotatingDashboard } from '../../database/entities/core-rotating-dashboard.entity';
import { CoreSharedRotatingDashboard } from '../../database/entities/core-shared-rotating-dashboard.entity';
import { DashboardModule } from '../dashboard/dashboard.module';
import { RotatingDashboardController } from './rotating-dashboard.controller';
import { RotatingDashboardService } from './rotating-dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([CoreRotatingDashboard, CoreSharedRotatingDashboard]), DashboardModule],
  controllers: [RotatingDashboardController],
  providers: [RotatingDashboardService],
  exports: [RotatingDashboardService],
})
export class RotatingDashboardModule {}
