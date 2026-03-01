import {
  Entity,
  PrimaryColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreDashboard } from './core-dashboard.entity';

@Entity('core_dashboard_chart')
export class CoreDashboardChart {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  chartId: string;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  dashboardId: string;

  @ManyToOne(() => CoreDashboard, (dashboard) => dashboard.charts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dashboardId' })
  @Index('dataAnalysis_chart_fk')
  dashboard: CoreDashboard;
}
