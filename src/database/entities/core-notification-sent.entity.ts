import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreNotificationSettings } from './core-notification-settings.entity';

@Entity('core_notification_sent')
export class CoreNotificationSent {
  @PrimaryColumn({ type: 'varchar', length: 36, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  @Index('idx_core_notifications_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  notificationId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  chartName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: false })
  widgetBuilderName: string;

  @Column({ type: 'text', nullable: true, default: null })
  message: string | null;

  @Column({ type: 'varchar', length: 30, nullable: false })
  type: string;

  @Column({ type: 'varchar', length: 40, nullable: false })
  color: string;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  viewed: boolean;

  @Column({ type: 'datetime', nullable: true, default: null })
  viewedAt: Date | null;

  @Column({
    type: 'datetime',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date | null;

  @Column({
    type: 'datetime',
    nullable: true,
    default: null,
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date | null;

  @ManyToOne(
    () => CoreNotificationSettings,
    (ns) => ns.notificationsSent,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'notificationId' })
  @Index('notification_sent_fk')
  notificationSetting: CoreNotificationSettings;
}
