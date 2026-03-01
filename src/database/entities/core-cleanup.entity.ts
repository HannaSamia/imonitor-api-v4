import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Entity representing the core_cleanup table.
 * Tracks cleanup process execution history and any errors encountered.
 */
@Entity('core_cleanup')
export class CoreCleanup {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  processId: string | null;

  @Index('date_idx')
  @Column({ type: 'datetime', nullable: true, default: null })
  runDate: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  errorStack: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  errorOn: Date | null;
}
