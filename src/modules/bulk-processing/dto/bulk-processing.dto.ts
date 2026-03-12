import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { BulkMethodsType } from '../enums/bulk-process.enum';

export class AddBulkProcessDto {
  @ApiProperty({ example: 'My Bulk Job' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 1 })
  @IsNotEmpty()
  @IsNumber()
  methodId: number;
}

export class ScheduleBulkProcessDto extends AddBulkProcessDto {
  @ApiProperty({ example: '2026-03-12 10:00:00', description: 'Scheduled execution datetime' })
  @IsNotEmpty()
  @IsString()
  date: string;
}

export class UpdateBulkProcessDto {
  @ApiProperty({ example: 'uuid-string' })
  @IsNotEmpty()
  @IsString()
  id: string;

  @ApiProperty({ example: 'My Bulk Job Updated' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'GetBalanceAndDate' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ example: '2026-03-12 10:00:00' })
  @IsOptional()
  @IsString()
  date?: string;
}

export class BulkListQueryDto {
  @ApiProperty({ enum: BulkMethodsType, example: BulkMethodsType.AIR })
  @IsEnum(BulkMethodsType)
  type: BulkMethodsType;
}

// Response interfaces (mirroring v3 DTOs)
export interface ListBulkProcessDto {
  id: string;
  name: string;
  status: string;
  method: string;
  processingDate: string;
  createdBy: string;
  CreatedAt: string;
}

export interface BulkProcessMethodsDto {
  id: number;
  name: string;
  headerSample: string;
}

export interface BulkAirServerDto {
  id: string;
  name: string;
}

export interface BulkProcessWorkDto {
  id: string;
  method: string;
  fileName: string;
  type: string;
}
