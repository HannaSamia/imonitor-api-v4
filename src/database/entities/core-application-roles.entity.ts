import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CorePrivileges } from './core-privileges.entity';

@Entity('core_application_roles')
export class CoreApplicationRoles {
  @PrimaryColumn({ type: 'varchar', length: 64, default: '' })
  id: string;

  @Column({ type: 'varchar', length: 64, nullable: false, default: '' })
  name: string;

  @OneToMany(() => CorePrivileges, (privilege) => privilege.role)
  privileges: CorePrivileges[];
}
