import {
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { CoreObservabilityMetrics } from './core-observability-metrics.entity';

@Entity('core_observability_metrics_used_tables')
export class CoreObservabilityMetricsUsedTables {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  @Index('observabilityKpiId')
  observabilityMetricId: string;

  @PrimaryColumn({ type: 'varchar', length: 40 })
  @Index('widgetBuilder_table_fk')
  tableId: string;

  @ManyToOne(() => CoreObservabilityMetrics, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'observabilityMetricId' })
  observabilityMetric: CoreObservabilityMetrics;
}
