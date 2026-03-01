import { Entity, Column, PrimaryColumn } from 'typeorm';

export enum DecodeProcessFileType {
  SDP = 'SDP',
  AIR = 'AIR',
  CCN = 'CCN',
  TTFILE = 'TTFILE',
  ABMPG = 'ABMPG',
  UNKNOWN = 'UNKNOWN',
}

export enum DecodeProcessStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('core_decode_process')
export class CoreDecodeProcess {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  name: string | null;

  @Column({ type: 'varchar', length: 255 })
  originalFileName: string;

  @Column({ type: 'varchar', length: 512 })
  originalFilePath: string;

  @Column({ type: 'varchar', length: 512 })
  decodedFilePath: string;

  @Column({ type: 'int', nullable: true, default: 0 })
  recordCount: number | null;

  @Column({
    type: 'enum',
    enum: DecodeProcessFileType,
    nullable: true,
    default: DecodeProcessFileType.UNKNOWN,
  })
  fileType: DecodeProcessFileType | null;

  @Column({
    type: 'enum',
    enum: DecodeProcessStatus,
    nullable: true,
    default: DecodeProcessStatus.PENDING,
  })
  status: DecodeProcessStatus | null;

  @Column({ type: 'varchar', length: 36 })
  createdBy: string;

  @Column({
    type: 'datetime',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date | null;

  @Column({
    type: 'datetime',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date | null;

  @Column({ type: 'int', nullable: true, default: null })
  processId: number | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  finishedAt: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  errorMessage: string | null;
}
