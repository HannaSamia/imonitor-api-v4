import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('core_automated_report_cleaning')
export class CoreAutomatedReportCleaning {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  processId: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  runDate: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  errorStack: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  errorOn: Date | null;

  @Column({ type: 'int', nullable: true, default: null })
  nbOfDeletedFiles: number | null;
}
