import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreWidgetBuilder } from './core-widget-builder.entity';

@Entity('core_widget_builder_charts')
export class CoreWidgetBuilderCharts {
  @PrimaryColumn({ type: 'varchar', length: 36, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: false })
  type: string;

  @Column({ type: 'int', width: 10, nullable: false })
  orderIndex: number;

  @Column({ type: 'text', nullable: false })
  data: string;

  @Column({ type: 'text', nullable: false, default: '{}' })
  notification: string;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 36, nullable: false })
  widgetBuilderId: string;

  @ManyToOne(() => CoreWidgetBuilder, (wb) => wb.charts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'widgetBuilderId' })
  @Index('repott_fk')
  widgetBuilder: CoreWidgetBuilder;
}
