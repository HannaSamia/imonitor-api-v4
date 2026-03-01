import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreApplicationUsers } from './core-application-users.entity';

@Entity('core_application_refresh_token')
export class CoreApplicationRefreshToken {
  @PrimaryColumn({ type: 'varchar', length: 64, default: '' })
  id: string;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  used: boolean;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  invalidated: boolean;

  @Column({ type: 'varchar', length: 64, nullable: false, default: '' })
  jwtId: string;

  @Index('userId_refreshTokenid_fk')
  @Column({ type: 'varchar', length: 64, nullable: false, default: '' })
  userId: string;

  @Column({ type: 'datetime', nullable: false })
  expiryDate: Date;

  @Column({ type: 'datetime', nullable: false })
  createdOn: Date;

  @ManyToOne(() => CoreApplicationUsers, (user) => user.refreshTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: CoreApplicationUsers;
}
