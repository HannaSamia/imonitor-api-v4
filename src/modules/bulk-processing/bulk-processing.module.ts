import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreBulkProcess } from '../../database/entities/core-bulk-process.entity';
import { CoreBulkProcessFailure } from '../../database/entities/core-bulk-process-failure.entity';
import { CoreBulkProcessMethod } from '../../database/entities/core-bulk-process-method.entity';
import { LegacyDataDbModule } from '../../database/legacy-data-db/legacy-data-db.module';
import { SharedModule } from '../../shared/shared.module';
import { BulkProcessingController } from './bulk-processing.controller';
import { BulkProcessingService } from './bulk-processing.service';

@Module({
  imports: [
    SharedModule,
    LegacyDataDbModule,
    TypeOrmModule.forFeature([CoreBulkProcess, CoreBulkProcessMethod, CoreBulkProcessFailure]),
  ],
  controllers: [BulkProcessingController],
  providers: [BulkProcessingService],
  exports: [BulkProcessingService],
})
export class BulkProcessingModule {}
