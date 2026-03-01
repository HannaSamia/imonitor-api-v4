import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('core_connectivity_tables')
export class CoreConnectivityTables {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 150, nullable: true, default: null })
  tableName: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  minutlyBackPeriod: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  whereCondition: string | null;
}
