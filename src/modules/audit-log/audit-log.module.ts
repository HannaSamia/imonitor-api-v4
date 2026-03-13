import { Module } from '@nestjs/common';
import { LegacyDataDbModule } from '../../database/legacy-data-db/legacy-data-db.module';
import { SharedModule } from '../../shared/shared.module';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

/**
 * AuditLogModule — v3 → v4 migration.
 *
 * CoreModulesTables and CoreTablesField repositories are provided by the
 * global CoreDataModule — no TypeOrmModule.forFeature needed here.
 */
@Module({
  imports: [SharedModule, LegacyDataDbModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
