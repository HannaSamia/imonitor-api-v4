import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ObservabilityDashboardChartDto {
  @ApiProperty({ description: 'Chart ID' })
  @IsString()
  @IsNotEmpty()
  chartId: string;

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

  @ApiPropertyOptional({ description: 'Max item columns' })
  @IsOptional()
  @IsNumber()
  maxItemCols?: number;

  @ApiPropertyOptional({ description: 'Title value' })
  @IsOptional()
  @IsString()
  value?: string;
}

export class SaveObservabilityDashboardDto {
  @ApiProperty({ description: 'Dashboard name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Charts/widgets configuration', type: [ObservabilityDashboardChartDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObservabilityDashboardChartDto)
  charts: ObservabilityDashboardChartDto[];
}

export class UpdateObservabilityDashboardDto extends SaveObservabilityDashboardDto {
  @ApiProperty({ description: 'Dashboard ID' })
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class ListObservabilityDashboardsDto {
  id: string;
  name: string;
  owner: string;
  ownerId: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export class GetDashboardByIdDto {
  id: string;
  name: string;
  ownerId: string;
  title: unknown;
  isFavorite: boolean;
  charts: unknown[];
}
