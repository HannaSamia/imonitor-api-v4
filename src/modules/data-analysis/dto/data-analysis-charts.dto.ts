import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class DataAnalysisChartsDto {
  @ApiProperty({ description: 'Chart ID from report charts' })
  @IsString()
  @IsNotEmpty()
  chartId: string;

  @ApiProperty({ description: 'Report ID' })
  @IsString()
  @IsNotEmpty()
  reportId: string;

  @ApiProperty({ description: 'Grid columns' })
  @IsNumber()
  cols: number;

  @ApiProperty({ description: 'Grid rows' })
  @IsNumber()
  rows: number;

  @ApiProperty({ description: 'Grid X position' })
  @IsNumber()
  x: number;

  @ApiProperty({ description: 'Grid Y position' })
  @IsNumber()
  y: number;

  @ApiPropertyOptional({ description: 'Whether this is a title widget' })
  @IsOptional()
  @IsBoolean()
  isTitle?: boolean;

  @ApiPropertyOptional({ description: 'Title value' })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiPropertyOptional({ description: 'Max item columns' })
  @IsOptional()
  @IsNumber()
  maxItemCols?: number;
}
