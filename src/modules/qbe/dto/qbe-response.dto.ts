import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IReportOptions, IChartData, ITabularHeader, IFieldsArrayEntry } from '../../reports/dto/report-interfaces';
import { ProcessQbeDto } from './process-qbe.dto';

/** Full QBE report response — returned by getById / getSharedById */
export class QbeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() ownerId: string;
  @ApiProperty() isFavorite: boolean;
  @ApiProperty() isDefault: boolean;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
  @ApiProperty() name: string;
  @ApiProperty() timeFilter: string;
  @ApiProperty() fromDate: string;
  @ApiProperty() toDate: string;
  @ApiProperty() globalOrderIndex: number;
  @ApiProperty() options: IReportOptions;
  @ApiProperty({ type: 'array' }) charts: Array<IChartData>;
  @ApiProperty() sql: string;
}

/** QBE query execution result — returned by POST /qbe/run */
export class QbeRunDto {
  @ApiProperty({ type: 'array' }) header: Array<ITabularHeader>;
  @ApiProperty({ type: 'array' }) fields: Array<IFieldsArrayEntry>;
  @ApiProperty({ type: 'array' }) body: Array<unknown>;
  @ApiProperty() query: string;
  @ApiPropertyOptional() processedQuery?: string;
}

/** QBE autocomplete field */
export interface QbeAutoCompleteField {
  id: string;
  name: string;
  type: string;
}

/** QBE autocomplete table with columns */
export class QbeAutoCompleteTablesDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: 'array' }) columns: Array<QbeAutoCompleteField>;
}

/** QBE chart generation request body */
export class GenerateQbeChartDto {
  @ApiProperty({ description: 'QBE query configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => ProcessQbeDto)
  tabular: ProcessQbeDto;

  @ApiProperty({ description: 'Chart configuration object' })
  @IsObject()
  chart: IChartData;
}
