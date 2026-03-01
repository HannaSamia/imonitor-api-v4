import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CoreDashboard } from './core-dashboard.entity';

@Entity('core_shared_dashboard')
export class CoreSharedDashboard {
  @PrimaryColumn({ type: 'varchar', length: 36, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  dashboardId: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'datetime', nullable: false })
  createdAt: Date;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: 0 })
  isFavorite: boolean | null;

  @ManyToOne(() => CoreDashboard, (dashboard) => dashboard.sharedDashboards)
  @JoinColumn({ name: 'dashboardId' })
  dashboard: CoreDashboard;
}
