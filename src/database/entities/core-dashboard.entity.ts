import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CoreDashboardWidgetBuilder } from './core-dashboard-widget-builder.entity';
import { CoreDashboardChart } from './core-dashboard-chart.entity';
import { CoreDashboardError } from './core-dashboard-error.entity';
import { CoreSharedDashboard } from './core-shared-dashboard.entity';

@Entity('core_dashboard')
export class CoreDashboard {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  options: string | null;

  @Column({ type: 'datetime', nullable: false })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isFavorite: boolean;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: 0 })
  isDefault: boolean | null;

  @OneToMany(() => CoreDashboardWidgetBuilder, (dwb) => dwb.dashboard)
  widgetBuilders: CoreDashboardWidgetBuilder[];

  @OneToMany(() => CoreDashboardChart, (chart) => chart.dashboard)
  charts: CoreDashboardChart[];

  @OneToMany(() => CoreDashboardError, (error) => error.dashboard)
  errors: CoreDashboardError[];

  @OneToMany(() => CoreSharedDashboard, (shared) => shared.dashboard)
  sharedDashboards: CoreSharedDashboard[];
}
