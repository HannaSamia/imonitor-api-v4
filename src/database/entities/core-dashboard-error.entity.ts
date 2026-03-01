import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreDashboard } from './core-dashboard.entity';

@Entity('core_dashboard_error')
export class CoreDashboardError {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'text', nullable: true, default: null })
  errorstack: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  errorDate: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  dashboardId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  widgetBuilderId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  chartId: string | null;

  @ManyToOne(() => CoreDashboard, (dashboard) => dashboard.errors)
  @JoinColumn({ name: 'dashboardId' })
  dashboard: CoreDashboard;
}
