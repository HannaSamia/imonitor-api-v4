import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('core_decode_process')
export class CoreCdrDecodeProcess {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  originalFileName: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  originalFilePath: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  decodedFilePath: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  fileType: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  status: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  recordCount: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  errorMessage: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @Column({
    type: 'datetime',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date | null;
}
