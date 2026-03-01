import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('core_bill_run_process')
export class CoreBillRunProcess {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500 })
  inputFilePath: string;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  outputFilePath: string | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  msisdnCount: number | null;

  @Column({ type: 'varchar', length: 8 })
  startDate: string;

  @Column({ type: 'varchar', length: 8 })
  endDate: string;

  @Column({ type: 'int', nullable: true, default: 0 })
  cdrRecordCount: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  daRecordCount: number | null;

  @Column({ type: 'varchar', length: 20, default: 'PROCESSING' })
  status: string;

  @Column({ type: 'text', nullable: true, default: null })
  errorMessage: string | null;

  @Column({ type: 'varchar', length: 36 })
  createdBy: string;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  finishedAt: Date | null;

  @Column({ type: 'int', nullable: true, default: null })
  processId: number | null;
}
