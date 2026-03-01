import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CoreDataAnalysisChart } from './core-data-analysis-chart.entity';
import { CoreDataAnalysisReport } from './core-data-analysis-report.entity';
import { CoreSharedDataAnalysis } from './core-shared-data-analysis.entity';

@Entity('core_data_analysis')
export class CoreDataAnalysis {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  options: string | null;

  @Column({ type: 'datetime', nullable: false })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isFavorite: boolean;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isDefault: boolean;

  @OneToMany(() => CoreDataAnalysisChart, (chart) => chart.dataAnalysis)
  charts: CoreDataAnalysisChart[];

  @OneToMany(() => CoreDataAnalysisReport, (report) => report.dataAnalysis)
  reports: CoreDataAnalysisReport[];

  @OneToMany(() => CoreSharedDataAnalysis, (shared) => shared.dataAnalysis)
  sharedDataAnalyses: CoreSharedDataAnalysis[];
}
