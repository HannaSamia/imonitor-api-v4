import { IsNotEmpty, IsString, IsBoolean, IsEmail, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ description: 'User ID (must match URL param)' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'First name', minLength: 2 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  firstName: string;

  @ApiProperty({ description: 'Last name', minLength: 2 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  lastName: string;

  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Phone number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ description: 'Allow multiple concurrent sessions' })
  @IsBoolean()
  allowMultipleSessions: boolean;

  @ApiProperty({ description: 'Keep login (bypass JWT expiry)' })
  @IsBoolean()
  keepLogin: boolean;
}

export class EditSelfDto {
  @ApiProperty({ description: 'First name', minLength: 3 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9]+$/, { message: 'firstName must be alphanumeric' })
  firstName: string;

  @ApiProperty({ description: 'Last name', minLength: 3 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9]+$/, { message: 'lastName must be alphanumeric' })
  lastName: string;

  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Phone number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}
