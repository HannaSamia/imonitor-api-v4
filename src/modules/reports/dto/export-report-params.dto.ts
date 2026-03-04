import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ExportReportParamsDto {
  @ApiProperty({ description: 'Report ID' })
  @IsString()
  @IsNotEmpty()
  reportId: string;

  @ApiProperty({ description: 'Report status' })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiProperty({ description: 'Date range start' })
  @IsString()
  @IsNotEmpty()
  fromdate: string;

  @ApiProperty({ description: 'Date range end' })
  @IsString()
  @IsNotEmpty()
  todate: string;

  @ApiProperty({ description: 'Time interval' })
  @IsString()
  @IsNotEmpty()
  interval: string;
}

export class ExportTabParamsDto extends ExportReportParamsDto {
  @ApiProperty({ description: 'Chart ID for tab export' })
  @IsString()
  @IsNotEmpty()
  chartId: string;
}
