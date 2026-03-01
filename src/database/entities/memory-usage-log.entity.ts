import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Entity representing the memory_usage_log table.
 * Logs database memory usage statistics at specific timestamps.
 */
@Entity('memory_usage_log')
export class MemoryUsageLog {
  @PrimaryColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  log_time: Date;

  @Column({ type: 'int', nullable: true, default: null })
  innodb_buffer_pages_total: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  innodb_buffer_pages_free: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  innodb_buffer_pages_data: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  key_blocks_used: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  threads_connected: number | null;
}
