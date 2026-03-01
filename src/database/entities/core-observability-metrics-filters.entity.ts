import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreObservabilityMetrics } from './core-observability-metrics.entity';

@Entity('core_observability_metrics_filters')
export class CoreObservabilityMetricsFilters {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id: string;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: 0 })
  isDefault: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  startTime: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  endTime: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  minimum: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  maximum: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  observabilityMetricId: string | null;

  @ManyToOne(() => CoreObservabilityMetrics, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'observabilityMetricId' })
  @Index('observabilityMetricId_fk')
  observabilityMetric: CoreObservabilityMetrics;
}
