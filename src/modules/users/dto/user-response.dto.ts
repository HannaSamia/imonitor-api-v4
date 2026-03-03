import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserOptionsDto {
  @ApiProperty()
  isLocked: boolean;

  @ApiProperty()
  keepLogin: boolean;

  @ApiProperty()
  allowMultipleSessions: boolean;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  phoneNumber: string;

  @ApiPropertyOptional({ type: UserOptionsDto })
  options?: UserOptionsDto;
}
