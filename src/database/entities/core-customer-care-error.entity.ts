import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Entity representing the core_customer_care_error table.
 * Stores error details encountered during customer care operations.
 */
@Entity('core_customer_care_error')
export class CoreCustomerCareError {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  filePath: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  functionName: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  data: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  phone: string | null;

  @Column({
    type: 'datetime',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date | null;
}
