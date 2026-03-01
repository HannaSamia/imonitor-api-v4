import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('core_bulk_process_method')
export class CoreBulkProcessMethod {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  headerSample: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  responseHeaderSample: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true, default: null })
  type: string | null;
}
