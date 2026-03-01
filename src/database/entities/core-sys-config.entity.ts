import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('core_sys_config')
@Index('key', ['confKey'])
export class CoreSysConfig {
  @PrimaryColumn({ type: 'varchar', length: 64, default: '' })
  confKey: string;

  @Column({ type: 'varchar', length: 100, nullable: false, default: '' })
  confVal: string;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: null })
  reportSetting: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: null })
  selfAnalysisSetting: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: null })
  widgetBuilderSetting: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: null })
  dashboardSetting: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: null })
  generalSetting: boolean | null;

  @Column({ type: 'tinyint', width: 64, nullable: true, default: null })
  operationSettings: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true, default: null })
  description: string | null;
}
