import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AutomatedReportSftpDto {
  @ApiProperty({ example: '192.168.1.1' })
  @IsString()
  @IsNotEmpty()
  host: string;

  @ApiProperty({ example: 'sftpuser' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'secret' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: '/reports/output' })
  @IsString()
  @IsNotEmpty()
  path: string;
}

export class SaveAutomatedReportDto {
  @ApiProperty({ example: 'Daily SDP Report' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'uuid-report-id' })
  @IsString()
  @IsNotEmpty()
  reportId: string;

  @ApiProperty({ example: 'daily' })
  @IsString()
  @IsNotEmpty()
  timeFilter: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({ example: 0 })
  @IsNumber()
  reportHourInterval: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  reportDayInterval: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  relativeHour: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  relativeDay: number;

  @ApiProperty({ example: 'pdf' })
  @IsString()
  @IsNotEmpty()
  exportType: string;

  @ApiProperty({ example: 0 })
  @IsNumber()
  recurringHours: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  recurringDays: number;

  @ApiProperty({ example: '2026-03-13 08:00' })
  @IsString()
  @IsNotEmpty()
  firstOccurence: string;

  @ApiProperty({ enum: ['email', 'sftp'] })
  @IsIn(['email', 'sftp'])
  method: string;

  @ApiPropertyOptional({ example: 'Daily Report' })
  @IsOptional()
  @IsString()
  emailSubject?: string;

  @ApiPropertyOptional({ example: 'Please find the report attached.' })
  @IsOptional()
  @IsString()
  emailDescription?: string;

  @ApiPropertyOptional({ type: [String], example: ['admin@example.com'] })
  @IsOptional()
  @IsArray()
  emails?: string[];

  @ApiPropertyOptional({ type: [AutomatedReportSftpDto] })
  @IsOptional()
  @IsArray()
  sfpt?: AutomatedReportSftpDto[];
}

export class UpdateAutomatedReportDto extends SaveAutomatedReportDto {}

export class AutomatedReportDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  reportId: string;

  @ApiProperty()
  timeFilter: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  reportHourInterval: number;

  @ApiProperty()
  reportDayInterval: number;

  @ApiProperty()
  relativeHour: number;

  @ApiProperty()
  relativeDay: number;

  @ApiProperty()
  exportType: string;

  @ApiProperty()
  recurringHours: number;

  @ApiProperty()
  recurringDays: number;

  @ApiProperty()
  firstOccurence: string;

  @ApiProperty()
  method: string;

  @ApiPropertyOptional()
  emailSubject?: string;

  @ApiPropertyOptional()
  emailDescription?: string;

  @ApiPropertyOptional({ type: [String] })
  emails?: string[];

  @ApiPropertyOptional({ type: [AutomatedReportSftpDto] })
  sfpt?: AutomatedReportSftpDto[];
}

export class ListAutomatedReportDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  isActive: boolean;
}
