import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CoreReportCharts } from './core-report-charts.entity';
import { CoreReportModule } from './core-report-module.entity';
import { CoreReportUsedTable } from './core-report-used-table.entity';
import { CoreSharedReport } from './core-shared-report.entity';
import { CoreSharedQbeReport } from './core-shared-qbe-report.entity';

/**
 * Enum representing the available time filter intervals for a report.
 */
export enum ReportTimeFilter {
  MINUTES = 'minutes',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

@Entity('core_report')
export class CoreReport {
  @PrimaryColumn({ type: 'varchar', length: 36, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isFavorite: boolean;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isDefault: boolean;

  @Column({ type: 'datetime', nullable: false })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @Column({ type: 'datetime', nullable: false })
  fromDate: Date;

  @Column({ type: 'datetime', nullable: false })
  toDate: Date;

  @Column({
    type: 'enum',
    enum: ReportTimeFilter,
    nullable: false,
  })
  timeFilter: ReportTimeFilter;

  @Column({ type: 'int', unsigned: true, nullable: true, default: null })
  limit: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  tables: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  globalFilter: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  orderBy: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  control: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  operation: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  compare: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  options: string | null;

  @Column({ type: 'int', width: 11, nullable: true, default: 0 })
  globalOrderIndex: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  sql: string | null;

  @Column({ type: 'tinyint', width: 4, nullable: false, default: 0 })
  isQbe: number;

  @OneToMany(() => CoreReportCharts, (chart) => chart.report)
  charts: CoreReportCharts[];

  @OneToMany(() => CoreReportModule, (module) => module.report)
  modules: CoreReportModule[];

  @OneToMany(() => CoreReportUsedTable, (usedTable) => usedTable.report)
  usedTables: CoreReportUsedTable[];

  @OneToMany(() => CoreSharedReport, (shared) => shared.report)
  sharedReports: CoreSharedReport[];

  @OneToMany(() => CoreSharedQbeReport, (shared) => shared.report)
  sharedQbeReports: CoreSharedQbeReport[];
}
