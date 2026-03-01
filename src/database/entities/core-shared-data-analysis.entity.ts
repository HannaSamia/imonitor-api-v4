import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CoreDataAnalysis } from './core-data-analysis.entity';

@Entity('core_shared_data_analysis')
export class CoreSharedDataAnalysis {
  @PrimaryColumn({ type: 'varchar', length: 36, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  dataAnalysisId: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'datetime', nullable: false })
  createdAt: Date;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: 0 })
  isFavorite: boolean | null;

  @ManyToOne(() => CoreDataAnalysis, (da) => da.sharedDataAnalyses)
  @JoinColumn({ name: 'dataAnalysisId' })
  dataAnalysis: CoreDataAnalysis;
}
