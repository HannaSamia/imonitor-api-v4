import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Enum representing the status of a trace operation.
 */
export enum TraceTrackerStatus {
  SET = 'set',
  UNSET = 'unset',
}

/**
 * Entity representing the core_trace_tracker table.
 * Tracks trace set/unset operations on phone numbers across nodes.
 */
@Entity('core_trace_tracker')
export class CoreTraceTracker {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Index('idx_trace_status')
  @Column({
    type: 'enum',
    enum: TraceTrackerStatus,
    nullable: false,
  })
  status: TraceTrackerStatus;

  @Index('idx_trace_node')
  @Column({ type: 'varchar', length: 15, nullable: true, default: null })
  node: string | null;

  @Index('idx_trace_phoneNumber')
  @Column({ type: 'varchar', length: 15, nullable: true, default: null })
  phoneNumber: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdby: string | null;
}
