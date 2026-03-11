import { IsOptional, IsString, IsInt, Min, Max, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ListSentNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (0-based)', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number = 0;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number = 20;

  @ApiPropertyOptional({ description: 'Search text (filters chartName, widgetBuilderName, message)' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class TestEmailParamsDto {
  @ApiProperty({ description: 'Email address to send test notification' })
  @IsEmail()
  email: string;
}
