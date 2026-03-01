import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Entity representing the core_rate_limiter table.
 * Logs IP addresses and timestamps for rate-limiting purposes.
 */
@Entity('core_rate_limiter')
export class CoreRateLimiter {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 16, nullable: true, default: null })
  ipAddress: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdAt: Date | null;
}
