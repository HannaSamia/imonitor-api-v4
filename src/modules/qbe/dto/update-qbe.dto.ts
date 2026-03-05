import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsArray, IsObject } from 'class-validator';
import { IReportOptions, IChartData } from '../../reports/dto/report-interfaces';

/**
 * Request body for updating an existing QBE report.
 * Mirrors v3 UpdateQbeDto.
 */
export class UpdateQbeDto {
  @ApiProperty({ description: 'QBE report ID' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'QBE name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Time filter interval' })
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

  @ApiProperty({ description: 'Global order index' })
  @IsNumber()
  globalOrderIndex: number;

  @ApiProperty({ description: 'Report options' })
  @IsObject()
  options: IReportOptions;

  @ApiProperty({ description: 'Chart definitions', type: 'array' })
  @IsArray()
  charts: Array<IChartData>;

  @ApiProperty({ description: 'Raw SQL query' })
  @IsString()
  @IsNotEmpty()
  sql: string;

  @ApiProperty({ description: 'Chart statuses keyed by chart ID (created/edited/deleted)' })
  @IsObject()
  chartsStatus: Record<string, string>;
}
