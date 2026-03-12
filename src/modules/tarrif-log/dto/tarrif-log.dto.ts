import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class TarrifLogDto {
  @ApiProperty({ example: 123, description: 'Service class code (tarrifId) from SERVICE_CLASSES table' })
  @IsNotEmpty()
  @IsNumber()
  tarrifId: number;

  @ApiProperty({ example: '2026-03-01', description: 'Comparison base date (ISO format, not future)' })
  @IsNotEmpty()
  @IsString()
  date: string;

  @ApiProperty({
    example: '2026-02-01',
    description: 'Date to compare against (ISO format, not future, not same as date)',
  })
  @IsNotEmpty()
  @IsString()
  compareDate: string;
}

// Response interfaces (mirroring v3 DTOs)
export interface ListTarrifLogDto {
  id: string;
  date: string;
  compareDate: string;
  status: string;
  createdAt: string;
  CreatedBy: string;
  tarrif: string;
}

export interface TarrifTypeDto {
  id: number;
  name: string;
}
