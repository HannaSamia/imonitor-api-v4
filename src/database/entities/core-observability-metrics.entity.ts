import {
  Entity,
  Column,
  PrimaryColumn,
} from 'typeorm';

@Entity('core_observability_metrics')
export class CoreObservabilityMetrics {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  tables: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  metricField: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  globalFilter: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  orderBy: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  control: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  operation: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  compare: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  options: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  metricQuery: string | null;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'int', nullable: true, default: null })
  limit: number | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: 0 })
  isDefault: number | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: 0 })
  isFavorite: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  nodeIds: string | null;

  @Column({ type: 'datetime', nullable: false })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  updatedBy: string | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: null })
  isExploded: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  chartsPerRow: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  type: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  explodedField: string | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: 0 })
  isError: number | null;
}
