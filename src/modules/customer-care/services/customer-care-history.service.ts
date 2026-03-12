import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import * as https from 'https';
import { promises as fsPromises } from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { SystemConfigService } from '../../../shared/services/system-config.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { ExportHelperService, ExcelSheet } from '../../../shared/services/export-helper.service';
import { SystemKeys } from '../../../shared/constants';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { capitalize, isUndefinedOrNull } from '../../../shared/helpers/common.helper';
import {
  MsapHttpDTO,
  MsapApiResponse,
  DaasApiResponse,
  CustomerCareBasicResponse,
  CustomerCareResponse,
  HourlyBalanceBodyDto,
  DailyDaBodyDTO,
  TabularHeaderDto,
} from '../interfaces';

/** Default header properties matching v3 headerDefault */
const headerDefault = {
  cellsalign: 'left',
  align: 'left',
  filtertype: 'textbox',
  filtercondition: 'CONTAINS',
};

@Injectable()
export class CustomerCareHistoryService {
  private readonly logger = new Logger(CustomerCareHistoryService.name);

  constructor(
    private readonly systemConfigService: SystemConfigService,
    private readonly dateHelperService: DateHelperService,
    private readonly legacyDataDbService: LegacyDataDbService,
    private readonly exportHelperService: ExportHelperService,
  ) {}

  // ============================================================
  // PUBLIC METHODS
  // ============================================================

