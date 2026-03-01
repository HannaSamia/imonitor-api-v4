import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('core_connectifity_notifications')
export class CoreConnectifityNotifications {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 64, nullable: false, default: '' })
  title: string;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  subtitle: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true, default: null })
  message: string | null;

  @Column({ type: 'varchar', length: 64, nullable: false, default: '' })
  type: string;

  @Column({ type: 'varchar', length: 64, nullable: false, default: '' })
  userId: string;

  @Column({ type: 'varchar', length: 64, nullable: false, default: '' })
  color: string;

  @Column({ type: 'varchar', length: 64, nullable: false, default: '' })
  status: string;

  @Column({
    type: 'datetime',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date | null;
}
