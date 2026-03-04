import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsArray, IsObject, IsOptional, Min } from 'class-validator';
import {
  IReportGlobalFilter,
  IMinimalTabularTable,
  ITabularTable,
  ITabularOrderBy,
  ICustomControlColumn,
  ICustomOperationColumn,
  ICustomCompareColumn,
} from './report-interfaces';

export class GenerateReportDto {
  @ApiProperty({ description: 'Date range start' })
  @IsString()
  @IsNotEmpty()
  fromDate: string;

  @ApiProperty({ description: 'Date range end' })
  @IsString()
  @IsNotEmpty()
  toDate: string;

  @ApiProperty({ description: 'Time filter interval' })
  @IsString()
  @IsNotEmpty()
  timeFilter: string;

  @ApiPropertyOptional({ description: 'Row limit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  limit?: number;

  @ApiProperty({ description: 'Order by columns', type: 'array' })
  @IsArray()
  orderBy: Array<ITabularOrderBy>;

  @ApiProperty({ description: 'Global filter object' })
  @IsObject()
  globalFilter: IReportGlobalFilter;

  @ApiProperty({ description: 'Tables with fields', type: 'array' })
  @IsArray()
  tables: Array<IMinimalTabularTable | ITabularTable>;

  @ApiProperty({ description: 'Compare custom columns', type: 'array' })
  @IsArray()
  compare: Array<ICustomCompareColumn>;

  @ApiProperty({ description: 'Operation custom columns', type: 'array' })
  @IsArray()
  operation: Array<ICustomOperationColumn>;

  @ApiProperty({ description: 'Control custom columns', type: 'array' })
  @IsArray()
  control: Array<ICustomControlColumn>;

  @ApiPropertyOptional({ description: 'Priority custom columns', type: 'array' })
  @IsOptional()
  @IsArray()
  priority?: Array<ICustomControlColumn>;

  @ApiPropertyOptional({ description: 'Inclusion custom columns', type: 'array' })
  @IsOptional()
  @IsArray()
  inclusion?: Array<ICustomControlColumn>;

  @ApiPropertyOptional({ description: 'Node type (param or nodes)' })
  @IsOptional()
  @IsString()
  nodeType?: string;
}
