import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class AppModuleDto {
  @ApiProperty({ description: 'Module ID (UUID string)' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiPropertyOptional({ description: 'Parent module ID' })
  @IsOptional()
  @IsNumber()
  pId?: number;

  @ApiProperty({ description: 'Whether the module is a menu item' })
  @IsBoolean()
  isMenuItem: boolean;

  @ApiProperty({ description: 'Module display priority' })
  @IsNumber()
  priority: number;

  @ApiProperty({ description: 'Module name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Whether the module is the default' })
  @IsBoolean()
  isDefault: boolean;

  @ApiPropertyOptional({ description: 'Nested level in the menu tree' })
  @IsOptional()
  @IsNumber()
  nestedLevel?: number;

  @ApiPropertyOptional({ description: 'Icon identifier' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Frontend path/route' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ description: 'Light theme color (maps to lightColor column)' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Font family' })
  @IsOptional()
  @IsString()
  font?: string;
}
