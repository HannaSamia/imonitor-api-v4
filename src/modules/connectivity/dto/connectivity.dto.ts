import { IsISO8601, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ConnectivityFilter } from '../../../shared/enums';

export class ConnectivityHistoryParamsDto {
  @ApiProperty({ description: 'Start date (ISO 8601)', example: '2026-03-01T00:00:00Z' })
  @IsISO8601()
  @IsNotEmpty()
  fromdate: string;

  @ApiProperty({ description: 'End date (ISO 8601)', example: '2026-03-11T23:59:59Z' })
  @IsISO8601()
  @IsNotEmpty()
  todate: string;

  @ApiProperty({ description: 'Status filter', enum: ConnectivityFilter, example: ConnectivityFilter.ALL })
  @IsEnum(ConnectivityFilter)
  @IsNotEmpty()
  filter: ConnectivityFilter;
}
