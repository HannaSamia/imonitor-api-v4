import {
  Entity,
  PrimaryColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreDashboard } from './core-dashboard.entity';

@Entity('core_dashboard_widget_builder')
export class CoreDashboardWidgetBuilder {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  widgetBuilderId: string;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  dashboardId: string;

  @ManyToOne(() => CoreDashboard, (dashboard) => dashboard.widgetBuilders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dashboardId' })
  @Index('dataAnalysis_report_fk')
  dashboard: CoreDashboard;
}
