import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RenameReportDto {
  @ApiProperty({ description: 'Report ID to rename' })
  @IsString()
  @IsNotEmpty()
  reportId: string;

  @ApiProperty({ description: 'New report name' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
