import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { CoreApplicationRefreshToken } from './core-application-refresh-token.entity';
import { CorePrivileges } from './core-privileges.entity';

/**
 * Enum representing the available UI themes for a user.
 */
export enum UserTheme {
  DARK = 'dark',
  LIGHT = 'light',
}

@Entity('core_application_users')
export class CoreApplicationUsers {
  @PrimaryColumn({ type: 'varchar', length: 64, default: '' })
  id: string;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  firstName: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  lastName: string | null;

  @Column({ type: 'tinyint', width: 1, nullable: false })
  isLocked: boolean;

  @Column({ type: 'tinyint', width: 1, nullable: false })
  keepLogin: boolean;

  @Column({ type: 'tinyint', width: 1, nullable: false })
  allowMultipleSessions: boolean;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdOn: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  modifiedOn: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  modifiedBy: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  userName: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  email: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  phoneNumber: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  deletedBy: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true, default: null })
  deletedOn: Date | null;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isDeleted: boolean;

  @Column({ type: 'datetime', precision: 1, nullable: true, default: null })
  lastLogin: Date | null;

  @Column({ type: 'datetime', precision: 1, nullable: true, default: null })
  lastLogout: Date | null;

  @Column({
    type: 'enum',
    enum: UserTheme,
    nullable: true,
    default: UserTheme.LIGHT,
  })
  theme: UserTheme | null;

  @OneToMany(() => CoreApplicationRefreshToken, (token) => token.user)
  refreshTokens: CoreApplicationRefreshToken[];

  @OneToMany(() => CorePrivileges, (privilege) => privilege.user)
  privileges: CorePrivileges[];
}
