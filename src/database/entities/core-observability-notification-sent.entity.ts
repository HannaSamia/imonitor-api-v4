import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
} from 'typeorm';

@Entity('core_observability_notification_sent')
export class CoreObservabilityNotificationSent {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  @Index('idx_core_notifications_userId')
  userId: string;

  @Column({ type: 'text', nullable: true, default: null })
  message: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  type: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true, default: null })
  color: string | null;

  @Column({ type: 'datetime', nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  metricId: string | null;
}
