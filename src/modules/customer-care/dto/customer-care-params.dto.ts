import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBooleanString, IsOptional, Matches } from 'class-validator';

/** Shared param: msisdn + test flag */
export class CustomerCareDefaultParamsDto {
  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;

  @ApiProperty({ description: 'Is test number (true/false)' })
  @IsNotEmpty()
  @IsBooleanString()
  test: string;
}

/** Param: msisdn only */
export class MsisdnParamDto {
  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;
}

/** Param: hourly balance */
export class HourlyBalanceParamsDto {
  @ApiProperty({ description: 'Date for hourly balance' })
  @IsNotEmpty()
  @IsString()
  date: string;

  @ApiProperty({ description: 'SDP VIP identifier' })
  @IsNotEmpty()
  @IsString()
  sdpvip: string;

  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;
}

/** Param: DA daily history */
export class DaHistoryParamsDto {
  @ApiProperty({ description: 'Start date' })
  @IsNotEmpty()
  @IsString()
  fromdate: string;

  @ApiProperty({ description: 'End date' })
  @IsNotEmpty()
  @IsString()
  todate: string;

  @ApiProperty({ description: 'SDP VIP identifier' })
  @IsNotEmpty()
  @IsString()
  sdpvip: string;

  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;
}

/** Param: subscription history */
export class SubscriptionHistoryParamsDto {
  @ApiProperty({ description: 'Start date' })
  @IsNotEmpty()
  @IsString()
  fromdate: string;

  @ApiProperty({ description: 'End date' })
  @IsNotEmpty()
  @IsString()
  todate: string;

  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;

  @ApiProperty({ description: 'Is test number (true/false)' })
  @IsNotEmpty()
  @IsBooleanString()
  test: string;
}

/** Param: MSAP VAS subscription (different param order from v3) */
export class MsapVasSubscriptionParamsDto {
  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;

  @ApiProperty({ description: 'Is test number (true/false)' })
  @IsNotEmpty()
  @IsBooleanString()
  test: string;

  @ApiProperty({ description: 'Start date' })
  @IsNotEmpty()
  @IsString()
  fromdate: string;

  @ApiProperty({ description: 'End date' })
  @IsNotEmpty()
  @IsString()
  todate: string;
}

/** Param: CDR history + Share'n'Sell */
export class CdrHistoryParamsDto {
  @ApiProperty({ description: 'Start date' })
  @IsNotEmpty()
  @IsString()
  fromdate: string;

  @ApiProperty({ description: 'End date' })
  @IsNotEmpty()
  @IsString()
  todate: string;

  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;
}

/** Param: trace set/unset (sdpvip + msisdn) */
export class TraceParamsDto {
  @ApiProperty({ description: 'SDP VIP identifier' })
  @IsNotEmpty()
  @IsString()
  sdpvip: string;

  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;
}

/** Param: get trace (fromhour, tohour, sdpvip, msisdn) */
export class GetTraceParamsDto {
  @ApiProperty({ description: 'From hour' })
  @IsNotEmpty()
  @IsString()
  fromhour: string;

  @ApiProperty({ description: 'To hour' })
  @IsNotEmpty()
  @IsString()
  tohour: string;

  @ApiProperty({ description: 'SDP VIP identifier' })
  @IsNotEmpty()
  @IsString()
  sdpvip: string;

  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;
}

/** Param: AIR trace (msisdn only — no sdpvip) */
export class AirTraceParamsDto {
  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;
}

/** Param: get AIR trace (fromhour, tohour, msisdn) */
export class GetAirTraceParamsDto {
  @ApiProperty({ description: 'From hour' })
  @IsNotEmpty()
  @IsString()
  fromhour: string;

  @ApiProperty({ description: 'To hour' })
  @IsNotEmpty()
  @IsString()
  tohour: string;

  @ApiProperty({ description: 'Phone number (MSISDN)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'msisdn must be 7-15 digits' })
  msisdn: string;
}

/** Param: trace history date range */
export class TraceDateRangeParamsDto {
  @ApiProperty({ description: 'Start date' })
  @IsNotEmpty()
  @IsString()
  fromdate: string;

  @ApiProperty({ description: 'End date' })
  @IsNotEmpty()
  @IsString()
  todate: string;
}

/** Query: export trace options */
export class ExportTraceQueryDto {
  @ApiPropertyOptional({ description: 'If true, export raw trace without provider mapping' })
  @IsOptional()
  @IsBooleanString()
  raw?: string;
}
