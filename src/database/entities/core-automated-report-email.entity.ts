import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreAutomatedReport } from './core-automated-report.entity';

@Entity('core_automated_report_email')
export class CoreAutomatedReportEmail {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  email: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  automatedReportId: string | null;

  @ManyToOne(() => CoreAutomatedReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'automatedReportId' })
  @Index('automatedReport_email_fk')
  automatedReport: CoreAutomatedReport;
}
