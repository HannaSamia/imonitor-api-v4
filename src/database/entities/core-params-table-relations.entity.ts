import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('core_params_table_relations')
export class CoreParamsTableRelations {
  @PrimaryColumn({ type: 'varchar', length: 64, default: '' })
  fieldId: string;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  paramTableId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  paramTableFieldId: string | null;

  @PrimaryColumn({ type: 'varchar', length: 64, default: '' })
  tableId: string;

  @PrimaryColumn({ type: 'varchar', length: 64, default: '' })
  tableFieldId: string;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  paramSelectedFieldId: string | null;
}
