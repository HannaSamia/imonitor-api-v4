import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('core_bulk_process')
export class CoreBulkProcess {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  fileOriginalName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  method: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  status: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  inputFile: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  outputFile: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  airs: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  processingDate: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdAt: Date | null;

  @Column({
    type: 'datetime',
    nullable: true,
    default: null,
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  finishDate: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  updatedBy: string | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: 0 })
  isDeleted: number | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  deletedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  deletedBy: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true, default: null })
  type: string | null;
}
