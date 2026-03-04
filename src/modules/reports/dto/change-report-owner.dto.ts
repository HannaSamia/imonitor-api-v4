import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ChangeReportOwnerDto {
  @ApiProperty({ description: 'Report ID' })
  @IsString()
  @IsNotEmpty()
  reportId: string;

  @ApiProperty({ description: 'New owner user ID' })
  @IsString()
  @IsNotEmpty()
  newOwnerId: string;
}