  /**
   * Fetch MSAP bundle subscription history.
   * Mirrors v3 getMsapSubscriptionHistory() — MSAP REST API with certificate auth.
   */
  async getMsapSubscriptionHistory(
    userId: string,
    fromDate: string,
    toDate: string,
    isTestNumber: boolean,
    msisdn: string,
  ): Promise<CustomerCareBasicResponse> {
    fromDate = fromDate.substring(0, 10);
    toDate = toDate.substring(0, 10);

    const configKeys = [
      SystemKeys.msapHost,
      SystemKeys.msapTestHost,
      SystemKeys.msapApiKey,
      SystemKeys.msapTestApiKey,
      SystemKeys.msapPlatformId,
      SystemKeys.msapCertificatePath,
      SystemKeys.msapRootCertificatePath,
      SystemKeys.msapBundleSubscriptionEndpoint,
      SystemKeys.countryCode,
    ];

    const config = await this.systemConfigService.getConfigValues(configKeys);

    const httpData: MsapHttpDTO = {
      Host: isTestNumber ? config[SystemKeys.msapTestHost] : config[SystemKeys.msapHost],
      ApiKey: isTestNumber ? config[SystemKeys.msapTestApiKey] : config[SystemKeys.msapApiKey],
      PlatformId: config[SystemKeys.msapPlatformId],
      CertificatePath: config[SystemKeys.msapCertificatePath],
      RootCertificatePath: config[SystemKeys.msapRootCertificatePath],
    };

    const phoneCode = config[SystemKeys.countryCode];
    const msisdnWithCountry = `${phoneCode}${msisdn}`;

    try {
      const data = await this.fetchMsapData(httpData, config[SystemKeys.msapBundleSubscriptionEndpoint], {
        msisdn: msisdnWithCountry,
        startDate: fromDate,
        endDate: toDate,
        requestId: userId,
      });
      return this.parseMsapResponse(data);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  /**
   * Fetch MSAP VAS subscription history.
   * Mirrors v3 getMsapVasSubscription() — optional date range.
   */
  async getMsapVasSubscription(
    userId: string,
    isTestNumber: boolean,
    msisdn: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<CustomerCareBasicResponse> {
    const configKeys = [
      SystemKeys.msapHost,
      SystemKeys.msapTestHost,
      SystemKeys.msapApiKey,
      SystemKeys.msapTestApiKey,
      SystemKeys.msapPlatformId,
      SystemKeys.msapCertificatePath,
      SystemKeys.msapRootCertificatePath,
      SystemKeys.msapVasSubscriptionEndpoint,
      SystemKeys.countryCode,
    ];

    const config = await this.systemConfigService.getConfigValues(configKeys);

    const httpData: MsapHttpDTO = {
      Host: isTestNumber ? config[SystemKeys.msapTestHost] : config[SystemKeys.msapHost],
      ApiKey: isTestNumber ? config[SystemKeys.msapTestApiKey] : config[SystemKeys.msapApiKey],
      PlatformId: config[SystemKeys.msapPlatformId],
      CertificatePath: config[SystemKeys.msapCertificatePath],
      RootCertificatePath: config[SystemKeys.msapRootCertificatePath],
    };

    const phoneCode = config[SystemKeys.countryCode];
    const msisdnWithCountry = `${phoneCode}${msisdn}`;

    const params: Record<string, string> = { msisdn: msisdnWithCountry, requestId: userId };
    if (fromDate) params.startDate = fromDate.substring(0, 10);
    if (toDate) params.endDate = toDate.substring(0, 10);

    try {
      const data = await this.fetchMsapData(httpData, config[SystemKeys.msapVasSubscriptionEndpoint], params);
      return this.parseMsapResponse(data);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  /**
   * Fetch CDR history from DAAS API.
   * Mirrors v3 getCdrHistory() — paginated retrieval with summary row.
   */
  async getCdrHistory(
    msisdn: string,
    fromDate: string,
    toDate: string,
    pageNum = 1,
  ): Promise<CustomerCareBasicResponse> {
    const config = await this.systemConfigService.getConfigValues([SystemKeys.daasHost, SystemKeys.countryCode]);

    const daasHost = config[SystemKeys.daasHost];
    const phoneCode = config[SystemKeys.countryCode];
    const msisdnFull = msisdn.startsWith(phoneCode) ? msisdn : `${phoneCode}${msisdn}`;

    const startdate = fromDate.replace(/-/g, '').substring(0, 8);
    const enddate = toDate.replace(/-/g, '').substring(0, 8);

    try {
      const data = await this.fetchDaasData(daasHost, msisdnFull, startdate, enddate, pageNum);
      return this.parseDaasResponse(data);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  /**
   * Export CDR history as Excel file.
   * Mirrors v3 exportCdrHistoryExcel() — stringify all values to prevent scientific notation.
   */
  async exportCdrHistoryExcel(msisdn: string, fromDate: string, toDate: string): Promise<string> {
    const table = await this.getCdrHistory(msisdn, fromDate, toDate);

    // Stringify all values to prevent Excel auto-converting large numbers
    const formattedBody = (table.body as Record<string, unknown>[]).map((row) => {
      const sanitized: Record<string, unknown> = {};
      for (const key of Object.keys(row)) {
        sanitized[key] = row[key] != null ? String(row[key]) : '';
      }
      return sanitized;
    });

    const sheet: ExcelSheet = {
      name: 'cdr_history',
      header: table.header.map((h) => ({ text: h.header, datafield: h.field })),
      body: formattedBody,
    };

    return this.exportHelperService.exportTabularToExcel([sheet]);
  }

  /**
   * Fetch hourly balance from SDP dump files via SSH.
   * Mirrors v3 gethourlyBalance() — SSH to central storage, grep dump files.
   */
  async getHourlyBalance(
    date: string,
    sdpVip: string,
    msisdn: string,
  ): Promise<CustomerCareResponse<HourlyBalanceBodyDto>> {
    const body: HourlyBalanceBodyDto[] = [];
    const headers: TabularHeaderDto[] = [
      { header: 'Date / Time', field: 'dateTime', ...headerDefault },
      { header: 'Balance (NGN)', field: 'balanceNGN', ...headerDefault },
    ];

    // Get cluster name from SDP nodes
    const clusterQuery = `SELECT CONCAT(cluster,'1') AS cluster FROM \`${process.env.DB_DATA_NAME || 'iMonitorData'}\`.V3_sdp_nodes WHERE vip=? LIMIT 1`;
    const clusterResult = await this.legacyDataDbService.query<{ cluster: string }>(clusterQuery, [sdpVip]);

    if (!clusterResult || clusterResult.length === 0) {
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }

    // Format date: remove last 4 chars to get YYYYMMDDHH
    const adjustedDate = this.dateTimeAdjuster(date);
    const datePrefix = adjustedDate.substring(0, adjustedDate.length - 4);
    const daDumpPath = `/var/opt/fds/dumps/${clusterResult[0].cluster}`;

    // Get SSH credentials for central storage nodes
    const encKeyQuery = `SELECT confVal FROM \`${process.env.DB_CORE_NAME || 'iMonitorV3_1'}\`.core_sys_config WHERE confKey = ?`;
    const sshConfigQuery = `SELECT ip_address, ssh_user, AES_DECRYPT(ssh_pass, (${encKeyQuery})) AS ssh_pass FROM \`${process.env.DB_DATA_NAME || 'iMonitorData'}\`.V3_central_storage_nodes`;
    const sshConfig = await this.legacyDataDbService.query<{
      ip_address: string;
      ssh_user: string;
      ssh_pass: string;
    }>(sshConfigQuery, [SystemKeys.aesEncryptionKey]);

    if (!sshConfig || sshConfig.length === 0) {
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }

    // List remote dump files matching the date
    const listCommand = `ls ${daDumpPath}/ | grep ${datePrefix} | grep dat | awk -F, '{print $1}'`;
    const remoteFileNames = await this.executeSshCommand(
      sshConfig[0].ip_address,
      sshConfig[0].ssh_user,
      sshConfig[0].ssh_pass,
      listCommand,
    );

    if (!remoteFileNames) {
      throw new BadRequestException(ErrorMessages.CC_NO_HOURLY_BALANCE_ON_DATE);
    }

    const fileNames = remoteFileNames.split('\n').filter((n) => n && !n.includes('.gz'));

    for (const fileName of fileNames) {
      const grepCommand = `grep ^${msisdn} ${daDumpPath}/${fileName} | awk -F, '{print $3}'`;
      const balanceStr = await this.executeSshCommand(
        sshConfig[0].ip_address,
        sshConfig[0].ssh_user,
        sshConfig[0].ssh_pass,
        grepCommand,
      );

      if (!balanceStr) {
        throw new BadRequestException(ErrorMessages.CC_NO_HOURLY_BALANCE_ON_NUMBER);
      }

      const balances = balanceStr.split('\n').filter((b) => b);
      const fileDate = fileName.substring(fileName.indexOf('_') + 1);
      const formattedDate =
        fileDate.substring(0, 4) +
        '-' +
        fileDate.substring(4, 6) +
        '-' +
        fileDate.substring(6, 8) +
        ' ' +
        fileDate.substring(8, 10) +
        ':' +
        fileDate.substring(10, 12);

      body.push({ dateTime: formattedDate, balanceNGN: balances[0] });
    }

    return { header: headers, body };
  }

  /**
   * Fetch daily DA history from SDP dump files via SSH.
   * Mirrors v3 getDailyDAHistory() — SSH to central storage, grep DA CSV files.
   */
  async getDailyDAHistory(
    fromDate: string,
    toDate: string,
    sdpVip: string,
    msisdn: string,
  ): Promise<CustomerCareResponse<DailyDaBodyDTO>> {
    const clusterQuery = `SELECT CONCAT(cluster,'1') AS cluster FROM \`${process.env.DB_DATA_NAME || 'iMonitorData'}\`.V3_sdp_nodes WHERE vip=? LIMIT 1`;
    const clusterResult = await this.legacyDataDbService.query<{ cluster: string }>(clusterQuery, [sdpVip]);

    if (!clusterResult || clusterResult.length === 0) {
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }

    const adjFrom = this.dateTimeAdjuster(fromDate).substring(0, 8);
    const adjTo = this.dateTimeAdjuster(toDate).substring(0, 8);
    const daDumpPath = `/var/opt/fds/dumps/${clusterResult[0].cluster}`;

    // Get SSH credentials
    const encKeyQuery = `SELECT confVal FROM \`${process.env.DB_CORE_NAME || 'iMonitorV3_1'}\`.core_sys_config WHERE confKey = ?`;
    const sshConfigQuery = `SELECT ip_address, ssh_user, AES_DECRYPT(ssh_pass, (${encKeyQuery})) AS ssh_pass FROM \`${process.env.DB_DATA_NAME || 'iMonitorData'}\`.V3_central_storage_nodes`;
    const sshConfig = await this.legacyDataDbService.query<{
      ip_address: string;
      ssh_user: string;
      ssh_pass: string;
    }>(sshConfigQuery, [SystemKeys.aesEncryptionKey]);

    if (!sshConfig || sshConfig.length === 0) {
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }

    // List DA CSV files in date range
    const listCommand = `ls ${daDumpPath}/ | grep dedicatedaccount.csv | cut -c 12-19 | nawk -v a=${adjFrom} '($0 >=a) {print $0}' | nawk -v b=${adjTo} '($0 <=b) {print $0}'`;
    const remoteFileNames = await this.executeSshCommand(
      sshConfig[0].ip_address,
      sshConfig[0].ssh_user,
      sshConfig[0].ssh_pass,
      listCommand,
    );

    if (!remoteFileNames) {
      throw new BadRequestException(ErrorMessages.CC_NO_DA_DAILY_BALANCE_ON_DATE);
    }

    const fileNames = remoteFileNames.split('\n').filter((n) => n && !n.includes('.gz'));
    const body: DailyDaBodyDTO[] = [];

    for (const dateStr of fileNames) {
      const grepCommand = `grep ^${msisdn} ${daDumpPath}/*${dateStr}*dedicatedaccount.csv | awk -F, '{print NF","$0}' | nawk -F, -v a=${dateStr} '{ if ($1==5) print a","$3","$4","$5",,,,,,,,,";else print a","$3","$4","$5","$6","$7","$8","$9","$10","$11","$12","$13","$14}'`;
      const dailyDAString = await this.executeSshCommand(
        sshConfig[0].ip_address,
        sshConfig[0].ssh_user,
        sshConfig[0].ssh_pass,
        grepCommand,
      );

      if (!dailyDAString) {
        throw new BadRequestException(ErrorMessages.CC_NO_HOURLY_BALANCE_ON_NUMBER);
      }

      const dailyDALines = dailyDAString.split('\n').filter((l) => l);

      for (const line of dailyDALines) {
        const parts = line.split(',');
        body.push({
          Date: parts[0].substring(0, 4) + '-' + parts[0].substring(4, 6) + '-' + parts[0].substring(6, 8),
          DA_ID: parts[1] || '',
          DA_Balance: parts[2] || '',
          Expiry_Date: parts[3] || '',
          Acc_in_Euro: parts[4] || '',
          Offer_ID: parts[5] || '',
          Start_Date: parts[6] || '',
          DA_Unit_Type: parts[7] || '',
          DA_Category: parts[8] || '',
          Money_Unit_Sub_Type: parts[9] || '',
          DA_Unit_Balance: parts[10] || '',
          PAM_Service_ID: parts[11] || '',
          Product_ID: parts[12] || '',
        });
      }
    }

    if (body.length === 0) {
      throw new BadRequestException(ErrorMessages.CC_NO_DA_DAILY_BALANCE_ON_DATE);
    }

    const headers: TabularHeaderDto[] = Object.keys(body[0]).map((columnName) => ({
      field: columnName,
      header: columnName.replace(/_/g, ' '),
      ...headerDefault,
    }));

    return { header: headers, body };
  }

  /**
   * Fetch Share'n'Sell transaction history via DSM API.
   * Mirrors v3 shareNSellTransactionHistory() — XML POST, parse ocsResponse.
   */
  async shareNSellTransactionHistory(
    msisdn: string,
    fromDate: string,
    toDate: string,
  ): Promise<CustomerCareBasicResponse> {
    const config = await this.systemConfigService.getConfigValues([
      SystemKeys.countryCode,
      SystemKeys.dsmAuthorizationKey,
      SystemKeys.dsmTransactionHistAPI,
    ]);

    const phoneCode = config[SystemKeys.countryCode];
    const msisdnWithCountry = `${phoneCode}${msisdn}`;
    const adjFrom = this.dateTimeAdjuster(fromDate);
    const adjTo = this.dateTimeAdjuster(toDate);

    const payload = `<?xml version="1.0" encoding="UTF-8"?><ocsRequest><cpcgFlag>13</cpcgFlag><requestType>14</requestType><serviceNode>Comviva</serviceNode><callingParty>${msisdnWithCountry}</callingParty><bearerId>SMS</bearerId><asyncFlag>N</asyncFlag><subscrFlag>S</subscrFlag><fromDate>${adjFrom}</fromDate><toDate>${adjTo}</toDate><regionId>-1</regionId><languageId>en</languageId><scpTransactionID>156135egfSfgfgadg09676</scpTransactionID></ocsRequest>`;
    const url = config[SystemKeys.dsmTransactionHistAPI];

    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    let xmlResult: { status: number; data: unknown };
    try {
      xmlResult = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'text/xml',
          Authorization: config[SystemKeys.dsmAuthorizationKey],
        },
        httpsAgent,
        timeout: 15000,
      });
    } catch (error) {
      this.logger.warn('shareNSellTransactionHistory error', (error as Error).message);
      throw new BadRequestException(ErrorMessages.CC_SELL_N_SHARE_FAIL);
    }

    if (xmlResult.status !== 200) {
      throw new BadRequestException(ErrorMessages.CC_ERROR_FROM_HOST);
    }

    if (xmlResult.data == null) {
      throw new BadRequestException(ErrorMessages.CC_EMPTY_RESPONSE);
    }

    const parser = new XMLParser();
    const jsonResult = parser.parse(String(xmlResult.data));

    if (Object.keys(jsonResult).length === 0) {
      throw new BadRequestException(String(xmlResult.data));
    }

    let responseBody = (jsonResult as Record<string, unknown>).ocsResponse;
    if (isUndefinedOrNull(responseBody)) {
      responseBody = (jsonResult as Record<string, unknown>).response;
    }

    const headersValues = Object.keys(responseBody as Record<string, unknown>);
    const header: TabularHeaderDto[] = headersValues.map((columnName) => {
      let displayName: string = columnName.split(/(?=[A-Z])/).join(' ');
      displayName = capitalize(displayName);
      return { header: displayName, field: columnName, ...headerDefault };
    });

    return { header, body: [responseBody] };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Fetch data from MSAP REST API with dual-CA certificate auth.
   * Mirrors v3 fetchMsapData() — in-memory, no temp files.
   */
  private async fetchMsapData(
    httpConfig: MsapHttpDTO,
    endpoint: string,
    params: Record<string, string>,
  ): Promise<MsapApiResponse> {
    const caBufs = await Promise.all([
      fsPromises.readFile(httpConfig.CertificatePath),
      fsPromises.readFile(httpConfig.RootCertificatePath),
    ]);

    const agent = new https.Agent({
      ca: caBufs,
      keepAlive: false,
      rejectUnauthorized: false,
    });

    const queryParams = new URLSearchParams({
      ...params,
      platformId: httpConfig.PlatformId,
    });

    const res = await axios({
      url: `${httpConfig.Host}${endpoint}?${queryParams}`,
      method: 'GET',
      httpsAgent: agent,
      validateStatus: () => true,
      headers: {
        'X-API-KEY': httpConfig.ApiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    return res.data as MsapApiResponse;
  }

  /**
   * Parse MSAP JSON response into tabular format.
   * Mirrors v3 parseMsapResponse().
   */
  private parseMsapResponse(response: MsapApiResponse): CustomerCareBasicResponse {
    if (!response || response.code !== 200 || response.status !== 'Success') {
      throw new BadRequestException(response?.message || ErrorMessages.CC_NO_SUBSCRIPTION_HISTORY);
    }

    let dataArray = response.data;
    if (isUndefinedOrNull(dataArray) || (Array.isArray(dataArray) && dataArray.length === 0)) {
      throw new BadRequestException(ErrorMessages.CC_NO_SUBSCRIPTION_HISTORY);
    }

    if (!Array.isArray(dataArray)) {
      dataArray = [dataArray];
    }

    const bodyKeys = Object.keys(dataArray[0]);
    const header: TabularHeaderDto[] = bodyKeys.map((columnName) => {
      let displayName: string = columnName.split(/(?=[A-Z])/).join(' ');
      displayName = capitalize(displayName);
      return { header: displayName, field: columnName, ...headerDefault };
    });

    return { body: dataArray, header };
  }

  /**
   * Fetch CDR data from DAAS API.
   * Mirrors v3 fetchDaasData() — HTTP GET with pagination.
   */
  private async fetchDaasData(
    host: string,
    msisdn: string,
    startdate: string,
    enddate: string,
    pageNum: number,
  ): Promise<DaasApiResponse> {
    const agent = new https.Agent({ keepAlive: false, rejectUnauthorized: false });

    const queryParams = new URLSearchParams({
      userId: 'user1',
      appName: 'app1',
      hostname: 'hostname1.com',
      startdate,
      enddate,
      msisdn,
      attributes: '*',
      pageNum: String(pageNum),
      pageSize: '500',
      options: 'SPI,DPI,PI',
      format: 'json',
    });

    const res = await axios({
      url: `${host}/DaasAPI/get/cdr.esf.all?${queryParams}`,
      method: 'GET',
      httpsAgent: agent,
      validateStatus: () => true,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    return res.data as DaasApiResponse;
  }

  /**
   * Parse DAAS CDR response with DA detail flattening and summary row.
   * Mirrors v3 parseDaasResponse() exactly.
   */
  private parseDaasResponse(response: DaasApiResponse): CustomerCareBasicResponse {
    if (!response || !response.APIStatus || response.APIStatus.statusCode !== 200) {
      throw new BadRequestException(response?.APIStatus?.statusMsg || 'No CDR records found');
    }

    let dataArray = response.APIData;
    if (isUndefinedOrNull(dataArray) || (Array.isArray(dataArray) && dataArray.length === 0)) {
      throw new BadRequestException(ErrorMessages.CC_NO_SUBSCRIPTION_HISTORY);
    }

    if (!Array.isArray(dataArray)) {
      dataArray = [dataArray] as typeof dataArray;
    }

    // Flatten da_details into top-level columns
    const body: Record<string, unknown>[] = [];
    const summaryKeys = [
      'charged_amount',
      'balance_before_amt',
      'balance_after_amt',
      'da_amount_before',
      'da_amount_after',
      'da_amount_charged',
    ];
    const totals: Record<string, number> = {};
    for (const key of summaryKeys) totals[key] = 0;

    for (const rec of dataArray) {
      const baseRow: Record<string, unknown> = {
        record_type: rec.record_type,
        number_called: rec.number_called,
        event_dt: rec.event_dt,
        call_duration_qty: rec.call_duration_qty,
        charged_amount: rec.charged_amount,
        balance_before_amt: rec.balance_before_amt,
        balance_after_amt: rec.balance_after_amt,
        discount_amt: rec.discount_amt,
        country: rec.country,
        operator: rec.operator,
        bytes_received_qty: rec.bytes_received_qty,
        bytes_sent_qty: rec.bytes_sent_qty,
      };

      const charged = parseFloat(rec.charged_amount);
      const balBefore = parseFloat(rec.balance_before_amt);
      const balAfter = parseFloat(rec.balance_after_amt);
      if (!isNaN(charged)) totals.charged_amount += charged;
      if (!isNaN(balBefore)) totals.balance_before_amt += balBefore;
      if (!isNaN(balAfter)) totals.balance_after_amt += balAfter;

      if (rec.da_details && rec.da_details.length > 0) {
        for (const da of rec.da_details) {
          const daBefore = da.amount_before != null ? da.amount_before : 0;
          const daAfter = da.amount_after != null ? da.amount_after : 0;
          const daCharged = da.amount_charged != null ? da.amount_charged : 0;

          totals.da_amount_before += daBefore;
          totals.da_amount_after += daAfter;
          totals.da_amount_charged += daCharged;

          body.push({
            ...baseRow,
            da_account_id: da.account_id || '',
            da_amount_before: daBefore,
            da_amount_after: daAfter,
            da_amount_charged: daCharged,
          });
        }
      } else {
        body.push({
          ...baseRow,
          da_account_id: '',
          da_amount_before: '',
          da_amount_after: '',
          da_amount_charged: '',
        });
      }
    }

    for (const key of summaryKeys) {
      totals[key] = Math.round(totals[key] * 1000000) / 1000000;
    }

    // Add summary row
    body.push({
      record_type: 'SUMMARY',
      number_called: '',
      event_dt: '',
      call_duration_qty: '',
      charged_amount: totals.charged_amount,
      balance_before_amt: totals.balance_before_amt,
      balance_after_amt: totals.balance_after_amt,
      discount_amt: '',
      da_account_id: '',
      da_amount_before: totals.da_amount_before,
      da_amount_after: totals.da_amount_after,
      da_amount_charged: totals.da_amount_charged,
      country: '',
      operator: '',
      bytes_received_qty: '',
      bytes_sent_qty: '',
    });

    // Build header from flattened columns
    const headerColumns = [
      'record_type',
      'number_called',
      'event_dt',
      'call_duration_qty',
      'charged_amount',
      'balance_before_amt',
      'balance_after_amt',
      'discount_amt',
      'da_account_id',
      'da_amount_before',
      'da_amount_after',
      'da_amount_charged',
      'country',
      'operator',
      'bytes_received_qty',
      'bytes_sent_qty',
    ];

    const header: TabularHeaderDto[] = headerColumns.map((columnName) => {
      let displayName = columnName.replace(/_/g, ' ');
      displayName = capitalize(displayName);
      displayName = displayName.replace(/\bDa\b/g, 'DA');
      return { header: displayName, field: columnName, ...headerDefault };
    });

    return { body, header };
  }

  /**
   * Adjust date-time string to YYYYMMDDHHMMSS format.
   * Mirrors v3 DateTimeAdjuster().
   */
  private dateTimeAdjuster(dateStr: string): string {
    return dateStr
      .replace(/[-T: ]/g, '')
      .substring(0, 14)
      .padEnd(14, '0');
  }

  /**
   * Execute SSH command on a remote host.
   * Uses ssh2-promise for remote command execution.
   */
  private async executeSshCommand(
    host: string,
    username: string,
    password: string,
    command: string,
  ): Promise<string | null> {
    // Dynamic import to avoid issues if ssh2-promise is not available
    try {
      const SSH2Promise = (await import('ssh2-promise')).default;
      const ssh = new SSH2Promise({
        host,
        username,
        password,
        tryKeyboard: true,
        reconnect: false,
        readyTimeout: 30000,
      });
      const result = await ssh.exec(command);
      await ssh.close();
      return result || null;
    } catch (error) {
      this.logger.error(`SSH command failed on ${host}`, (error as Error).stack);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }
}
