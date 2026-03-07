import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsArray, Min } from 'class-validator';

export class SaveRotatingDashboardDto {
  @ApiProperty({ description: 'Rotating dashboard name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Dashboard IDs to rotate through', type: [String] })
  @IsArray()
  @IsString({ each: true })
  dashboardIds: string[];

  @ApiProperty({ description: 'Rotation interval in minutes' })
  @IsNumber()
  @Min(1)
  minutes: number;
}
