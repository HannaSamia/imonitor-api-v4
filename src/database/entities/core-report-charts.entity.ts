import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreReport } from './core-report.entity';

@Entity('core_report_charts')
export class CoreReportCharts {
  @PrimaryColumn({ type: 'varchar', length: 36, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: false })
  type: string;

  @Column({ type: 'int', width: 10, nullable: false })
  orderIndex: number;

  @Column({ type: 'text', nullable: false })
  data: string;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 36, nullable: false })
  reportId: string;

  @ManyToOne(() => CoreReport, (report) => report.charts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reportId' })
  @Index('repott_fk')
  report: CoreReport;
}
