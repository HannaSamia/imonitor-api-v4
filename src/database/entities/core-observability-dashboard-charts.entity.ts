import {
  Entity,
  Column,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * NOTE: The SQL definition for this table has NO PRIMARY KEY.
 * dashboardId + chartId are used as a composite PK here to satisfy TypeORM requirements.
 */
@Entity('core_observability_dashboard_charts')
export class CoreObservabilityDashboardCharts {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  dashboardId: string;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  @Index('chartId_fk2')
  chartId: string;

  @Column({ type: 'text', nullable: true, default: null })
  options: string | null;
}
