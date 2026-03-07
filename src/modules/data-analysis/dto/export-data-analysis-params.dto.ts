import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ExportDataAnalysisParamsDto {
  @ApiProperty({ description: 'Data analysis ID' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Data analysis status (saved or shared)' })
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
