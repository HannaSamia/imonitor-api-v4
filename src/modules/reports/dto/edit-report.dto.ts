import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsArray, IsObject, IsEnum, Min } from 'class-validator';
import { ReportTimeFilter } from '../../../database/entities/core-report.entity';
import {
  IReportGlobalFilter,
  IReportOptions,
  IMinimalTabularTable,
  ITabularOrderBy,
  ICustomControlColumn,
  ICustomOperationColumn,
  ICustomCompareColumn,
  IChartData,
} from './report-interfaces';

export class EditReportDto {
  @ApiProperty({ description: 'Report ID' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Report name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Report owner ID' })
  @IsString()
  @IsNotEmpty()
  ownerId: string;

  @ApiProperty({ description: 'Time filter interval', enum: ReportTimeFilter })
  @IsEnum(ReportTimeFilter)
  timeFilter: ReportTimeFilter;

  @ApiProperty({ description: 'Global filter object' })
  @IsObject()
  globalFilter: IReportGlobalFilter;

  @ApiProperty({ description: 'Report options' })
  @IsObject()
  options: IReportOptions;

  @ApiProperty({ description: 'Date range start' })
  @IsString()
  @IsNotEmpty()
  fromDate: string;

  @ApiProperty({ description: 'Date range end' })
  @IsString()
  @IsNotEmpty()
  toDate: string;

  @ApiProperty({ description: 'Row limit' })
  @IsNumber()
  @Min(0)
  limit: number;

  @ApiProperty({ description: 'Tables used in the report', type: 'array' })
  @IsArray()
  tables: Array<IMinimalTabularTable>;

  @ApiProperty({ description: 'Order by columns', type: 'array' })
  @IsArray()
  orderBy: Array<ITabularOrderBy>;

  @ApiProperty({ description: 'Control custom columns', type: 'array' })
  @IsArray()
  control: Array<ICustomControlColumn>;

  @ApiProperty({ description: 'Operation custom columns', type: 'array' })
  @IsArray()
  operation: Array<ICustomOperationColumn>;

  @ApiProperty({ description: 'Compare custom columns', type: 'array' })
  @IsArray()
  compare: Array<ICustomCompareColumn>;

  @ApiProperty({ description: 'Chart definitions', type: 'array' })
  @IsArray()
  charts: Array<IChartData>;

  @ApiProperty({ description: 'Global order index' })
  @IsNumber()
  globalOrderIndex: number;

  @ApiProperty({ description: 'Chart statuses keyed by chart ID' })
  @IsObject()
  chartsStatus: Record<string, string>;
}
