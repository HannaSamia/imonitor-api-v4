import {
  Entity,
  Column,
  PrimaryColumn,
} from 'typeorm';

@Entity('core_observability_dashboard')
export class CoreObservabilityDashboard {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  updatedBy: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  title: string | null;

  @Column({ type: 'tinyint', width: 4, nullable: false, default: 0 })
  isFavorite: number;
}
