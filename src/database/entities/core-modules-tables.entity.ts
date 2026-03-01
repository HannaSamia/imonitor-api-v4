import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { CoreModules } from './core-modules.entity';
import { CoreTablesField } from './core-tables-field.entity';

@Entity('core_modules_tables')
export class CoreModulesTables {
  @PrimaryColumn({ type: 'varchar', length: 225 })
  id: string;

  @Column({ type: 'int', width: 25, nullable: false })
  mId: number;

  @Column({ type: 'varchar', length: 100, nullable: false, default: '' })
  tableName: string;

  @Column({ type: 'varchar', length: 45, nullable: false, default: '' })
  displayName: string;

  @Column({ type: 'int', nullable: true, default: null })
  statInterval: number | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  startTime: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  tableHourName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  tableDayName: string | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: null })
  isGroupedByHourly: number | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: null })
  isGroupedByDaily: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  tableType: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  CreatedBy: string | null;

  @Column({
    type: 'datetime',
    precision: 6,
    nullable: true,
    default: '0001-01-01 00:00:00.000000',
  })
  CreatedOn: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  ModifiedBy: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true, default: null })
  ModifiedOn: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  paramsTable: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  paramsNodeName: string | null;

  @Column({ type: 'varchar', length: 25, nullable: true, default: '' })
  nodeNameColumn: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    default: 'stat_date',
  })
  statDateNameColumn: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  priority: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  gracePeriodMinutes: number | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: null })
  isMonitored: boolean | null;

  @Column({ type: 'tinyint', width: 4, nullable: true, default: null })
  isView: number | null;

  @Column({ type: 'int', width: 6, nullable: true, default: null })
  allowedGap: number | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  lastTriggered: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  exampleNumericField: string | null;

  @ManyToOne(() => CoreModules, (module) => module.tables)
  @JoinColumn({ name: 'mId' })
  module: CoreModules;

  @OneToMany(() => CoreTablesField, (field) => field.table)
  fields: CoreTablesField[];
}
