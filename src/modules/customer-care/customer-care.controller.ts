import { Controller, Get, Param, Query, Req, Res, UseGuards, StreamableFile } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { createReadStream } from 'fs';
import { basename } from 'path';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CustomerCareService } from './customer-care.service';
import {
  CustomerCareDefaultParamsDto,
  MsisdnParamDto,
  HourlyBalanceParamsDto,
  DaHistoryParamsDto,
  SubscriptionHistoryParamsDto,
  CdrHistoryParamsDto,
  TraceParamsDto,
  GetTraceParamsDto,
  AirTraceParamsDto,
  GetAirTraceParamsDto,
  TraceDateRangeParamsDto,
  ExportTraceQueryDto,
} from './dto';

@ApiTags('Customer Care')
@ApiBearerAuth('JWT')
@UseGuards(PrivilegeGuard)
@Controller('api/v1/operations')
export class CustomerCareController {
  constructor(private readonly customerCareService: CustomerCareService) {}

  // ───────────────────── 1-8: AIR endpoints ─────────────────────

  @Get('sdp/:msisdn/:test')
  @ApiOperation({ summary: 'Get SDP info for a subscriber' })
  @ApiResponse({ status: 200, description: 'SDP lookup result' })
  async getSDP(@Param() params: CustomerCareDefaultParamsDto) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getSDP(params.msisdn, isTest);
    return { result };
  }

  @Get('dedicated-accounts/:msisdn/:test')
  @ApiOperation({ summary: 'Get dedicated accounts for a subscriber' })
  @ApiResponse({ status: 200, description: 'Dedicated accounts data' })
  async getDedicatedAccounts(@Param() params: CustomerCareDefaultParamsDto) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getDedicatedAccounts(params.msisdn, isTest);
    return { result };
  }

  @Get('offers/:msisdn/:test')
  @ApiOperation({ summary: 'Get offers for a subscriber' })
  @ApiResponse({ status: 200, description: 'Offers data' })
  async getOffers(@Param() params: CustomerCareDefaultParamsDto) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getOffers(params.msisdn, isTest);
    return { result };
  }

  @Get('accumulators/:msisdn/:test')
  @ApiOperation({ summary: 'Get accumulators for a subscriber' })
  @ApiResponse({ status: 200, description: 'Accumulators data' })
  async getAccumulators(@Param() params: CustomerCareDefaultParamsDto) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getAccumulators(params.msisdn, isTest);
    return { result };
  }

  @Get('pam/:msisdn/:test')
  @ApiOperation({ summary: 'Get PAM info for a subscriber' })
  @ApiResponse({ status: 200, description: 'PAM data' })
  async getPAM(@Param() params: CustomerCareDefaultParamsDto) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getPAM(params.msisdn, isTest);
    return { result };
  }

  @Get('usage-counter/:msisdn/:test')
  @ApiOperation({ summary: 'Get usage counters for a subscriber' })
  @ApiResponse({ status: 200, description: 'Usage counter data' })
  async getUsageCounter(@Param() params: CustomerCareDefaultParamsDto) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getUsageCounter(params.msisdn, isTest);
    return { result };
  }

  @Get('usage-threshold/:msisdn/:test')
  @ApiOperation({ summary: 'Get usage thresholds for a subscriber' })
  @ApiResponse({ status: 200, description: 'Usage threshold data' })
  async getUsageThreshold(@Param() params: CustomerCareDefaultParamsDto) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getUsageThreshold(params.msisdn, isTest);
    return { result };
  }

  @Get('sob/:msisdn/:test')
  @ApiOperation({ summary: 'Get SOB (Service of Breath) for a subscriber' })
  @ApiResponse({ status: 200, description: 'SOB data' })
  async getSob(@Param() params: CustomerCareDefaultParamsDto) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getSob(params.msisdn, isTest);
    return { result };
  }

  // ───────────────────── 9-11: Network endpoints ─────────────────────

  @Get('hlr/:msisdn')
  @ApiOperation({ summary: 'Query HLR for a subscriber' })
  @ApiResponse({ status: 200, description: 'HLR query result' })
  async getHLR(@Param() params: MsisdnParamDto) {
    const result = await this.customerCareService.getHLR(params.msisdn);
    return { result };
  }

  @Get('hss/:msisdn')
  @ApiOperation({ summary: 'Query HSS for a subscriber' })
  @ApiResponse({ status: 200, description: 'HSS query result' })
  async getHSS(@Param() params: MsisdnParamDto) {
    const result = await this.customerCareService.getHSS(params.msisdn);
    return { result };
  }

  @Get('mtas/:msisdn')
  @ApiOperation({ summary: 'Query MTAS for a subscriber' })
  @ApiResponse({ status: 200, description: 'MTAS query result' })
  async getMTAS(@Param() params: MsisdnParamDto) {
    const result = await this.customerCareService.getMTAS(params.msisdn);
    return { result };
  }

  // ───────────────────── 12-13: Balance & DA History ─────────────────────

  @Get('hourlybalance/:date/:sdpvip/:msisdn')
  @ApiOperation({ summary: 'Get hourly balance for a subscriber' })
  @ApiResponse({ status: 200, description: 'Hourly balance data' })
  async getHourlyBalance(@Param() params: HourlyBalanceParamsDto) {
    const result = await this.customerCareService.getHourlyBalance(params.date, params.sdpvip, params.msisdn);
    return { result };
  }

  @Get('dadailyhistory/:fromdate/:todate/:sdpvip/:msisdn')
  @ApiOperation({ summary: 'Get daily DA history for a subscriber' })
  @ApiResponse({ status: 200, description: 'Daily DA history data' })
  async getDailyDAHistory(@Param() params: DaHistoryParamsDto) {
    const result = await this.customerCareService.getDailyDAHistory(
      params.fromdate,
      params.todate,
      params.sdpvip,
      params.msisdn,
    );
    return { result };
  }

  // ───────────────────── 14-16: Subscription History ─────────────────────

  @Get('subhistory/:fromdate/:todate/:test/:msisdn')
  @ApiOperation({ summary: 'Get subscription history for a subscriber' })
  @ApiResponse({ status: 200, description: 'Subscription history data' })
  async getSubscriptionHistory(@Param() params: SubscriptionHistoryParamsDto, @CurrentUser('id') userId: string) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getSubscriptionHistory(
      userId,
      params.fromdate,
      params.todate,
      isTest,
      params.msisdn,
    );
    return { result };
  }

  @Get('msap/subhistory/:fromdate/:todate/:test/:msisdn')
  @ApiOperation({ summary: 'Get MSAP subscription history for a subscriber' })
  @ApiResponse({ status: 200, description: 'MSAP subscription history data' })
  async getMsapSubscriptionHistory(@Param() params: SubscriptionHistoryParamsDto, @CurrentUser('id') userId: string) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getMsapSubscriptionHistory(
      userId,
      params.fromdate,
      params.todate,
      isTest,
      params.msisdn,
    );
    return { result };
  }

  @Get('msap/vas/subhistory/:fromdate/:todate/:test/:msisdn')
  @ApiOperation({ summary: 'Get MSAP VAS subscription for a subscriber' })
  @ApiResponse({ status: 200, description: 'MSAP VAS subscription data' })
  async getMsapVasSubscription(@Param() params: SubscriptionHistoryParamsDto, @CurrentUser('id') userId: string) {
    const isTest = params.test.toLowerCase() === 'true';
    const result = await this.customerCareService.getMsapVasSubscription(
      userId,
      isTest,
      params.msisdn,
      params.fromdate,
      params.todate,
    );
    return { result };
  }

  // ───────────────────── 17-18: CDR History ─────────────────────

  @Get('cdr/history/:fromdate/:todate/:msisdn')
  @ApiOperation({ summary: 'Get CDR history for a subscriber' })
  @ApiResponse({ status: 200, description: 'CDR history data' })
  async getCdrHistory(@Param() params: CdrHistoryParamsDto) {
    const result = await this.customerCareService.getCdrHistory(params.fromdate, params.todate, params.msisdn);
    return { result };
  }

  @Get('cdr/history/:fromdate/:todate/:msisdn/export')
  @ApiOperation({ summary: 'Export CDR history to Excel' })
  @ApiResponse({ status: 200, description: 'Excel file download' })
  async exportCdrHistoryExcel(
    @Param() params: CdrHistoryParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = await this.customerCareService.exportCdrHistoryExcel(
      params.fromdate,
      params.todate,
      params.msisdn,
    );
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${basename(filePath)}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  // ───────────────────── 19-20: SDP Trace set/unset ─────────────────────

  @Get('settrace/:sdpvip/:msisdn')
  @ApiOperation({ summary: 'Set SDP trace for a subscriber' })
  @ApiResponse({ status: 200, description: 'Trace set successfully' })
  async setTrace(@Param() params: TraceParamsDto, @CurrentUser('id') userId: string) {
    await this.customerCareService.setTrace(params.sdpvip, params.msisdn, userId);
    return { result: 'success' };
  }

  @Get('unsettrace/:sdpvip/:msisdn')
  @ApiOperation({ summary: 'Unset SDP trace for a subscriber' })
  @ApiResponse({ status: 200, description: 'Trace unset successfully' })
  async unsetTrace(@Param() params: TraceParamsDto, @CurrentUser('id') userId: string) {
    await this.customerCareService.unsetTrace(params.sdpvip, params.msisdn, userId);
    return { result: 'success' };
  }

  // ───────────────────── 21-23: SDP Trace fetch & export ─────────────────────

  @Get('gettrace/:fromhour/:tohour/:sdpvip/:msisdn')
  @ApiOperation({ summary: 'Fetch SDP trace data' })
  @ApiResponse({ status: 200, description: 'SDP trace data' })
  async fetchTrace(@Param() params: GetTraceParamsDto) {
    const result = await this.customerCareService.fetchTrace(
      params.fromhour,
      params.tohour,
      params.sdpvip,
      params.msisdn,
    );
    return { result };
  }

  @Get('gettrace/:fromhour/:tohour/:sdpvip/:msisdn/export')
  @ApiOperation({ summary: 'Export SDP trace to HTML' })
  @ApiResponse({ status: 200, description: 'HTML file download' })
  async exportSdpTraceHtml(
    @Param() params: GetTraceParamsDto,
    @Query() query: ExportTraceQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const rawParam = query.raw === 'true';
    let filePath: string;
    if (rawParam) {
      filePath = await this.customerCareService.exportSdpTraceRawMappingHtml(
        params.fromhour,
        params.tohour,
        params.sdpvip,
        params.msisdn,
      );
    } else {
      filePath = await this.customerCareService.exportSdpTraceHtml(
        params.fromhour,
        params.tohour,
        params.sdpvip,
        params.msisdn,
      );
    }
    res.set({
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="${basename(filePath)}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Get('gettrace/:fromhour/:tohour/:sdpvip/:msisdn/export/raw')
  @ApiOperation({ summary: 'Export raw SDP trace as text' })
  @ApiResponse({ status: 200, description: 'Text file download' })
  async exportSdpTraceRawText(
    @Param() params: GetTraceParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = await this.customerCareService.exportSdpTraceRawText(
      params.fromhour,
      params.tohour,
      params.sdpvip,
      params.msisdn,
    );
    res.set({
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="${basename(filePath)}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  // ───────────────────── 24-25: AIR Trace set/unset ─────────────────────

  @Get('air/settrace/:msisdn')
  @ApiOperation({ summary: 'Set AIR trace for a subscriber' })
  @ApiResponse({ status: 200, description: 'AIR trace set successfully' })
  async setAirTrace(@Param() params: AirTraceParamsDto, @CurrentUser('id') userId: string) {
    await this.customerCareService.setAirTrace(params.msisdn, userId);
    return { result: 'success' };
  }

  @Get('air/unsettrace/:msisdn')
  @ApiOperation({ summary: 'Unset AIR trace for a subscriber' })
  @ApiResponse({ status: 200, description: 'AIR trace unset successfully' })
  async unsetAirTrace(@Param() params: AirTraceParamsDto, @CurrentUser('id') userId: string) {
    await this.customerCareService.unsetAirTrace(params.msisdn, userId);
    return { result: 'success' };
  }

  // ───────────────────── 26-28: AIR Trace fetch & export ─────────────────────

  @Get('air/gettrace/:fromhour/:tohour/:msisdn')
  @ApiOperation({ summary: 'Fetch AIR trace data' })
  @ApiResponse({ status: 200, description: 'AIR trace data with optional download URL' })
  async fetchAirTrace(@Param() params: GetAirTraceParamsDto, @Req() req: Request) {
    const baseUrl = req.protocol + '://' + req.get('host');
    const result = await this.customerCareService.fetchAirTrace(params.fromhour, params.tohour, params.msisdn, baseUrl);
    return { result };
  }

  @Get('air/gettrace/:fromhour/:tohour/:msisdn/export')
  @ApiOperation({ summary: 'Export AIR trace to HTML' })
  @ApiResponse({ status: 200, description: 'HTML file download' })
  async exportAirTraceHtml(
    @Param() params: GetAirTraceParamsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const baseUrl = req.protocol + '://' + req.get('host');
    const filePath = await this.customerCareService.exportAirTraceHtml(
      params.fromhour,
      params.tohour,
      params.msisdn,
      baseUrl,
    );
    res.set({
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="${basename(filePath)}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Get('air/download/trace/:fromhour/:tohour/:msisdn')
  @ApiOperation({ summary: 'Download AIR trace as text file' })
  @ApiResponse({ status: 200, description: 'Text file download' })
  async downloadAirTrace(
    @Param() params: GetAirTraceParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.customerCareService.downloadAirTrace(params.fromhour, params.tohour, params.msisdn);
    res.set({
      'Content-Type': result.fileName ? 'text/plain' : 'text/plain',
      'Content-Disposition': `attachment; filename="${result.fileName || 'downloadFile'}"`,
    });
    return new StreamableFile(Buffer.from(result.content || '', 'utf-8'));
  }

  // ───────────────────── 29-30: Trace History ─────────────────────

  @Get('trace/history/:fromdate/:todate')
  @ApiOperation({ summary: 'Get trace history within date range' })
  @ApiResponse({ status: 200, description: 'Trace history data' })
  async fetchTraceHistory(@Param() params: TraceDateRangeParamsDto) {
    const result = await this.customerCareService.fetchTraceHistory(params.fromdate, params.todate);
    return { result };
  }

  @Get('trace/pending')
  @ApiOperation({ summary: 'Get currently traced numbers' })
  @ApiResponse({ status: 200, description: 'List of traced numbers' })
  async fetchTracedNumbers() {
    const result = await this.customerCareService.fetchTracedNumbers();
    return { result };
  }

  // ───────────────────── 31: Share'n'Sell ─────────────────────

  @Get('sellnshare/history/:fromdate/:todate/:msisdn')
  @ApiOperation({ summary: "Get Share'n'Sell transaction history" })
  @ApiResponse({ status: 200, description: "Share'n'Sell transaction data" })
  async shareNSellTransactionHistory(@Param() params: CdrHistoryParamsDto) {
    const result = await this.customerCareService.shareNSellTransactionHistory(
      params.fromdate,
      params.todate,
      params.msisdn,
    );
    return { result };
  }
}
