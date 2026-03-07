import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class DashboardChartsDto {
  @ApiProperty({ description: 'Chart ID from widget builder charts' })
  @IsString()
  @IsNotEmpty()
  chartId: string;

  @ApiProperty({ description: 'Widget builder ID' })
  @IsString()
  @IsNotEmpty()
  widgetBuilderId: string;

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
