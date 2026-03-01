import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreAutomatedReport } from './core-automated-report.entity';

@Entity('core_automated_report_sftp')
export class CoreAutomatedReportSftp {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  username: string | null;

  @Column({ type: 'varbinary', length: 200, nullable: true, default: null })
  password: Buffer | null;

  @Column({ type: 'varchar', length: 16, nullable: true, default: null })
  host: string | null;

  @Column({ type: 'varchar', length: 5000, nullable: true, default: null })
  path: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  automatedReportId: string | null;

  @ManyToOne(() => CoreAutomatedReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'automatedReportId' })
  @Index('automatedReport_sftp_fk')
  automatedReport: CoreAutomatedReport;
}
