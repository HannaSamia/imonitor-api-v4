import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreRotatingDashboard } from './core-rotating-dashboard.entity';

@Entity('core_shared_rotating_dashboard')
export class CoreSharedRotatingDashboard {
  @PrimaryColumn({ type: 'varchar', length: 36, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  rotatingDashboardId: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'datetime', nullable: false })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @Column({ type: 'tinyint', width: 1, nullable: false, default: 0 })
  isFavorite: boolean;

  @ManyToOne(
    () => CoreRotatingDashboard,
    (rd) => rd.sharedRotatingDashboards,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'rotatingDashboardId' })
  @Index('rotatingDashBoardId_fk')
  rotatingDashboard: CoreRotatingDashboard;
}
