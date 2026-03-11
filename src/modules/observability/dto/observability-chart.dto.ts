import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ObservabilityChartMetricFieldDto {
  @ApiProperty({ description: 'Metric ID' })
  @IsString()
  metricId: string;

  @ApiPropertyOptional({ description: 'Metric name' })
  @IsOptional()
  @IsString()
  metricName?: string;

  @ApiPropertyOptional({ description: 'Color' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class ObservabilityCounterListMetricDto {
  @ApiProperty({ description: 'Metric ID' })
  @IsString()
  id: string;

  @ApiPropertyOptional({ description: 'Metric name' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class ObservabilityChartNodeDto {
  @ApiProperty({ description: 'Node ID' })
  @IsString()
  id: string;

  @ApiPropertyOptional({ description: 'Node name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'X position' })
  @IsOptional()
  @IsNumber()
  x?: number;

  @ApiPropertyOptional({ description: 'Y position' })
  @IsOptional()
  @IsNumber()
  y?: number;

  @ApiPropertyOptional({ description: 'Width' })
  @IsOptional()
  @IsNumber()
  width?: number;

  @ApiPropertyOptional({ description: 'Radius' })
  @IsOptional()
  @IsNumber()
  radius?: number;
}

export class SaveObservabilityChartDto {
  @ApiProperty({ description: 'Chart name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Chart type' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({ description: 'Chart data (JSON)' })
  @IsOptional()
  data?: unknown;

  @ApiPropertyOptional({ description: 'Single metric ID (hexagon, horizontal_status_panel)' })
  @IsOptional()
  @IsString()
  metricId?: string;

  @ApiPropertyOptional({ description: 'Multiple metric IDs (time_travel, vertical_status_panel)' })
  @IsOptional()
  @IsArray()
  metricIds?: string[];

  @ApiPropertyOptional({ description: 'Metric fields (trend_ob, bar_ob)', type: [ObservabilityChartMetricFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObservabilityChartMetricFieldDto)
  metricFields?: ObservabilityChartMetricFieldDto[];

  @ApiPropertyOptional({ description: 'Counter list metrics', type: [ObservabilityCounterListMetricDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObservabilityCounterListMetricDto)
  metricsArray?: ObservabilityCounterListMetricDto[];

  @ApiPropertyOptional({ description: 'Whether chart is connectivity type' })
  @IsOptional()
  @IsBoolean()
  isConnectivity?: boolean;

  @ApiPropertyOptional({ description: 'Node IDs for connectivity chart', type: [ObservabilityChartNodeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObservabilityChartNodeDto)
  nodes?: ObservabilityChartNodeDto[];

  @ApiPropertyOptional({ description: 'Node IDs as JSON string' })
  @IsOptional()
  nodeIds?: unknown;
}

export class UpdateObservabilityChartDto extends SaveObservabilityChartDto {
  @ApiProperty({ description: 'Chart ID' })
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class ListObservabilityChartsDto {
  id: string;
  name: string;
  type: string;
  owner: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export class VerticalStatusPanelDto {
  @ApiPropertyOptional({ description: 'Chart configuration' })
  @IsOptional()
  util?: unknown;

  @ApiPropertyOptional({ description: 'Chart library data' })
  @IsOptional()
  lib?: unknown;

  @ApiPropertyOptional({ description: 'Metric IDs' })
  @IsOptional()
  @IsArray()
  metricIds?: string[];
}

export class HorizontalStatusPanelDto {
  @ApiPropertyOptional({ description: 'Chart configuration' })
  @IsOptional()
  util?: unknown;

  @ApiPropertyOptional({ description: 'Chart library data' })
  @IsOptional()
  lib?: unknown;

  @ApiPropertyOptional({ description: 'Metric ID' })
  @IsOptional()
  @IsString()
  metricId?: string;
}

export class CounterListChartDto {
  @ApiPropertyOptional({ description: 'Chart configuration' })
  @IsOptional()
  util?: unknown;

  @ApiPropertyOptional({ description: 'Chart library data' })
  @IsOptional()
  lib?: unknown;

  @ApiPropertyOptional({ description: 'Metrics array' })
  @IsOptional()
  @IsArray()
  metricsArray?: unknown[];
}

export class HexagonChartDto {
  @ApiPropertyOptional({ description: 'Chart configuration' })
  @IsOptional()
  util?: unknown;

  @ApiPropertyOptional({ description: 'Chart library data' })
  @IsOptional()
  lib?: unknown;

  @ApiPropertyOptional({ description: 'Metric ID' })
  @IsOptional()
  @IsString()
  metricId?: string;
}

export class ObservabilityTrendChartDto {
  @ApiPropertyOptional({ description: 'Chart configuration' })
  @IsOptional()
  util?: unknown;

  @ApiPropertyOptional({ description: 'Chart library data' })
  @IsOptional()
  lib?: unknown;

  @ApiPropertyOptional({ description: 'Metric fields' })
  @IsOptional()
  @IsArray()
  metricFields?: unknown[];
}

export class ObservabilityVerticalBarChartDto {
  @ApiPropertyOptional({ description: 'Chart configuration' })
  @IsOptional()
  util?: unknown;

  @ApiPropertyOptional({ description: 'Chart library data' })
  @IsOptional()
  lib?: unknown;

  @ApiPropertyOptional({ description: 'Metric fields' })
  @IsOptional()
  @IsArray()
  metricFields?: unknown[];
}

export class ConnectivityChartDto {
  @ApiPropertyOptional({ description: 'Chart configuration' })
  @IsOptional()
  util?: unknown;

  @ApiPropertyOptional({ description: 'Chart library data' })
  @IsOptional()
  lib?: unknown;

  @ApiPropertyOptional({ description: 'Node configuration' })
  @IsOptional()
  @IsArray()
  nodes?: unknown[];

  @ApiPropertyOptional({ description: 'Whether to exclude metrics' })
  @IsOptional()
  @IsBoolean()
  isExclude?: boolean;
}

export class TimeTravelChartDto {
  @ApiPropertyOptional({ description: 'Chart configuration' })
  @IsOptional()
  util?: unknown;

  @ApiPropertyOptional({ description: 'Chart library data' })
  @IsOptional()
  lib?: unknown;

  @ApiPropertyOptional({ description: 'Metric IDs' })
  @IsOptional()
  @IsArray()
  metricIds?: string[];
}
