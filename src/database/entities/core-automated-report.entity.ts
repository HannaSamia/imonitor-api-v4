import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

/**
 * NOTE: The SQL table `core_automated_report` has NO primary key constraint.
 * It only has an INDEX on `id`, not a PRIMARY KEY.
 * We use @PrimaryColumn() here because TypeORM requires a primary key,
 * but be aware this does not match the actual database schema.
 */
@Entity('core_automated_report')
@Index('id', ['id'])
export class CoreAutomatedReport {
  // SQL: `id` varchar(36) NULL DEFAULT NULL with INDEX, not a PRIMARY KEY.
  // TypeORM requires a PK, so we use @PrimaryColumn without nullable.
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  ownerId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  reportId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  title: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  timeFilter: string | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: null })
  isActive: number | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  createdOn: Date | null;

  @Column({
    type: 'datetime',
    nullable: true,
    default: null,
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedOn: Date | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  reportHourInterval: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  reportDayInterval: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  relativeHour: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  relativeDay: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  processId: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  lastRunDate: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  exportType: string | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: null })
  isDeleted: number | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  deletedOn: Date | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  recurringHours: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  recurringDays: number | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  firstOccurence: Date | null;

  @Column({ type: 'varchar', length: 6, nullable: true, default: null })
  method: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  activatedOn: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  emailSubject: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  emailDescription: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  errorStack: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  errorOn: Date | null;
}
