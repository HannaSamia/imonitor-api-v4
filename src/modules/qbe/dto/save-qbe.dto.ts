import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsArray, IsObject } from 'class-validator';
import { IReportOptions, IChartData } from '../../reports/dto/report-interfaces';

/**
 * Request body for saving a new QBE report.
 * Mirrors v3 SaveQbeDto. Stores in core_report with isQbe = true.
 */
export class SaveQbeDto {
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

  @ApiProperty({ description: 'Global order index for ordering' })
  @IsNumber()
  globalOrderIndex: number;

  @ApiProperty({ description: 'Report options (thresholds, aggregation)' })
  @IsObject()
  options: IReportOptions;

  @ApiProperty({ description: 'Chart definitions', type: 'array' })
  @IsArray()
  charts: Array<IChartData>;

  @ApiProperty({ description: 'Raw SQL query with _fromDate_ and _toDate_ placeholders' })
  @IsString()
  @IsNotEmpty()
  sql: string;
}
