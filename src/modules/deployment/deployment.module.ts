import { Module } from '@nestjs/common';
import { LegacyDataDbModule } from '../../database/legacy-data-db/legacy-data-db.module';
import { SharedModule } from '../../shared/shared.module';
import { DeploymentController } from './deployment.controller';
import { DeploymentService } from './deployment.service';

/**
 * DeploymentModule — v3 → v4 migration.
 *
 * CoreModulesTables, CoreTablesField, CoreModules, CorePrivileges,
 * CoreApplicationUsers, CoreApplicationRoles repositories are all provided
 * by the global CoreDataModule — no TypeOrmModule.forFeature needed here.
 */
@Module({
  imports: [SharedModule, LegacyDataDbModule],
  controllers: [DeploymentController],
  providers: [DeploymentService],
  exports: [DeploymentService],
})
export class DeploymentModule {}
