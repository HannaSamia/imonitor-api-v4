import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity('core_observability_metrics_thresholds')
export class CoreObservabilityMetricsThresholds {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', nullable: false })
  minimum: number;

  @Column({ type: 'int', nullable: false })
  maximum: number;

  @Column({ type: 'varchar', length: 30, nullable: false })
  type: string;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: 0 })
  isRecursiveAlert: number | null;

  @Column({ type: 'varchar', length: 36, nullable: false })
  @Index('observabilityMetricFilterId_fk')
  observabilityMetricFilterId: string;
}
