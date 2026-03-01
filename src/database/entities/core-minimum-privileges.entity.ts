import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('core_minimum_privileges')
export class CoreMinimumPrivileges {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: false })
  request: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  roleRequired: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  method: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  moduleId: number | null;
}
