import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ObservabilityMetricFilterThresholdDto {
  @ApiProperty({ description: 'Minimum value' })
  @IsNumber()
  min: number;

  @ApiProperty({ description: 'Maximum value' })
  @IsNumber()
  max: number;

  @ApiProperty({ description: 'Threshold type (normal, warning, critical)' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ description: 'Whether alert repeats' })
  @IsOptional()
  @IsBoolean()
  isRecursiveAlert?: boolean;
}

export class ObservabilityMetricMinMaxDto {
  @ApiProperty({ description: 'Threshold type' })
  @IsString()
  type: string;

  @ApiProperty({ description: 'Value' })
  @IsNumber()
  value: number;
}

export class ObservabilityMetricFilterDto {
  @ApiPropertyOptional({ description: 'Filter ID' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: 'Start time (HH:mm)' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: 'End time (HH:mm)' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Whether this is the default filter' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Minimum threshold' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ObservabilityMetricMinMaxDto)
  min?: ObservabilityMetricMinMaxDto;

  @ApiPropertyOptional({ description: 'Maximum threshold' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ObservabilityMetricMinMaxDto)
  max?: ObservabilityMetricMinMaxDto;

  @ApiPropertyOptional({ description: 'Threshold ranges', type: [ObservabilityMetricFilterThresholdDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObservabilityMetricFilterThresholdDto)
  thresholds?: ObservabilityMetricFilterThresholdDto[];
}

export class StatusAlertDto {
  @ApiPropertyOptional({ description: 'Alert level' })
  @IsOptional()
  @IsNumber()
  level?: number;

  @ApiPropertyOptional({ description: 'Duration in minutes for stability check' })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional({ description: 'Alert subject' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: 'Alert body message' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Email recipients', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emails?: string[];

  @ApiPropertyOptional({ description: 'Phone number recipients', type: [Number] })
  @IsOptional()
  @IsArray()
  phoneNumbers?: number[];

  @ApiPropertyOptional({ description: 'User IDs to notify', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  users?: string[];

  @ApiPropertyOptional({ description: 'Whether alert repeats' })
  @IsOptional()
  @IsBoolean()
  isRepeat?: boolean;
}

export class ObservabilityMetricThresholdDto {
  @ApiPropertyOptional({ description: 'Time-based filters', type: [ObservabilityMetricFilterDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObservabilityMetricFilterDto)
  timeFilters?: ObservabilityMetricFilterDto[];

  @ApiPropertyOptional({ description: 'Alternative/global time filter' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ObservabilityMetricFilterDto)
  alternativeTimeFilters?: ObservabilityMetricFilterDto;
}

export class ObservabilityMetricAlarmsDto {
  @ApiPropertyOptional({ description: 'Critical alarms', type: [StatusAlertDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatusAlertDto)
  critical?: StatusAlertDto[];

  @ApiPropertyOptional({ description: 'Warning alarms', type: [StatusAlertDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatusAlertDto)
  warning?: StatusAlertDto[];
}

export class SaveObservabilityMetricDto {
  @ApiProperty({ description: 'Metric name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Tables configuration (JSON)' })
  @IsOptional()
  tables?: unknown;

  @ApiPropertyOptional({ description: 'Control columns (JSON)' })
  @IsOptional()
  control?: unknown;

  @ApiPropertyOptional({ description: 'Compare columns (JSON)' })
  @IsOptional()
  compare?: unknown;

  @ApiPropertyOptional({ description: 'Operation columns (JSON)' })
  @IsOptional()
  operation?: unknown;

  @ApiPropertyOptional({ description: 'Global filter (JSON)' })
  @IsOptional()
  globalFilter?: unknown;

  @ApiPropertyOptional({ description: 'Order by config (JSON)' })
  @IsOptional()
  orderBy?: unknown;

  @ApiPropertyOptional({ description: 'Options (JSON)' })
  @IsOptional()
  options?: unknown;

  @ApiPropertyOptional({ description: 'Node IDs', type: [String] })
  @IsOptional()
  @IsArray()
  nodeIds?: string[];

  @ApiPropertyOptional({ description: 'Result limit' })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ description: 'Charts per row' })
  @IsOptional()
  @IsNumber()
  chartsPerRow?: number;

  @ApiPropertyOptional({ description: 'Whether metric is exploded' })
  @IsOptional()
  @IsBoolean()
  isExploded?: boolean;

  @ApiPropertyOptional({ description: 'Metric type' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Global order index' })
  @IsOptional()
  @IsNumber()
  globalOrderIndex?: number;

  @ApiPropertyOptional({ description: 'Threshold configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ObservabilityMetricThresholdDto)
  threshold?: ObservabilityMetricThresholdDto;

  @ApiPropertyOptional({ description: 'Alarm configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ObservabilityMetricAlarmsDto)
  alarms?: ObservabilityMetricAlarmsDto;
}

export class UpdateObservabilityMetricDto extends SaveObservabilityMetricDto {
  @ApiProperty({ description: 'Metric ID' })
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class GenerateObservabilityMetricDto {
  @ApiPropertyOptional({ description: 'Tables configuration' })
  @IsOptional()
  tables?: unknown;

  @ApiPropertyOptional({ description: 'Control columns' })
  @IsOptional()
  control?: unknown;

  @ApiPropertyOptional({ description: 'Compare columns' })
  @IsOptional()
  compare?: unknown;

  @ApiPropertyOptional({ description: 'Operation columns' })
  @IsOptional()
  operation?: unknown;

  @ApiPropertyOptional({ description: 'Global filter' })
  @IsOptional()
  globalFilter?: unknown;

  @ApiPropertyOptional({ description: 'Order by config' })
  @IsOptional()
  orderBy?: unknown;

  @ApiPropertyOptional({ description: 'Options config' })
  @IsOptional()
  options?: unknown;

  @ApiPropertyOptional({ description: 'Priority columns' })
  @IsOptional()
  priority?: unknown;

  @ApiPropertyOptional({ description: 'Inclusion columns' })
  @IsOptional()
  inclusion?: unknown;

  @ApiPropertyOptional({ description: 'Result limit' })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ description: 'From date' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'To date' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Time frame (current, hour_24, hour_48, custom)' })
  @IsOptional()
  @IsString()
  timeFrame?: string;

  @ApiPropertyOptional({ description: 'Time filter (minutes, hourly, daily, weekly, monthly, yearly)' })
  @IsOptional()
  @IsString()
  timeFilter?: string;

  @ApiPropertyOptional({ description: 'Node type (all, production, test)' })
  @IsOptional()
  @IsString()
  nodeType?: string;

  @ApiPropertyOptional({ description: 'Node IDs' })
  @IsOptional()
  @IsArray()
  nodeIds?: string[];

  @ApiPropertyOptional({ description: 'Whether metric is exploded' })
  @IsOptional()
  @IsBoolean()
  isExploded?: boolean;

  @ApiPropertyOptional({ description: 'Metric ID (for stored metrics)' })
  @IsOptional()
  @IsString()
  metricId?: string;
}

export class GetMetricsByNodeIdsDto {
  @ApiProperty({ description: 'Node IDs to query', type: [String] })
  @IsArray()
  nodeIds: string[];
}

export class ListObservabilityMetricDto {
  id: string;
  name: string;
  owner: string;
  ownerId: string;
  isFavorite: boolean;
  isExploded: boolean;
  createdAt: string;
  updatedAt: string;
}

export class FilterObservabilityMetricsDto {
  id: string;
  name: string;
  isExploded: boolean;
}

export class ObservabilityGoToReportDto {
  tables: unknown;
  globalFilter: unknown;
  orderBy: unknown;
  options: unknown;
  control: unknown;
  compare: unknown;
  operation: unknown;
}

export class ModuleNodeDto {
  id: string;
  name: string;
}

export class ObservabilityMetricViewDto {
  metricName: string;
  metricValue: number;
  color: string;
  data?: unknown[];
}

export class ExecuteQueryResultDto {
  header: unknown[];
  body: unknown[];
}
