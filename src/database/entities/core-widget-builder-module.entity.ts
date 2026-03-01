import {
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { CoreWidgetBuilder } from './core-widget-builder.entity';
import { CoreModules } from './core-modules.entity';

@Entity('core_widget_builder_module')
export class CoreWidgetBuilderModule {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  widgetBuilderId: string;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  moduleId: string;

  @ManyToOne(() => CoreWidgetBuilder, (wb) => wb.modules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'widgetBuilderId' })
  widgetBuilder: CoreWidgetBuilder;

  @ManyToOne(() => CoreModules, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'moduleId' })
  @Index('widgetModule_module_fk')
  module: CoreModules;
}
