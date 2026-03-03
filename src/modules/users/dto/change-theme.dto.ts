import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserTheme } from '../../../database/entities/core-application-users.entity';

export class ChangeThemeDto {
  @ApiProperty({ enum: UserTheme, description: 'Theme preference' })
  @IsEnum(UserTheme)
  theme: UserTheme;
}
