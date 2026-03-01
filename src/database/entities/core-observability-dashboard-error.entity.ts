import {
  Entity,
  Column,
  PrimaryColumn,
} from 'typeorm';

/**
 * NOTE: The SQL definition for this table has NO PRIMARY KEY and all columns are nullable.
 * chartId is used as @PrimaryColumn here to satisfy TypeORM requirements,
 * but the original table truly has no PK.
 */
@Entity('core_observability_dashboard_error')
export class CoreObservabilityDashboardError {
  @Column({ type: 'text', nullable: true, default: null })
  error_stack: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  error_date: Date | null;

  // NOTE: No PK in original SQL. Using chartId as PK for TypeORM.
  @PrimaryColumn({ type: 'varchar', length: 36 })
  chartId: string;
}
