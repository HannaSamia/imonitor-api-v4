import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { CoreReport } from './core-report.entity';

@Entity('core_report_used_table')
export class CoreReportUsedTable {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  reportId: string;

  @PrimaryColumn({ type: 'varchar', length: 50 })
  tableId: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  tableName: string;

  @ManyToOne(() => CoreReport, (report) => report.usedTables, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reportId' })
  report: CoreReport;
}
