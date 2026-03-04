import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IReportGlobalFilter,
  IReportOptions,
  IMinimalTabularTable,
  ITabularOrderBy,
  ICustomControlColumn,
  ICustomOperationColumn,
  ICustomCompareColumn,
  IChartData,
  ITabularHeader,
  IPrivilegeTableField,
} from './report-interfaces';

/** Full report response — returned by getReportById / getSharedReportById */
export class ReportResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() ownerId: string;
  @ApiProperty() timeFilter: string;
  @ApiProperty() globalFilter: IReportGlobalFilter;
  @ApiProperty() options: IReportOptions;
  @ApiProperty() isFavorite: boolean;
  @ApiProperty() isDefault: boolean;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
  @ApiProperty() fromDate: string;
  @ApiProperty() toDate: string;
  @ApiProperty() limit: number;
  @ApiProperty({ type: 'array' }) tables: Array<IMinimalTabularTable>;
  @ApiProperty({ type: 'array' }) orderBy: Array<ITabularOrderBy>;
  @ApiProperty({ type: 'array' }) control: Array<ICustomControlColumn>;
  @ApiProperty({ type: 'array' }) operation: Array<ICustomOperationColumn>;
  @ApiProperty({ type: 'array' }) compare: Array<ICustomCompareColumn>;
  @ApiProperty({ type: 'array' }) charts: Array<IChartData>;
  @ApiProperty() globalOrderIndex: number;
  @ApiProperty() isQbe: boolean;
}

/** Shared report extends report with the shared entry's reportId */
export class SharedReportResponseDto extends ReportResponseDto {
  @ApiProperty() reportId: string;
}

/** List item for user's reports */
export class ListReportDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() isFavorite: boolean;
  @ApiProperty() isShared: boolean;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
  @ApiProperty() isDefault: boolean;
  @ApiProperty() ownerId: string;
  @ApiPropertyOptional() owner?: string;
}

/** Query execution result */
export class ExecuteQueryResultDto {
  @ApiProperty({ type: 'array' }) header: Array<ITabularHeader>;
  @ApiProperty({ type: 'array' }) body: Array<Record<string, unknown>>;
}

/** Privileged table with fields */
export class PrivilegedTableDto {
  @ApiProperty() id: string;
  @ApiProperty() displayName: string;
  @ApiPropertyOptional() role?: string;
  @ApiProperty({ type: 'array' }) fields: Array<IPrivilegeTableField>;
}

/** Side menu tables response */
export class SideTablesDto {
  @ApiProperty({ type: PrivilegedTableDto }) refTable: PrivilegedTableDto;
  @ApiProperty({ type: [PrivilegedTableDto] }) tables: Array<PrivilegedTableDto>;
}
