import { Entity, PrimaryColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CoreApplicationUsers } from './core-application-users.entity';
import { CoreApplicationRoles } from './core-application-roles.entity';

@Entity('core_privileges')
@Index('IDX_privileges_userId_moduleId', ['userId', 'moduleId'])
export class CorePrivileges {
  @PrimaryColumn({ name: 'Id', type: 'varchar', length: 255 })
  id: string;

  @Column({ name: 'UserId', type: 'varchar', length: 255, nullable: true, default: null })
  userId: string | null;

  @Column({ name: 'RoleId', type: 'varchar', length: 255, nullable: true, default: null })
  roleId: string | null;

  @Column({ name: 'ModuleId', type: 'int', nullable: false })
  moduleId: number;

  @ManyToOne(() => CoreApplicationUsers, (user) => user.privileges)
  @JoinColumn({ name: 'UserId' })
  user: CoreApplicationUsers;

  @ManyToOne(() => CoreApplicationRoles, (role) => role.privileges)
  @JoinColumn({ name: 'RoleId' })
  role: CoreApplicationRoles;
}
