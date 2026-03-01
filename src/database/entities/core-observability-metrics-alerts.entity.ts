import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreObservabilityMetrics } from './core-observability-metrics.entity';

@Entity('core_observability_metrics_alerts')
export class CoreObservabilityMetricsAlerts {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'int', nullable: true, default: null })
  duration: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  subject: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  body: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  emails: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  phoneNumbers: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  users: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  level: number | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: null })
  isRepeat: number | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  observabilityMetricId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  type: string | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: 0 })
  isEmailSent: number | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  lastEmailSentAt: Date | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: 0 })
  isActivated: number | null;

  @ManyToOne(() => CoreObservabilityMetrics, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'observabilityMetricId' })
  @Index('obMetricId_fk')
  observabilityMetric: CoreObservabilityMetrics;
}
