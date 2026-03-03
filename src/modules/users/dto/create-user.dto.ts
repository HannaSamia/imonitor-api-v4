import { IsNotEmpty, IsString, IsBoolean, IsEmail, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
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

  @ApiProperty({ description: 'Username', minLength: 5 })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  userName: string;

  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Password', minLength: 6, maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(30)
  password: string;

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
