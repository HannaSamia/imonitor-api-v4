import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean } from 'class-validator';

/**
 * Request body for executing a QBE query.
 * Mirrors v3 ProcessQbeDto.
 */
export class ProcessQbeDto {
  @ApiProperty({ description: 'Time filter interval (minutes, hourly, daily, weekly, monthly, yearly)' })
  @IsString()
  @IsNotEmpty()
  timeFilter: string;

  @ApiProperty({ description: 'Date range start' })
  @IsString()
  @IsNotEmpty()
  fromDate: string;

  @ApiProperty({ description: 'Date range end' })
  @IsString()
  @IsNotEmpty()
  toDate: string;

  @ApiProperty({ description: 'Raw SQL query with _fromDate_ and _toDate_ placeholders' })
  @IsString()
  @IsNotEmpty()
  sql: string;

  @ApiProperty({ description: 'Whether this query is from a shared QBE' })
  @IsBoolean()
  isShared: boolean;
}
