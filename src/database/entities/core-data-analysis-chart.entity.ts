import {
  Entity,
  PrimaryColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreDataAnalysis } from './core-data-analysis.entity';

@Entity('core_data_analysis_chart')
export class CoreDataAnalysisChart {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  chartId: string;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  dataAnalysisId: string;

  @ManyToOne(() => CoreDataAnalysis, (da) => da.charts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dataAnalysisId' })
  @Index('dataAnalysis_chart_fk')
  dataAnalysis: CoreDataAnalysis;
}
