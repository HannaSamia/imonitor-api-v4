import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';
import { Resolver } from 'dns/promises';
import { XMLParser } from 'fast-xml-parser';
import { SystemConfigService } from '../../../shared/services/system-config.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { CoreCustomerCareError } from '../../../database/entities/core-customer-care-error.entity';
import { SystemKeys } from '../../../shared/constants';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { isUndefinedOrNull, capitalize, generateGuid } from '../../../shared/helpers/common.helper';
import {
  CustomerCareXMLRequest,
  SdpDto,
  CustomerCareBasicResponse,
  CustomerCareDedicatedAccountsResponse,
  CustomerCareOffersResponse,
  SobDto,
  TabularHeaderDto,
} from '../interfaces';
import { BadRequestException } from '@nestjs/common';

/** Default header properties matching v3 headerDefault */
const headerDefault = {
  cellsalign: 'left',
  align: 'left',
  filtertype: 'textbox',
  filtercondition: 'CONTAINS',
};

@Injectable()
export class CustomerCareAirService {
  private readonly logger = new Logger(CustomerCareAirService.name);

  constructor(
    private readonly systemConfigService: SystemConfigService,
    private readonly dateHelperService: DateHelperService,
    private readonly legacyDataDbService: LegacyDataDbService,
    @InjectRepository(CoreCustomerCareError)
    private readonly errorRepo: Repository<CoreCustomerCareError>,
  ) {}

  /**
   * Fetch AIR server configuration from DB.
   * Mirrors v3 airServerAdjuster() exactly.
   */
  async airServerAdjuster(isTestNumber = false): Promise<CustomerCareXMLRequest> {
    const prefix = isTestNumber ? 'test' : '';
    const suffix = isTestNumber ? '_test' : '';

    const keys = [
      `air_server${suffix}`,
      `air_server_user${suffix}`,
      `air_server_pass${suffix}`,
      `air_home_dir${suffix}`,
      `air_sdp_user${suffix}`,
      `air_sdp_pass${suffix}`,
      `air_report_date${suffix}`,
      `air_date_time${suffix}`,
      isTestNumber ? 'air_trans_id_test' : undefined,
      `air_server_port${suffix}`,
    ].filter(Boolean) as string[];

    const params = await this.systemConfigService.getConfigValues(keys);

    const dateTimeFormat = params[`air_date_time${suffix}`];
    const DateTime = this.dateHelperService.formatDate(dateTimeFormat || "yyyyMMdd'T'HH:mm:ssXXX");
    const TransID = this.dateHelperService.formatDate('yy') + Math.floor(Date.now() / 10).toString();

    return {
      AIRServer: params[`air_server${suffix}`],
      usr: params[`air_server_user${suffix}`],
      pass: params[`air_server_pass${suffix}`],
      homedir: params[`air_home_dir${suffix}`],
      SDPUSR: params[`air_sdp_user${suffix}`],
      SDPPASS: params[`air_sdp_pass${suffix}`],
      ReportDate: params[`air_report_date${suffix}`],
      DateTime,
      TransID,
      Port: parseInt(params[`air_server_port${suffix}`]) || 0,
      Agent: '',
    };
  }

  /**
   * Resolve SDP address via DNS lookup.
   * Returns SDP VIP address, ID, and cluster name.
   */
  async getSDP(MSISDN: string, request: CustomerCareXMLRequest): Promise<SdpDto> {
    const phoneCode = await this.systemConfigService.getConfigValue(SystemKeys.countryCode);
    let msisdnDns = `${phoneCode}${MSISDN}`;
    const lastDigit = msisdnDns.charAt(msisdnDns.length - 1);
    msisdnDns = msisdnDns.substring(0, msisdnDns.length - 1).concat(`.${lastDigit}.msisdn.sub.cs`);

    let sdpAddress = '';
    try {
      const resolver = new Resolver();
      resolver.setServers([request.AIRServer]);
      const addresses = await resolver.resolve4(msisdnDns);
      sdpAddress = addresses[addresses.length - 1];
    } catch (error) {
      throw new BadRequestException(ErrorMessages.CC_SDP_WRONG_NUMBER);
    }

    if (!sdpAddress) {
      throw new BadRequestException(ErrorMessages.CC_SDP_WRONG_NUMBER);
    }

    const sdpResult = await this.legacyDataDbService.query<{ sdp_id: string; cluster: string }>(
      `SELECT IFNULL(sdp_id, 'Undefined') AS sdp_id, IFNULL(cluster, 'Undefined') AS cluster
       FROM V3_sdp_nodes WHERE vip = ? LIMIT 1`,
      [sdpAddress],
    );

    const row = sdpResult.length > 0 ? sdpResult[0] : { sdp_id: 'Undefined', cluster: 'Undefined' };

    return {
      sdpVIP: sdpAddress,
      sdpId: row.sdp_id,
      sdpName: row.cluster,
    };
  }

