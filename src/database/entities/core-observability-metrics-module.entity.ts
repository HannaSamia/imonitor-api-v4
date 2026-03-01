import {
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { CoreObservabilityMetrics } from './core-observability-metrics.entity';

@Entity('core_observability_metrics_module')
export class CoreObservabilityMetricsModule {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  @Index('observabilityKpiId')
  observabilityMetricId: string;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  @Index('widgetModule_module_fk')
  moduleId: string;

  @ManyToOne(() => CoreObservabilityMetrics, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'observabilityMetricId' })
  observabilityMetric: CoreObservabilityMetrics;
}
