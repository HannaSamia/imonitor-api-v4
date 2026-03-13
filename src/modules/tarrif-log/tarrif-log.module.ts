import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { LegacyDataDbModule } from '../../database/legacy-data-db/legacy-data-db.module';
import { CoreTarrifProcess } from '../../database/entities/core-tarrif-process.entity';
import { CoreTarrifRecords } from '../../database/entities/core-tarrif-records.entity';
import { TarrifLogController } from './tarrif-log.controller';
import { TarrifLogService } from './tarrif-log.service';

@Module({
  imports: [SharedModule, LegacyDataDbModule, TypeOrmModule.forFeature([CoreTarrifProcess, CoreTarrifRecords])],
  controllers: [TarrifLogController],
  providers: [TarrifLogService],
})
export class TarrifLogModule {}
