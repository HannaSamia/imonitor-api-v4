import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreBillRunProcess } from '../../database/entities/core-bill-run-process.entity';
import { LegacyPrestoModule } from '../../database/legacy-presto/legacy-presto.module';
import { SharedModule } from '../../shared/shared.module';
import { BillRunController } from './bill-run.controller';
import { BillRunService } from './bill-run.service';

@Module({
  imports: [SharedModule, LegacyPrestoModule, TypeOrmModule.forFeature([CoreBillRunProcess])],
  controllers: [BillRunController],
  providers: [BillRunService],
})
export class BillRunModule {}
