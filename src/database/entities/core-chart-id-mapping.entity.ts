import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Entity representing the core_chart_id_mapping table.
 * Maps old chart/widget IDs to new IDs for a given base entity.
 *
 * NOTE: This table has no PRIMARY KEY defined in the original SQL.
 * Using baseId as @PrimaryColumn since it is the most logical grouping identifier,
 * but this table may contain duplicate baseId values. Consider adding a composite key
 * or synthetic PK if strict uniqueness is required.
 */
@Entity('core_chart_id_mapping')
export class CoreChartIdMapping {
  // NOTE: No PK in original SQL. Using baseId as PK for TypeORM (may have duplicates).
  @PrimaryColumn({ type: 'varchar', length: 50 })
  baseId: string;

  @Column({ type: 'varchar', length: 80, nullable: true, default: null })
  oldId: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true, default: null })
  newId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  type: string | null;
}
