import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CoreSharedRotatingDashboard } from './core-shared-rotating-dashboard.entity';

@Entity('core_rotating_dashboard')
export class CoreRotatingDashboard {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'int', nullable: false })
  minutes: number;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isFavorite: boolean;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isDefault: boolean;

  @Column({ type: 'text', nullable: false })
  dashboardIds: string;

  @Column({ type: 'datetime', nullable: false })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @OneToMany(
    () => CoreSharedRotatingDashboard,
    (shared) => shared.rotatingDashboard,
  )
  sharedRotatingDashboards: CoreSharedRotatingDashboard[];
}
