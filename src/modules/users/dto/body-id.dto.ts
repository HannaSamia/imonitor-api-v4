import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BodyIdDto {
  @ApiProperty({ description: 'Entity ID (must match URL :id param)' })
  @IsString()
  @IsNotEmpty()
  id: string;
}
