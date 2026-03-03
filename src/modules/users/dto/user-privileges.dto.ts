import { IsNotEmpty, IsString, IsBoolean, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UserPrivilegesDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  id: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  pId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  isMenuItem: boolean;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  priority: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  nestedLevel: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  font?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  path?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  roleName: string;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  isUser: boolean;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  isSuperUser: boolean;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  isAdmin: boolean;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  toggle: string;

  @ApiPropertyOptional({ type: () => [UserPrivilegesDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserPrivilegesDto)
  children?: UserPrivilegesDto[];
}
