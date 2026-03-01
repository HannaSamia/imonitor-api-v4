import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Entity representing the core_malicious_requests table.
 * Tracks malicious or suspicious requests made to the application.
 */
@Entity('core_malicious_requests')
export class CoreMaliciousRequests {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'text', nullable: true, default: null })
  endpoint: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  method: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true, default: null })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  headers: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdAT: Date | null;
}
