import { Injectable } from '@nestjs/common';
import { CustomerCareAirService } from './services/customer-care-air.service';
import { CustomerCareNetworkService } from './services/customer-care-network.service';
import { CustomerCareHistoryService } from './services/customer-care-history.service';
import { CustomerCareSdpTraceService } from './services/customer-care-sdp-trace.service';
import { CustomerCareAirTraceService } from './services/customer-care-air-trace.service';
import {
  SdpDto,
  CustomerCareBasicResponse,
  CustomerCareOffersResponse,
  CustomerCareHlrResponse,
  CustomerCareHssResponse,
  SobDto,
  AirDownloadableDTO,
  ITextToFile,
} from './interfaces/customer-care.interfaces';

@Injectable()
export class CustomerCareService {
  constructor(
    private readonly airService: CustomerCareAirService,
    private readonly networkService: CustomerCareNetworkService,
    private readonly historyService: CustomerCareHistoryService,
    private readonly sdpTraceService: CustomerCareSdpTraceService,
    private readonly airTraceService: CustomerCareAirTraceService,
  ) {}

  // ───────────────────── AIR (require airServerAdjuster) ─────────────────────

  async getSDP(msisdn: string, isTestNumber: boolean): Promise<SdpDto> {
    const request = await this.airService.airServerAdjuster(isTestNumber);
    return this.airService.getSDP(msisdn, request);
  }

  async getDedicatedAccounts(msisdn: string, isTestNumber: boolean): Promise<CustomerCareBasicResponse> {
    const request = await this.airService.airServerAdjuster(isTestNumber);
    return this.airService.getDedicatedAccounts(msisdn, request);
  }

  async getOffers(msisdn: string, isTestNumber: boolean): Promise<CustomerCareOffersResponse> {
    const request = await this.airService.airServerAdjuster(isTestNumber);
    return this.airService.getOffers(msisdn, request);
  }

  async getAccumulators(msisdn: string, isTestNumber: boolean): Promise<CustomerCareBasicResponse> {
    const request = await this.airService.airServerAdjuster(isTestNumber);
    return this.airService.getAccumulators(msisdn, request);
  }

  async getPAM(msisdn: string, isTestNumber: boolean): Promise<CustomerCareBasicResponse> {
    const request = await this.airService.airServerAdjuster(isTestNumber);
    return this.airService.getPAM(msisdn, request);
  }

  async getUsageCounter(msisdn: string, isTestNumber: boolean): Promise<CustomerCareBasicResponse> {
    const request = await this.airService.airServerAdjuster(isTestNumber);
    return this.airService.getUsageCounter(msisdn, request);
  }

  async getUsageThreshold(msisdn: string, isTestNumber: boolean): Promise<CustomerCareBasicResponse> {
    const request = await this.airService.airServerAdjuster(isTestNumber);
    return this.airService.getUsageThreshold(msisdn, request);
  }

  async getSob(msisdn: string, isTestNumber: boolean): Promise<SobDto> {
    const request = await this.airService.airServerAdjuster(isTestNumber);
    return this.airService.getSob(msisdn, request);
  }

  // ───────────────────── Network (direct delegation) ─────────────────────

  async getHLR(msisdn: string): Promise<CustomerCareHlrResponse> {
    return this.networkService.getHLR(msisdn);
  }

  async getHSS(msisdn: string): Promise<CustomerCareHssResponse> {
    return this.networkService.getHSS(msisdn);
  }

  async getMTAS(msisdn: string): Promise<CustomerCareBasicResponse> {
    return this.networkService.getMTAS(msisdn);
  }

  async getSubscriptionHistory(
    userId: string,
    fromDate: string,
    toDate: string,
    isTestNumber: boolean,
    msisdn: string,
  ): Promise<CustomerCareBasicResponse> {
    return this.networkService.getSubscriptionHistory(userId, fromDate, toDate, isTestNumber, msisdn);
  }

  // ───────────────────── History (direct delegation) ─────────────────────

  async getMsapSubscriptionHistory(
    userId: string,
    fromDate: string,
    toDate: string,
    isTestNumber: boolean,
    msisdn: string,
  ): Promise<CustomerCareBasicResponse> {
    return this.historyService.getMsapSubscriptionHistory(userId, fromDate, toDate, isTestNumber, msisdn);
  }

