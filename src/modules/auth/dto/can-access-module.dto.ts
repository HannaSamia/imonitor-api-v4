import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CanAccessModuleDto {
  @ApiProperty({ description: 'Role name to check' })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty({ description: 'Module name to check' })
  @IsString()
  @IsNotEmpty()
  module: string;
}
