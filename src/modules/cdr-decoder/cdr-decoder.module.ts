import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreCdrDecodeProcess } from '../../database/entities/core-cdr-decode-process.entity';
import { SharedModule } from '../../shared/shared.module';
import { CdrDecoderController } from './cdr-decoder.controller';
import { CdrDecoderService } from './cdr-decoder.service';

@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([CoreCdrDecodeProcess])],
  controllers: [CdrDecoderController],
  providers: [CdrDecoderService],
})
export class CdrDecoderModule {}
