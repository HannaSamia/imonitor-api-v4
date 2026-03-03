import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: 'New password', minLength: 6, maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(30)
  password: string;

  @ApiProperty({ description: 'Confirm new password (must match password)', minLength: 6, maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(30)
  confirmPassword: string;

  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;
}
