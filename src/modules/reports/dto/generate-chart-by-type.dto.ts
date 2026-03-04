import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class GenerateChartByTypeDto {
  @ApiProperty({ description: 'Report ID' })
  @IsString()
  @IsNotEmpty()
  reportId: string;

  @ApiProperty({ description: 'Chart ID' })
  @IsString()
  @IsNotEmpty()
  chartId: string;

  @ApiProperty({ description: 'Date range start' })
  @IsString()
  @IsNotEmpty()
  fromDate: string;

  @ApiProperty({ description: 'Date range end' })
  @IsString()
  @IsNotEmpty()
  toDate: string;

  @ApiProperty({ description: 'Time interval' })
  @IsString()
  @IsNotEmpty()
  interval: string;
}
