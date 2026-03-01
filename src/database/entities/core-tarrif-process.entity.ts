import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('core_tarrif_process')
export class CoreTarrifProcess {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'int', default: 0 })
  tarrifId: number;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  serviceClassId: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  compareDate: Date | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  compareToDate: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'pending' })
  status: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  sdpName: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdAt: Date | null;

  @Column({ type: 'int', nullable: true, default: null })
  processId: number | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  processStartDate: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  errorStack: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  errorOn: Date | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: 0 })
  isDeleted: number | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  deletedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  deletedBy: string | null;
}
