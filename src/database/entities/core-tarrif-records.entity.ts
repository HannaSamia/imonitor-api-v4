import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('core_tarrif_records')
export class CoreTarrifRecords {
  @PrimaryColumn({ type: 'int' })
  treeId: number;

  @PrimaryColumn({ type: 'datetime' })
  fileDate: Date;

  @Column({ type: 'varchar', length: 150 })
  fileName: string;
}
