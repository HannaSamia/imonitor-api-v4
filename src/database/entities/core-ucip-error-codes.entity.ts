import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Entity representing the core_ucip_error_codes table.
 * Stores UCIP (Unified Charging Interface Protocol) error codes and their messages.
 *
 * NOTE: This table has no PRIMARY KEY defined in the original SQL.
 * Using error_code as @PrimaryColumn since it is the most logical unique identifier.
 */
@Entity('core_ucip_error_codes')
export class CoreUcipErrorCodes {
  // NOTE: No PK in original SQL. Using error_code as PK for TypeORM.
  @PrimaryColumn({ type: 'varchar', length: 255 })
  error_code: string;

  @Column({ type: 'text', nullable: true, default: null })
  error_message: string | null;
}
