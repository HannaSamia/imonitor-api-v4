import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DataAnalysisChartsDto } from './data-analysis-charts.dto';

export class EditDataAnalysisDto {
  @ApiProperty({ description: 'Data analysis ID' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Data analysis name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Charts/reports configuration', type: [DataAnalysisChartsDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DataAnalysisChartsDto)
  charts: DataAnalysisChartsDto[];

  @ApiPropertyOptional({ description: 'Whether this is a default data analysis' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
