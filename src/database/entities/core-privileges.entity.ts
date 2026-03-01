import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CoreApplicationUsers } from './core-application-users.entity';
import { CoreApplicationRoles } from './core-application-roles.entity';

@Entity('core_privileges')
export class CorePrivileges {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  Id: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  UserId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  RoleId: string | null;

  @Column({ type: 'int', nullable: false })
  ModuleId: number;

  @ManyToOne(() => CoreApplicationUsers, (user) => user.privileges)
  @JoinColumn({ name: 'UserId' })
  user: CoreApplicationUsers;

  @ManyToOne(() => CoreApplicationRoles, (role) => role.privileges)
  @JoinColumn({ name: 'RoleId' })
  role: CoreApplicationRoles;
}
