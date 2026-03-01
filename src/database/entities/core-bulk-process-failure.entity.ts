import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('core_bulk_process_failure')
export class CoreBulkProcessFailure {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'text', nullable: true, default: null })
  value: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true, default: null })
  method: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  airIp: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  reason: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  proccessId: string | null;

  @Column({
    type: 'datetime',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date | null;
}