  async getMsapVasSubscription(
    userId: string,
    isTestNumber: boolean,
    msisdn: string,
    fromDate: string,
    toDate: string,
  ): Promise<CustomerCareBasicResponse> {
    return this.historyService.getMsapVasSubscription(userId, isTestNumber, msisdn, fromDate, toDate);
  }

  async getCdrHistory(fromDate: string, toDate: string, msisdn: string): Promise<CustomerCareBasicResponse> {
    return this.historyService.getCdrHistory(msisdn, fromDate, toDate);
  }

  async exportCdrHistoryExcel(fromDate: string, toDate: string, msisdn: string): Promise<string> {
    return this.historyService.exportCdrHistoryExcel(msisdn, fromDate, toDate);
  }

  async getHourlyBalance(date: string, sdpvip: string, msisdn: string): Promise<CustomerCareBasicResponse> {
    return this.historyService.getHourlyBalance(date, sdpvip, msisdn);
  }

  async getDailyDAHistory(
    fromDate: string,
    toDate: string,
    sdpvip: string,
    msisdn: string,
  ): Promise<CustomerCareBasicResponse> {
    return this.historyService.getDailyDAHistory(fromDate, toDate, sdpvip, msisdn);
  }

  async shareNSellTransactionHistory(
    fromDate: string,
    toDate: string,
    msisdn: string,
  ): Promise<CustomerCareBasicResponse> {
    return this.historyService.shareNSellTransactionHistory(fromDate, toDate, msisdn);
  }

  // ───────────────────── SDP Trace (direct delegation) ─────────────────────

  async setTrace(sdpVIP: string, msisdn: string, currentUserId: string): Promise<void> {
    return this.sdpTraceService.setTrace(sdpVIP, msisdn, currentUserId);
  }

  async unsetTrace(sdpVIP: string, msisdn: string, currentUserId: string): Promise<void> {
    return this.sdpTraceService.unsetTrace(sdpVIP, msisdn, currentUserId);
  }

  async fetchTrace(fromTime: string, toTime: string, sdpVIP: string, msisdn: string): Promise<string> {
    return this.sdpTraceService.fetchTrace(fromTime, toTime, sdpVIP, msisdn);
  }

  async exportSdpTraceHtml(fromTime: string, toTime: string, sdpVIP: string, msisdn: string): Promise<string> {
    return this.sdpTraceService.exportSdpTraceHtml(fromTime, toTime, sdpVIP, msisdn);
  }

  async exportSdpTraceRawMappingHtml(
    fromTime: string,
    toTime: string,
    sdpVIP: string,
    msisdn: string,
  ): Promise<string> {
    return this.sdpTraceService.exportSdpTraceRawMappingHtml(fromTime, toTime, sdpVIP, msisdn);
  }

  async exportSdpTraceRawText(fromTime: string, toTime: string, sdpVIP: string, msisdn: string): Promise<string> {
    return this.sdpTraceService.exportSdpTraceRawText(fromTime, toTime, sdpVIP, msisdn);
  }

  // ───────────────────── AIR Trace (direct delegation) ─────────────────────

  async setAirTrace(msisdn: string, currentUserId: string): Promise<void> {
    return this.airTraceService.setAirTrace(msisdn, currentUserId);
  }

  async unsetAirTrace(msisdn: string, currentUserId: string): Promise<void> {
    return this.airTraceService.unsetAirTrace(msisdn, currentUserId);
  }

  async fetchAirTrace(fromTime: string, toTime: string, msisdn: string, baseUrl?: string): Promise<AirDownloadableDTO> {
    return this.airTraceService.fetchAirTrace(fromTime, toTime, msisdn, baseUrl);
  }

  async exportAirTraceHtml(fromTime: string, toTime: string, msisdn: string, baseUrl?: string): Promise<string> {
    return this.airTraceService.exportAirTraceHtml(fromTime, toTime, msisdn, baseUrl);
  }

  async downloadAirTrace(fromTime: string, toTime: string, msisdn: string): Promise<ITextToFile> {
    return this.airTraceService.downloadAirTrace(fromTime, toTime, msisdn);
  }

  async fetchTraceHistory(fromDate: string, toDate: string): Promise<CustomerCareBasicResponse> {
    return this.airTraceService.fetchTraceHistory(fromDate, toDate);
  }

  async fetchTracedNumbers(): Promise<CustomerCareBasicResponse> {
    return this.airTraceService.fetchTracedNumbers();
  }
}
