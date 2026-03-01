import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreReport } from './core-report.entity';

@Entity('core_shared_qbe_report')
export class CoreSharedQbeReport {
  @PrimaryColumn({ type: 'varchar', length: 36, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  reportId: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'datetime', nullable: false })
  createdAt: Date;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: 0 })
  isFavorite: boolean | null;

  @ManyToOne(() => CoreReport, (report) => report.sharedQbeReports, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reportId' })
  @Index('qbeReportId_fk')
  report: CoreReport;
}
