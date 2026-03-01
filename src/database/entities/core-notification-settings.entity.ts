import { Entity, PrimaryColumn, Column, Index, OneToMany } from 'typeorm';
import { CoreNotificationSent } from './core-notification-sent.entity';
import { CoreNotificationUsers } from './core-notification-users.entity';

@Entity('core_notification_settings')
export class CoreNotificationSettings {
  @PrimaryColumn({ type: 'varchar', length: 36, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  @Index('chart_notification_fk')
  chartId: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  @Index('idx_core_notifications_settings_widgetBuilderId_isDeleted')
  @Index('idx_core_notifications_settings_widgetBuilderId')
  widgetBuilderId: string;

  @Column({
    type: 'datetime',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @Column({
    type: 'datetime',
    nullable: true,
    default: null,
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  updatedBy: string | null;

  @OneToMany(() => CoreNotificationSent, (sent) => sent.notificationSetting)
  notificationsSent: CoreNotificationSent[];

  @OneToMany(
    () => CoreNotificationUsers,
    (nu) => nu.notificationSetting,
  )
  notificationUsers: CoreNotificationUsers[];
}
