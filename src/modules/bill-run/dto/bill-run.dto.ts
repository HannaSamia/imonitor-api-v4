import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddBillRunDto {
  @ApiProperty({ example: 'March 2026 Bill Run' })
  @IsNotEmpty()
  @IsString()
  name: string;
}

// Response interfaces (mirroring v3 DTOs)
export interface ListBillRunDto {
  id: string;
  name: string;
  status: string;
  msisdnCount: number;
  cdrRecordCount: number;
  daRecordCount: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  createdBy: string;
}

export interface BillRunWorkDto {
  id: string;
  inputFilePath: string;
  outputFilePath: string;
  startDate: string;
  endDate: string;
}
