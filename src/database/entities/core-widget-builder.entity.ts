import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CoreWidgetBuilderCharts } from './core-widget-builder-charts.entity';
import { CoreWidgetBuilderModule } from './core-widget-builder-module.entity';
import { CoreWidgetBuilderUsedTables } from './core-widget-builder-used-tables.entity';

@Entity('core_widget_builder')
export class CoreWidgetBuilder {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isFavorite: boolean;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isDefault: boolean;

  @Column({ type: 'datetime', nullable: false })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @Column({ type: 'int', width: 10, nullable: true, default: null })
  limit: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  tables: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  globalFilter: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  orderBy: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  control: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  operation: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  compare: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  priority: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  inclusion: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  options: string | null;

  @Column({ type: 'int', width: 11, nullable: true, default: null })
  globalOrderIndex: number | null;

  @OneToMany(() => CoreWidgetBuilderCharts, (chart) => chart.widgetBuilder)
  charts: CoreWidgetBuilderCharts[];

  @OneToMany(() => CoreWidgetBuilderModule, (module) => module.widgetBuilder)
  modules: CoreWidgetBuilderModule[];

  @OneToMany(
    () => CoreWidgetBuilderUsedTables,
    (usedTable) => usedTable.widgetBuilder,
  )
  usedTables: CoreWidgetBuilderUsedTables[];
}
