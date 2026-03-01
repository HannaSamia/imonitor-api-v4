import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
} from 'typeorm';

@Entity('core_observability_charts')
export class CoreObservabilityCharts {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  @Index('id')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: false })
  type: string;

  @Column({ type: 'text', nullable: false })
  data: string;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  updatedBy: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: 0 })
  isConnectivity: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  nodeIds: string | null;

  @Column({ type: 'tinyint', width: 4, nullable: false, default: 0 })
  isFavorite: number;
}
