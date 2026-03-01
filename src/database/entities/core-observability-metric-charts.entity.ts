import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { CoreObservabilityCharts } from './core-observability-charts.entity';
import { CoreObservabilityMetrics } from './core-observability-metrics.entity';

/**
 * Join table between core_observability_charts and core_observability_metrics.
 * The SQL has no explicit PRIMARY KEY; chartId + metricId are used as a composite PK here.
 */
@Entity('core_observability_metric_charts')
export class CoreObservabilityMetricCharts {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  chartId: string;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  metricId: string;

  @ManyToOne(() => CoreObservabilityCharts, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'chartId' })
  @Index('chartId_fk')
  chart: CoreObservabilityCharts;

  @ManyToOne(() => CoreObservabilityMetrics, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'metricId' })
  @Index('metricId_fk')
  metric: CoreObservabilityMetrics;
}
