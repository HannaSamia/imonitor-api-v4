import {
  Entity,
  PrimaryColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreNotificationSettings } from './core-notification-settings.entity';
import { CoreApplicationUsers } from './core-application-users.entity';

/**
 * Enum representing the notification threshold status for a user.
 */
export enum NotificationUserStatus {
  UPPER = 'upper',
  MIDDLE = 'middle',
  LOWER = 'lower',
  NONE = 'none',
}

@Entity('core_notification_users')
export class CoreNotificationUsers {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  userId: string;

  @PrimaryColumn({ type: 'varchar', length: 40 })
  notificationId: string;

  @PrimaryColumn({
    type: 'enum',
    enum: NotificationUserStatus,
    default: NotificationUserStatus.NONE,
  })
  status: NotificationUserStatus;

  @ManyToOne(
    () => CoreNotificationSettings,
    (ns) => ns.notificationUsers,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'notificationId' })
  @Index('Constr_usernotification_notification_fk')
  notificationSetting: CoreNotificationSettings;

  @ManyToOne(() => CoreApplicationUsers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: CoreApplicationUsers;
}
