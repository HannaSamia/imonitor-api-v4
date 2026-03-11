import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreNotificationSent } from '../../database/entities/core-notification-sent.entity';
import { CoreNotificationSettings } from '../../database/entities/core-notification-settings.entity';
import { CoreNotificationUsers } from '../../database/entities/core-notification-users.entity';
import { CoreWidgetBuilderCharts } from '../../database/entities/core-widget-builder-charts.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoreNotificationSent,
      CoreNotificationSettings,
      CoreNotificationUsers,
      CoreWidgetBuilderCharts,
    ]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
