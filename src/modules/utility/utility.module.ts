import { Module } from '@nestjs/common';
import { LegacyDataDbModule } from '../../database/legacy-data-db/legacy-data-db.module';
import { LegacyEtlDbModule } from '../../database/legacy-etl-db/legacy-etl-db.module';
import { SharedModule } from '../../shared/shared.module';
import { UtilityController } from './utility.controller';
import { UtilityService } from './utility.service';

@Module({
  imports: [SharedModule, LegacyDataDbModule, LegacyEtlDbModule],
  controllers: [UtilityController],
  providers: [UtilityService],
  exports: [UtilityService],
})
export class UtilityModule {}
