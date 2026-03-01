import {
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { CoreReport } from './core-report.entity';
import { CoreModules } from './core-modules.entity';

@Entity('core_report_module')
export class CoreReportModule {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  reportId: string;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  moduleId: string;

  @ManyToOne(() => CoreReport, (report) => report.modules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reportId' })
  report: CoreReport;

  @ManyToOne(() => CoreModules, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'moduleId' })
  @Index('report_module_fk_2')
  module: CoreModules;
}
