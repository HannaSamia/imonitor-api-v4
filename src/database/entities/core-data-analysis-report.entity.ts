import {
  Entity,
  PrimaryColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreDataAnalysis } from './core-data-analysis.entity';

@Entity('core_data_analysis_report')
export class CoreDataAnalysisReport {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  reportId: string;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  dataAnalysisId: string;

  @ManyToOne(() => CoreDataAnalysis, (da) => da.reports, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dataAnalysisId' })
  @Index('dataAnalysis_report_fk')
  dataAnalysis: CoreDataAnalysis;
}
