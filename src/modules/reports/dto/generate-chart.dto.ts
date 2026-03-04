import { ApiProperty } from '@nestjs/swagger';
import { IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GenerateReportDto } from './generate-report.dto';
import { IChartData } from './report-interfaces';

/**
 * Request body for individual chart generation endpoints (pie, doughnut, trend, etc.).
 *
 * Mirrors the v3 pattern where the body contains:
 *   { tabular: GenerateReportDto, chart: ChartConfigObject }
 */
export class GenerateChartDto {
  @ApiProperty({ description: 'Report query configuration (tables, filters, dates, etc.)' })
  @IsObject()
  @ValidateNested()
  @Type(() => GenerateReportDto)
  tabular: GenerateReportDto;

  @ApiProperty({ description: 'Chart configuration object (type, options, lib, util, etc.)' })
  @IsObject()
  chart: IChartData;
}
