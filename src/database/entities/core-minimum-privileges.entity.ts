import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CoreApplicationRoles } from './core-application-roles.entity';

@Entity('core_minimum_privileges')
@Index('IDX_minPriv_request_method', ['request', 'method'])
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

  @ManyToOne(() => CoreApplicationRoles)
  @JoinColumn({ name: 'roleRequired', referencedColumnName: 'id' })
  role: CoreApplicationRoles;
}
