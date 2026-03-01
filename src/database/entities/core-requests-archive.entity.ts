import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Entity representing the core_requests_archive table.
 * Archives all HTTP requests made to the application.
 */
@Entity('core_requests_archive')
export class CoreRequestsArchive {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 11, nullable: false })
  type: string;

  @Column({ type: 'text', nullable: false })
  endpoint: string;

  @Index('requestDate_idx')
  @Column({ type: 'datetime', nullable: false })
  requestDate: Date;

  @Column({ type: 'varchar', length: 70, nullable: true, default: null })
  userid: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  payload: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true, default: null })
  host: string | null;
}
