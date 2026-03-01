import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreModulesTables } from './core-modules-tables.entity';

@Entity('core_tables_field')
export class CoreTablesField {
  @PrimaryColumn({ type: 'varchar', length: 225, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 225, nullable: false })
  tId: string;

  @Column({ type: 'varchar', length: 225, nullable: false, default: '' })
  columnName: string;

  @Column({ type: 'varchar', length: 225, nullable: false, default: '' })
  columnDisplayName: string;

  @Column({ type: 'varchar', length: 25, nullable: false })
  type: string;

  @Column({ type: 'text', nullable: true, default: null })
  CreatedBy: string | null;

  @Column({
    type: 'datetime',
    precision: 6,
    nullable: false,
    default: '0001-01-01 00:00:00.000000',
  })
  CreatedOn: Date;

  @Column({ type: 'text', nullable: true, default: null })
  ModifiedBy: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true, default: null })
  ModifiedOn: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  operation: string | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: null })
  isParam: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isEncrypted: boolean;

  @Column({ type: 'int', width: 2, nullable: true, default: null })
  priority_id: number | null;

  @Column({ type: 'int', width: 4, nullable: true, default: null })
  ordinalPosition: number | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: null })
  isPrimaryKey: number | null;

  @ManyToOne(() => CoreModulesTables, (table) => table.fields)
  @JoinColumn({ name: 'tId' })
  table: CoreModulesTables;
}
