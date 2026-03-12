import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { CompressionType, CdrFileType } from '../enums/cdr-decoder.enum';

export class DecodeBodyDto {
  @ApiProperty({ example: 'My CDR Decode Job' })
  @IsNotEmpty()
  @IsString()
  name: string;
}

// Response interfaces (mirroring v3 DTOs)
export interface ListCdrDecodeDto {
  id: string;
  name: string;
  originalFileName: string;
  fileType: string;
  status: string;
  recordCount: number;
  createdAt: string;
  createdBy: string;
}

export interface CdrDecoderWorkDto {
  id: string;
  originalFilePath: string;
  decodedFilePath: string;
  scriptPath: string;
  compressionType: CompressionType;
  fileType: CdrFileType;
}
