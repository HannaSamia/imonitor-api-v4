import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class ConsolidateDto {
  @ApiProperty({ description: 'List of table names to consolidate', type: [String] })
  @IsArray()
  @IsString({ each: true })
  tables: string[];

  @ApiProperty({ description: 'Date for consolidation (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  date: string;
}
