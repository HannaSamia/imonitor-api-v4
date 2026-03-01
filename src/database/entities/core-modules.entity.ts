import { Entity, PrimaryColumn, Column, Index, OneToMany } from 'typeorm';
import { CoreModulesTables } from './core-modules-tables.entity';

@Entity('core_modules')
export class CoreModules {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'int', width: 5, nullable: true, default: null })
  @Index('parent_key_idx')
  pId: number | null;

  @Column({ type: 'tinyint', width: 1, nullable: false })
  isMenuItem: boolean;

  @Column({ type: 'int', width: 3, nullable: false })
  priority: number;

  @Column({ type: 'varchar', length: 50, nullable: false })
  name: string;

  @Column({ type: 'tinyint', width: 1, nullable: false })
  isDefault: boolean;

  @Column({ type: 'int', nullable: true, default: null })
  nestedLevel: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  icon: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  path: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true, default: null })
  lightColor: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true, default: '#1f1f1f' })
  darkColor: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true, default: null })
  font: string | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: null })
  isNode: boolean | null;

  @OneToMany(() => CoreModulesTables, (table) => table.module)
  tables: CoreModulesTables[];
}
