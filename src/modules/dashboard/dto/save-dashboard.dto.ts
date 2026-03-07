import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DashboardChartsDto } from './dashboard-charts.dto';

export class SaveDashboardDto {
  @ApiProperty({ description: 'Dashboard name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Charts/widgets configuration', type: [DashboardChartsDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardChartsDto)
  charts: DashboardChartsDto[];

  @ApiPropertyOptional({ description: 'Whether this is a default dashboard' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
