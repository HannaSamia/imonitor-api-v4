import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { CoreWidgetBuilder } from './core-widget-builder.entity';

@Entity('core_widget_builder_used_tables')
export class CoreWidgetBuilderUsedTables {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  widgetBuilderId: string;

  @PrimaryColumn({ type: 'varchar', length: 40 })
  @Index('widgetBuilder_table_fk')
  tableId: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  tableName: string;

  @ManyToOne(() => CoreWidgetBuilder, (wb) => wb.usedTables, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'widgetBuilderId' })
  widgetBuilder: CoreWidgetBuilder;
}
