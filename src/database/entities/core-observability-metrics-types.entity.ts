import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('core_observability_metrics_types')
export class CoreObservabilityMetricsTypes {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  type: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  color: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  background: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  severity: number | null;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  icon: string | null;
}
