import { Entity, PrimaryColumn } from 'typeorm';

/**
 * Entity representing the ref_numbers table.
 * A reference/utility table containing a sequence of integers (0-999).
 * Uses latin1 charset as defined in the original SQL.
 */
@Entity('ref_numbers')
export class RefNumbers {
  @PrimaryColumn({ type: 'int' })
  n: number;
}
