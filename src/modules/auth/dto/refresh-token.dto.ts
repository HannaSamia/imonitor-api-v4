import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Current JWT token (may be expired)' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ description: 'Refresh token UUID' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