  /**
   * Fetch dedicated accounts via AIR XML-RPC GetBalanceAndDate.
   */
  async getDedicatedAccounts(
    MSISDN: string,
    request: CustomerCareXMLRequest,
  ): Promise<CustomerCareDedicatedAccountsResponse> {
    const systemResult = await this.systemConfigService.getConfigValues([
      SystemKeys.dateBalancePort,
      SystemKeys.dateBalanceAgent,
    ]);
    request.Port = parseInt(systemResult[SystemKeys.dateBalancePort]) || 0;
    request.Agent = systemResult[SystemKeys.dateBalanceAgent];

    if (!request.Port) {
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }

    const xmlBody = this.buildGetBalanceAndDateXml(MSISDN, request);
    const parsedXml = await this.executeAirXmlRpc(xmlBody, request);

    let result = { header: [] as TabularHeaderDto[], body: [] as Record<string, unknown>[] };
    try {
      result = this.headerBodyGenerator(parsedXml, 'dedicatedAccountInformation');
    } catch (error) {
      this.logError('getDedicatedAccounts', MSISDN, parsedXml);
      if ((error as Error).message === 'KEY_NOT_FOUND') {
        throw new BadRequestException(ErrorMessages.CC_DEDICATED_ACCOUNTS_NOT_FOUND);
      }
      throw new BadRequestException(ErrorMessages.CC_DATA_PARSING);
    }

    // Check which headers are already present
    let isClosestDateInHeader = false;
    let isClosestAmountInHeader = false;
    let isCompositeInHeader = false;

    for (const h of result.header) {
      if (h.field?.includes('closestExpiryDate')) isClosestDateInHeader = true;
      if (h.field?.includes('closestExpiryValue')) isClosestAmountInHeader = true;
      if (h.field?.includes('composite')) isCompositeInHeader = true;
    }

    if (!isCompositeInHeader) {
      result.header.push({
        header: 'Composite',
        field: 'composite',
        ...headerDefault,
        columntype: 'checkbox',
      } as TabularHeaderDto);
    }
    if (!isClosestDateInHeader) {
      result.header.push({
        header: 'Closest Expiry Date',
        field: 'closestExpiryDateTime',
        ...headerDefault,
      } as TabularHeaderDto);
    }
    if (!isClosestAmountInHeader) {
      result.header.push({
        header: 'Closest Expiry Balance',
        field: 'closestExpiryValue1',
        ...headerDefault,
      } as TabularHeaderDto);
    }

    // Fetch all possible DA IDs for description lookup
    const daIdsResult = await this.legacyDataDbService.query<{ da_id: number }>(
      'SELECT da_id FROM V3_dedicated_accounts GROUP BY da_id',
    );
    const daIds = daIdsResult.map((r) => r.da_id.toString());

    for (const bodyObj of result.body) {
      this.modifyDedicatedAccountBody(bodyObj, isClosestDateInHeader, isClosestAmountInHeader);

      if (daIds.includes(String(bodyObj.dedicatedAccountID))) {
        const descResult = await this.legacyDataDbService.query<{ description: string }>(
          `SELECT IFNULL((SELECT REPLACE(description, '"', '') FROM V3_dedicated_accounts WHERE da_id = ?), 'Undefined') AS description`,
          [bodyObj.dedicatedAccountID],
        );
        bodyObj.description = descResult[0]?.description || 'Undefined';
      } else {
        bodyObj.description = 'Undefined';
      }

      if (bodyObj.dedicatedAccountValue1 !== 0 && bodyObj.dedicatedAccountValue1 !== '0') {
        bodyObj.dedicatedAccountValue1 = String(bodyObj.dedicatedAccountValue1).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
    }

    result.header.push({ header: 'Description', field: 'description', ...headerDefault } as TabularHeaderDto);
    result.header = this.generateDedicatedAccountHeader(result.header);

    return result as unknown as CustomerCareDedicatedAccountsResponse;
  }

  /**
   * Fetch active offers via AIR XML-RPC GetBalanceAndDate.
   */
  async getOffers(MSISDN: string, request: CustomerCareXMLRequest): Promise<CustomerCareOffersResponse> {
    const systemResult = await this.systemConfigService.getConfigValues([
      SystemKeys.dateBalancePort,
      SystemKeys.dateBalanceAgent,
    ]);
    request.Port = parseInt(systemResult[SystemKeys.dateBalancePort]) || 0;
    request.Agent = systemResult[SystemKeys.dateBalanceAgent];

    const xmlBody = this.buildGetBalanceAndDateXml(MSISDN, request);
    const parsedXml = await this.executeAirXmlRpc(xmlBody, request);

    let result = { header: [] as TabularHeaderDto[], body: [] as Record<string, unknown>[] };
    try {
      result = this.headerBodyGenerator(parsedXml, 'offerInformationList');
    } catch (error) {
      this.logError('getOffers', MSISDN, parsedXml);
      if ((error as Error).message === 'KEY_NOT_FOUND') {
        throw new BadRequestException(ErrorMessages.CC_OFFERS_NOT_FOUND);
      }
      throw new BadRequestException(ErrorMessages.CC_DATA_PARSING);
    }

    const newHeader: TabularHeaderDto[] = [];
    for (const element of result.header) {
      switch (element.field) {
        case 'offerID':
          newHeader[0] = { header: 'Offer ID', field: element.field, ...headerDefault };
          break;
        case 'offerType':
          newHeader[1] = { header: 'Offer Type', field: element.field, ...headerDefault };
          break;
        case 'startDateTime':
        case 'startDate':
          newHeader[2] = { header: 'Start Date', field: 'startDate', ...headerDefault };
          break;
        case 'expiryDateTime':
        case 'expiryDate':
          newHeader[3] = { header: 'Expiry Date', field: 'expiryDate', ...headerDefault };
          break;
      }
    }
    result.header = newHeader.filter(Boolean);
    return result as unknown as CustomerCareOffersResponse;
  }

  /**
   * Fetch accumulators via AIR XML-RPC GetAccumulators.
   */
  async getAccumulators(MSISDN: string, request: CustomerCareXMLRequest): Promise<CustomerCareBasicResponse> {
    const accumAgent = await this.systemConfigService.getConfigValue(SystemKeys.accumulatorAgent);
    request.Agent = accumAgent;

    const xmlBody = this.buildGetAccumulatorsXml(MSISDN, request);
    const parsedXml = await this.executeAirXmlRpc(xmlBody, request);

    let result = { header: [] as TabularHeaderDto[], body: [] as Record<string, unknown>[] };
    try {
      result = this.headerBodyGenerator(parsedXml, 'accumulatorInformation');
    } catch (error) {
      this.logError('getAccumulators', MSISDN, parsedXml);
      if ((error as Error).message === 'KEY_NOT_FOUND') {
        throw new BadRequestException(ErrorMessages.CC_ACCUMULATORS_NOT_FOUND);
      }
      throw new BadRequestException(ErrorMessages.CC_DATA_PARSING);
    }

    const newHeader: TabularHeaderDto[] = [];
    for (const element of result.header) {
      switch (element.field) {
        case 'accumulatorID':
          newHeader[0] = { header: 'Accumulator ID', field: element.field, ...headerDefault };
          break;
        case 'accumulatorValue':
          newHeader[1] = { header: 'Value', field: element.field, ...headerDefault };
          break;
        case 'accumulatorStartDate':
          newHeader[2] = { header: 'Start Date', field: element.field, ...headerDefault };
          break;
        case 'accumulatorEndDate':
          newHeader[3] = { header: 'Expiry Date', field: element.field, ...headerDefault };
          break;
      }
    }
    result.header = newHeader.filter(Boolean);
    return result;
  }

  /**
   * Fetch PAM services via AIR XML-RPC GetAccountDetails with requestPamInformationFlag.
   */
  async getPAM(MSISDN: string, request: CustomerCareXMLRequest): Promise<CustomerCareBasicResponse> {
    const accDetailsAgent = await this.systemConfigService.getConfigValue(SystemKeys.accountDetailsAgent);
    request.Agent = accDetailsAgent;

    const xmlBody = this.buildGetAccountDetailsXml(MSISDN, request);
    const parsedXml = await this.executeAirXmlRpc(xmlBody, request);

    let result = { header: [] as TabularHeaderDto[], body: [] as Record<string, unknown>[] };
    try {
      result = this.headerBodyGenerator(parsedXml, 'pamInformationList');
    } catch (error) {
      this.logError('getPAM', MSISDN, parsedXml);
      if ((error as Error).message === 'KEY_NOT_FOUND') {
        throw new BadRequestException(ErrorMessages.CC_PAM_DATA_NOT_FOUND);
      }
      throw new BadRequestException(ErrorMessages.CC_DATA_PARSING);
    }

    const newHeader: TabularHeaderDto[] = [];
    for (const element of result.header) {
      switch (element.field) {
        case 'pamClassID':
          newHeader[0] = { header: 'PAM Class ID', field: element.field, ...headerDefault };
          break;
        case 'pamServiceID':
          newHeader[1] = { header: 'PAM Service ID', field: element.field, ...headerDefault };
          break;
        case 'scheduleID':
          newHeader[2] = { header: 'Schedule ID', field: element.field, ...headerDefault };
          break;
        case 'currentPamPeriod':
          newHeader[3] = { header: 'Current PAM Period ', field: element.field, ...headerDefault };
          break;
        case 'lastEvaluationDate':
          newHeader[4] = { header: 'Last Evaluation Date', field: element.field, ...headerDefault };
          break;
      }
    }
    result.header = newHeader.filter(Boolean);
    return result;
  }

  /**
   * Fetch usage counters via AIR XML-RPC GetUsageThresholdsAndCounters.
   */
  async getUsageCounter(MSISDN: string, request: CustomerCareXMLRequest): Promise<CustomerCareBasicResponse> {
    const monetaryCost = 'Monetary Cost';
    const nonMonetaryCost = 'Non-Monetary Unit';

    const usageAgent = await this.systemConfigService.getConfigValue(SystemKeys.usageAgent);
    request.Agent = usageAgent;

    const xmlBody = this.buildGetUsageThresholdsAndCountersXml(MSISDN, request);
    const parsedXml = await this.executeAirXmlRpc(xmlBody, request);

    let result = { header: [] as TabularHeaderDto[], body: [] as Record<string, unknown>[] };
    try {
      result = this.headerBodyGenerator(parsedXml, 'usageCounterUsageThresholdInformation');
    } catch (error) {
      this.logError('getUsageCounter', MSISDN, parsedXml);
      if ((error as Error).message === 'KEY_NOT_FOUND') {
        throw new BadRequestException(ErrorMessages.CC_USAGE_COUNTER_NOT_FOUND);
      }
      throw new BadRequestException(ErrorMessages.CC_DATA_PARSING);
    }

    for (const element of result.body) {
      delete (element as Record<string, unknown>).productID;

      const thresholdInfo = (element as Record<string, unknown>).usageThresholdInformation;
      if (thresholdInfo && Array.isArray(thresholdInfo)) {
        for (const subElement of thresholdInfo) {
          const elementToCheck = Array.isArray(subElement) ? subElement[0] : subElement;
          if (this.has(elementToCheck, 'usageThresholdMonetaryValue1')) {
            (element as Record<string, unknown>).valueType = monetaryCost;
            break;
          } else if (this.has(elementToCheck, 'usageThresholdValue')) {
            (element as Record<string, unknown>).valueType = nonMonetaryCost;
            break;
          }
        }
        delete (element as Record<string, unknown>).usageThresholdInformation;
      }

      const el = element as Record<string, unknown>;
      if (this.has(el, 'usageCounterValue') && !this.has(el, 'usageCounterMonetaryValue1')) {
        if (el.valueType === nonMonetaryCost) {
          el.usageCounterMonetaryValue1 = el.usageCounterValue;
        } else {
          el.usageCounterMonetaryValue1 = (el.usageCounterValue as number) / 100;
        }
        delete el.usageCounterValue;
      } else if (this.has(el, 'usageCounterMonetaryValue1')) {
        if (el.valueType !== nonMonetaryCost) {
          el.usageCounterMonetaryValue1 = (el.usageCounterMonetaryValue1 as number) / 100;
        }
      }
    }

    const newHeader: TabularHeaderDto[] = [];
    for (const element of result.header) {
      switch (element.field) {
        case 'usageCounterID':
          newHeader[0] = { header: 'Usage Counter ID', field: element.field, ...headerDefault };
          break;
        case 'usageCounterMonetaryValue1':
        case 'usageCounterValue':
          newHeader[1] = { header: 'Value', field: 'usageCounterMonetaryValue1', ...headerDefault };
          break;
      }
    }
    newHeader.push({ header: 'Value Type', field: 'valueType', ...headerDefault });
    result.header = newHeader.filter(Boolean);
    return result;
  }

  /**
   * Fetch usage thresholds via AIR XML-RPC GetUsageThresholdsAndCounters.
   */
  async getUsageThreshold(MSISDN: string, request: CustomerCareXMLRequest): Promise<CustomerCareBasicResponse> {
    const usageAgent = await this.systemConfigService.getConfigValue(SystemKeys.usageAgent);
    request.Agent = usageAgent;

    const xmlBody = this.buildGetUsageThresholdsAndCountersXml(MSISDN, request);
    const parsedXml = await this.executeAirXmlRpc(xmlBody, request);

    let result = { header: [] as TabularHeaderDto[], body: [] as Record<string, unknown>[] };
    try {
      result = this.headerBodyGenerator(parsedXml, 'usageCounterUsageThresholdInformation');
    } catch (error) {
      this.logError('getUsageThreshold', MSISDN, parsedXml);
      if ((error as Error).message === 'KEY_NOT_FOUND') {
        throw new BadRequestException(ErrorMessages.CC_USAGE_THRESHOLD_NOT_FOUND);
      }
      throw new BadRequestException(ErrorMessages.CC_DATA_PARSING);
    }

    const resultBody: Record<string, unknown>[] = [];
    for (const element of result.body) {
      const el = element as Record<string, unknown>;
      if (this.has(el, 'usageThresholdInformation') && Array.isArray(el.usageThresholdInformation)) {
        for (let j = 0; j < (el.usageThresholdInformation as unknown[]).length; j++) {
          let thresholdBody = (el.usageThresholdInformation as unknown[])[j] as Record<string, unknown>;
          if (Array.isArray(thresholdBody)) {
            thresholdBody = thresholdBody[0] as Record<string, unknown>;
          }
          thresholdBody.usageCounterID = el.usageCounterID;

          if (this.has(thresholdBody, 'usageThresholdMonetaryValue1')) {
            thresholdBody.usageThresholdMonetaryValue1 = (thresholdBody.usageThresholdMonetaryValue1 as number) / 100;
          } else {
            thresholdBody.usageThresholdMonetaryValue1 = thresholdBody.usageThresholdValue;
          }
          resultBody.push(thresholdBody);
        }
      }
    }
    result.body = resultBody;

    result.header = [
      { header: 'Usage Threshold ID', field: 'usageThresholdID', ...headerDefault },
      { header: 'Usage Counter ID', field: 'usageCounterID', ...headerDefault },
      { header: 'Source', field: 'usageThresholdSource', ...headerDefault },
      { header: 'Value', field: 'usageThresholdMonetaryValue1', ...headerDefault },
    ];
    return result;
  }

  /**
   * Fetch SOB (Service of Breath) data — combines GetAccountDetails + GetBalanceAndDate.
   */
  async getSob(MSISDN: string, request: CustomerCareXMLRequest): Promise<SobDto> {
    const systemValues = await this.systemConfigService.getConfigValues([
      SystemKeys.dateBalancePort,
      SystemKeys.dateBalanceAgent,
      SystemKeys.accountDetailsAgent,
    ]);

    const balanceRequest = { ...request };
    balanceRequest.Port = parseInt(systemValues[SystemKeys.dateBalancePort]) || 0;
    balanceRequest.Agent = systemValues[SystemKeys.dateBalanceAgent];

    request.Agent = systemValues[SystemKeys.accountDetailsAgent];

    const accountDetailsXml = this.buildGetAccountDetailsXml(MSISDN, request);
    const balanceXml = this.buildGetBalanceAndDateXml(MSISDN, balanceRequest);

    const [accountDetailParsed, balanceParsed] = await Promise.all([
      this.executeAirXmlRpc(accountDetailsXml, request),
      this.executeAirXmlRpc(balanceXml, balanceRequest),
    ]);

    // Fetch service class name
    const serviceQuery = await this.legacyDataDbService.query<{ service_name: string }>(
      `SELECT IFNULL((SELECT sc_name FROM V3_service_classes WHERE sc_code = ?), 'Undefined') AS service_name FROM dual`,
      [accountDetailParsed.serviceClassCurrent],
    );

    const isTemporaryBlocked = accountDetailParsed.temporaryBlockedFlag
      ? this.has(accountDetailParsed, 'temporaryBlockedFlag')
      : false;

    // Extract GDS (offerProviderID) values from offerInformationList
    const gdsValues: string[] = [];
    if (
      this.has(accountDetailParsed, 'offerInformationList') &&
      Array.isArray(accountDetailParsed.offerInformationList)
    ) {
      for (const offer of accountDetailParsed.offerInformationList) {
        const offerObj = Array.isArray(offer) ? offer[0] : offer;
        if (this.has(offerObj, 'offerProviderID') && offerObj.offerProviderID) {
          gdsValues.push(offerObj.offerProviderID);
        }
      }
    }

    const ad = accountDetailParsed as Record<string, unknown>;
    const communityInfo = ad.communityInformationCurrent as Record<string, unknown>[] | undefined;

    const result: SobDto = {
      serviceExipryDate: this.formatDateValues(String(ad.serviceFeeExpiryDate || '')),
      activationDate: this.formatDateValues(String(ad.activationDate || '')),
      language: String(ad.languageIDCurrent || ''),
      serviceRemovalDate: this.formatDateValues(String(ad.serviceRemovalDate || '')),
      accountGroupId: String(ad.accountGroupID || ''),
      supervisionExpiryDate: this.formatDateValues(String(ad.supervisionExpiryDate || '')),
      SOB: 0,
      GDS: gdsValues,
      CUG: communityInfo?.[0] ? ((communityInfo[0] as Record<string, unknown>).communityID as number) || 0 : 0,
      serviceName: serviceQuery[0]?.service_name || 'Undefined',
      serviceId: String(ad.serviceClassCurrent || ''),
      EOCN: parseInt(String(ad.ussdEndOfCallNotificationID || '0')) || 0,
      temporaryBlockedFlag: isTemporaryBlocked,
      balance:
        ((Number(balanceParsed.accountValue1) || 0) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' (NGN)',
    };

    // Calculate SOB from serviceOfferings binary flags
    try {
      const bodyHeaderResult = this.headerBodyGenerator(accountDetailParsed, 'serviceOfferings');
      let binary = '';
      for (const element of bodyHeaderResult.body) {
        binary += (element as Record<string, unknown>).serviceOfferingActiveFlag;
      }
      const reversedBinary = binary.split('').reverse().join('');
      result.SOB = parseInt(reversedBinary, 2) || 0;
    } catch {
      // serviceOfferings may not be present — SOB stays 0
    }

    return result;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Execute an AIR XML-RPC call via HTTP POST and parse the XML response.
   * Replaces v3's FetchFile + XMLParser — no temp files needed.
   */
  private async executeAirXmlRpc(xmlBody: string, request: CustomerCareXMLRequest): Promise<Record<string, unknown>> {
    const url = `http://${request.AIRServer}:${request.Port}/Air`;

    const res = await axios.post(url, xmlBody, {
      headers: {
        'Content-Type': 'text/xml',
        'User-Agent': String(request.Agent || ''),
        'X-Requested-With': 'XMLHttpRequest',
      },
      auth: {
        username: request.usr,
        password: request.pass,
      },
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
      timeout: 15000,
    });

    return this.parseXmlRpcResponse(String(res.data));
  }

  /**
   * Parse XML-RPC response string into a flat object.
   * Mirrors v3 XMLParser + RecursiveObjectReader.
   */
  private parseXmlRpcResponse(xml: string): Record<string, unknown> {
    const parser = new XMLParser();
    const parsed = parser.parse(xml);

    if (parsed.methodResponse?.fault) {
      const errorCode = parsed.methodResponse.fault.value?.struct?.member?.[0]?.value?.i4;
      const errorMessage = parsed.methodResponse.fault.value?.struct?.member?.[1]?.value?.string;
      throw new BadRequestException(`Failed with code: ${errorCode} and Message: ${errorMessage}`);
    }

    const memberArray = parsed.methodResponse?.params?.param?.value?.struct?.member;
    if (!memberArray) {
      throw new BadRequestException(ErrorMessages.CC_EMPTY_RESPONSE);
    }

    const result = this.recursiveObjectReader(memberArray);

    const responseCode = result.responseCode;
    if (responseCode !== 0 && responseCode !== 1 && responseCode !== 2) {
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }

    return result;
  }

  /**
   * Recursively parse XML-RPC struct members into a JS object.
   * Mirrors v3 RecursiveObjectReader exactly.
   */
  private recursiveObjectReader(members: unknown[] | Record<string, unknown>): Record<string, unknown> {
    const resultObject: Record<string, unknown> = {};

    if (!Array.isArray(members)) {
      const member = members as Record<string, unknown>;
      const value = member.value as Record<string, unknown>;

      if (
        this.has(value, 'string') ||
        this.has(value, 'composite') ||
        this.has(value, 'i4') ||
        this.has(value, 'boolean') ||
        this.has(value, 'dateTime.iso8601')
      ) {
        resultObject[member.name as string] = value[Object.keys(value)[0]];
      } else if (this.has(value, 'struct')) {
        const struct = value.struct as Record<string, unknown>;
        resultObject[member.name as string] = [this.recursiveObjectReader(struct.member as unknown[])];
      } else if (this.has(value, 'array')) {
        const arr = value.array as Record<string, unknown>;
        const data = arr.data as Record<string, unknown>;
        const dataValue = data.value;
        const array: unknown[] = [];

        if (!Array.isArray(dataValue) && this.has(dataValue as Record<string, unknown>, 'struct')) {
          const struct = (dataValue as Record<string, unknown>).struct as Record<string, unknown>;
          array.push([this.recursiveObjectReader(struct.member as unknown[])]);
        } else if (Array.isArray(dataValue)) {
          for (const element of dataValue) {
            if (this.has(element as Record<string, unknown>, 'struct')) {
              const struct = (element as Record<string, unknown>).struct as Record<string, unknown>;
              array.push([this.recursiveObjectReader(struct.member as unknown[])]);
            }
          }
        }
        resultObject[member.name as string] = array;
      }
      return resultObject;
    }

    for (const item of members) {
      const member = item as Record<string, unknown>;
      const value = member.value as Record<string, unknown>;
      if (!value) continue;

      if (
        this.has(value, 'string') ||
        this.has(value, 'composite') ||
        this.has(value, 'i4') ||
        this.has(value, 'boolean') ||
        this.has(value, 'dateTime.iso8601')
      ) {
        resultObject[member.name as string] = value[Object.keys(value)[0]];
      } else if (this.has(value, 'struct')) {
        const struct = value.struct as Record<string, unknown>;
        resultObject[member.name as string] = [this.recursiveObjectReader(struct.member as unknown[])];
      } else if (this.has(value, 'array')) {
        const arr = value.array as Record<string, unknown>;
        const data = arr.data as Record<string, unknown>;
        const dataValue = data.value;
        const array: unknown[] = [];

        if (!Array.isArray(dataValue) && this.has(dataValue as Record<string, unknown>, 'struct')) {
          const struct = (dataValue as Record<string, unknown>).struct as Record<string, unknown>;
          array.push(this.recursiveObjectReader(struct.member as unknown[]));
        } else if (Array.isArray(dataValue)) {
          for (const element of dataValue) {
            if (this.has(element as Record<string, unknown>, 'struct')) {
              const struct = (element as Record<string, unknown>).struct as Record<string, unknown>;
              array.push([this.recursiveObjectReader(struct.member as unknown[])]);
            }
          }
        }
        resultObject[member.name as string] = array;
      }
    }
    return resultObject;
  }

  /**
   * Generate header/body from parsed XML object by key.
   * Mirrors v3 HeaderBodyGenerator.
   */
  private headerBodyGenerator(
    sourceObject: Record<string, unknown>,
    key: string,
  ): { header: TabularHeaderDto[]; body: Record<string, unknown>[] } {
    const body = sourceObject[key] as Record<string, unknown>[];

    if (isUndefinedOrNull(body)) {
      throw new Error('KEY_NOT_FOUND');
    }

    let columnsArray: string[] = [];
    const header: TabularHeaderDto[] = [];

    for (let i = body.length - 1; i >= 0; i--) {
      let bodyObject = body[i] as Record<string, unknown>;
      if ((bodyObject as unknown as unknown[])?.[0]) {
        bodyObject = (bodyObject as unknown as unknown[])[0] as Record<string, unknown>;
      }

      if (columnsArray.length < Object.keys(bodyObject).length) {
        columnsArray = Object.keys(bodyObject);
      }

      body[i] = bodyObject;
      this.bodyValuesModifier(body[i]);

      if (!this.has(body[i], 'startDate')) {
        (body[i] as Record<string, unknown>).startDate = 'Always';
      }
      if (!this.has(body[i], 'expiryDate')) {
        (body[i] as Record<string, unknown>).expiryDate = 'Never';
      }

      // Handle expiryDateTime/startDateTime → expiryDate/startDate
      if (this.has(body[i], 'expiryDateTime')) {
        (body[i] as Record<string, unknown>).expiryDate = (body[i] as Record<string, unknown>).expiryDateTime;
        delete (body[i] as Record<string, unknown>).expiryDateTime;
      }
      if (this.has(body[i], 'startDateTime')) {
        (body[i] as Record<string, unknown>).startDate = (body[i] as Record<string, unknown>).startDateTime;
        delete (body[i] as Record<string, unknown>).startDateTime;
      }
    }

    for (const columnName of columnsArray) {
      let displayName = columnName.split(/(?=[A-Z])/).join(' ');
      displayName = capitalize(displayName);
      header.push({ header: displayName, field: columnName, ...headerDefault });
    }

    return { header, body };
  }

  /**
   * Modify body date values: set startDate to 'Always', expiryDate to 'Never' when appropriate.
   * Mirrors v3 BodyValuesModifier.
   */
  private bodyValuesModifier(element: Record<string, unknown>): void {
    const elementKeys = Object.keys(element);
    for (const key of elementKeys) {
      if (key.toLowerCase().includes('date')) {
        const val = String(element[key]);
        if (
          (key.toLowerCase().includes('end') || key.toLowerCase().includes('expiry')) &&
          (val.includes('9999') || val.includes(' '))
        ) {
          element[key] = 'Never';
        } else if (key.toLowerCase().includes('start') && (/^0000/.test(val) || val.includes(' '))) {
          element[key] = 'Always';
        } else if (val.length >= 14) {
          element[key] = `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)} ${val.substring(9, 14)}`;
        }
      }
    }
  }

  /** Format raw AIR date string. Mirrors v3 formatDateValues. */
  private formatDateValues(value: string): string {
    if (!value || value.length < 14) return value || '';
    return `${value.substring(0, 4)}-${value.substring(4, 6)}-${value.substring(6, 8)} ${value.substring(9, 14)}`;
  }

  /** Generate dedicated account header with specific column ordering. Mirrors v3. */
  private generateDedicatedAccountHeader(header: TabularHeaderDto[]): TabularHeaderDto[] {
    const newHeader: TabularHeaderDto[] = [];
    for (const element of header) {
      switch (element.field) {
        case 'dedicatedAccountID':
          newHeader[0] = { header: 'Dedicated Account ID', field: element.field, ...headerDefault };
          break;
        case 'dedicatedAccountValue1':
          newHeader[1] = { header: 'Balance (NGN)', field: element.field, ...headerDefault };
          break;
        case 'startDate':
          newHeader[3] = { header: 'Start Date', field: element.field, ...headerDefault };
          break;
        case 'expiryDate':
          newHeader[4] = { header: 'Expiry Date', field: element.field, ...headerDefault };
          break;
        case 'closestExpiryValue1':
          newHeader[5] = { header: 'Closest Expiry Balance', field: element.field, ...headerDefault };
          break;
        case 'closestExpiryDateTime':
          newHeader[6] = { header: 'Closest Expiry Date', field: element.field, ...headerDefault };
          break;
        case 'description':
          newHeader[8] = { header: 'Description', field: element.field, ...headerDefault };
          break;
        case 'dedicatedAccountUnitType':
          newHeader[7] = { header: 'Unit Type', field: element.field, ...headerDefault };
          break;
        case 'composite':
        case 'compositeDedicatedAccountFlag':
          newHeader[2] = { header: 'Composite', field: 'composite', ...headerDefault, columntype: 'checkbox' };
          break;
      }
    }
    return newHeader.filter(Boolean);
  }

  /** Modify dedicated account body values. Mirrors v3 modifieDedicatedAccountBody. */
  private modifyDedicatedAccountBody(
    bodyObject: Record<string, unknown>,
    isClosestDateInHeader: boolean,
    isClosestAmountInHeader: boolean,
  ): void {
    if (!this.has(bodyObject, 'composite')) {
      bodyObject.composite = 0;
    } else {
      bodyObject.composite = 1;
    }
    if (!isClosestDateInHeader) {
      bodyObject.closestExpiryDateTime = 'Never';
    }
    if (!isClosestAmountInHeader) {
      bodyObject.closestExpiryValue1 = '-';
    }

    for (const key in bodyObject) {
      if (key.toLowerCase().includes('dedicatedaccountunittype')) {
        if (bodyObject.dedicatedAccountUnitType !== 5) {
          bodyObject.dedicatedAccountValue1 = ((bodyObject.dedicatedAccountValue1 as number) / 100).toString();
        }
        const unitTypeMap: Record<number, string> = {
          0: 'Time',
          1: 'Money',
          2: 'Total Octets',
          3: 'Input Octets',
          4: 'Output octets',
          5: 'Service Specific Units',
          6: 'Volume',
        };
        bodyObject[key] = unitTypeMap[bodyObject[key] as number] || bodyObject[key];
      }

      if (key.toLowerCase().includes('dedicatedaccountflag')) {
        bodyObject.dedicatedAccountID = bodyObject.dedicatedAccountID + ' (sub-DA)';
        bodyObject.composite = 1;
      }
    }
  }

  /** Fire-and-forget error logging to core_customer_care_error. */
  private logError(functionName: string, phone: string, parsedXml: unknown): void {
    this.errorRepo
      .save(
        this.errorRepo.create({
          functionName,
          phone,
          data: JSON.stringify(parsedXml),
        }),
      )
      .catch((err) => this.logger.error('Failed to log customer care error', err));
  }

  /** Check if an object has a key. */
  private has(obj: unknown, key: string): boolean {
    return obj !== null && obj !== undefined && typeof obj === 'object' && key in (obj as Record<string, unknown>);
  }

  // ============================================================
  // XML BODY BUILDERS
  // ============================================================

  private buildGetBalanceAndDateXml(MSISDN: string, request: CustomerCareXMLRequest): string {
    return `<?xml version="1.0" encoding="iso-8859-1"?><methodCall><methodName>GetBalanceAndDate</methodName><params><param><value><struct><member><name>originNodeType</name><value><string>EXT</string></value></member><member><name>originHostName</name><value><string>ojvascssim01</string></value></member><member><name>originTransactionID</name><value><string>${request.TransID}</string></value></member><member><name>originTimeStamp</name><value><dateTime.iso8601>${request.DateTime}</dateTime.iso8601></value></member><member><name>subscriberNumberNAI</name><value><int>2</int></value></member><member><name>subscriberNumber</name><value><string>${MSISDN}</string></value></member></struct></value></param></params></methodCall>`;
  }

  private buildGetAccumulatorsXml(MSISDN: string, request: CustomerCareXMLRequest): string {
    return `<?xml version="1.0" encoding="iso-8859-1"?><methodCall><methodName>GetAccumulators</methodName><params><param><value><struct><member><name>originNodeType</name><value><string>EXT</string></value></member><member><name>originHostName</name><value><string>iMonitor</string></value></member><member><name>originTransactionID</name><value><string>${request.TransID}</string></value></member><member><name>originTimeStamp</name><value><dateTime.iso8601>${request.DateTime}</dateTime.iso8601></value></member><member><name>subscriberNumber</name><value><string>${MSISDN}</string></value></member></struct></value></param></params></methodCall>`;
  }

  private buildGetAccountDetailsXml(MSISDN: string, request: CustomerCareXMLRequest): string {
    return `<?xml version="1.0" encoding="iso-8859-1"?><methodCall><methodName>GetAccountDetails</methodName><params><param><value><struct><member><name>originNodeType</name><value><string>EXT</string></value></member><member><name>originHostName</name><value><string>ojvascssim01</string></value></member><member><name>originTransactionID</name><value><string>${request.TransID}</string></value></member><member><name>originTimeStamp</name><value><dateTime.iso8601>${request.DateTime}</dateTime.iso8601></value></member><member><name>subscriberNumberNAI</name><value><int>2</int></value></member><member><name>subscriberNumber</name><value><string>${MSISDN}</string></value></member><member><name>requestPamInformationFlag</name><value><boolean>1</boolean></value></member></struct></value></param></params></methodCall>`;
  }

  private buildGetUsageThresholdsAndCountersXml(MSISDN: string, request: CustomerCareXMLRequest): string {
    return `<?xml version="1.0" encoding="iso-8859-1"?><methodCall><methodName>GetUsageThresholdsAndCounters</methodName><params><param><value><struct><member><name>originNodeType</name><value><string>EXT</string></value></member><member><name>originHostName</name><value><string>iMonitor</string></value></member><member><name>originTransactionID</name><value><string>${request.TransID}</string></value></member><member><name>originTimeStamp</name><value><dateTime.iso8601>${request.DateTime}</dateTime.iso8601></value></member><member><name>subscriberNumber</name><value><string>${MSISDN}</string></value></member></struct></value></param></params></methodCall>`;
  }
}
