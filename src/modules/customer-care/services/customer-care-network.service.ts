import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import * as https from 'https';
import { promises as fsPromises } from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { SystemConfigService } from '../../../shared/services/system-config.service';
import { SystemKeys } from '../../../shared/constants';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { capitalize } from '../../../shared/helpers/common.helper';
import {
  CisHttpDTO,
  CustomerCareBasicResponse,
  CustomerCareHlrResponse,
  CustomerCareHssResponse,
  HlrResult,
  HssDTO,
  MtasDTO,
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
export class CustomerCareNetworkService {
  private readonly logger = new Logger(CustomerCareNetworkService.name);

  constructor(private readonly systemConfigService: SystemConfigService) {}

  // ============================================================
  // PUBLIC METHODS
  // ============================================================

  /**
   * Query HLR (Home Location Register) via CAI3G SOAP API.
   * Mirrors v3 getHLR() — prepends country code, sends SOAP request,
   * parses Subscription@GsmHlr response.
   */
  async getHLR(msisdn: string): Promise<CustomerCareHlrResponse> {
    const countryCode = await this.systemConfigService.getConfigValue(SystemKeys.countryCode);
    const fullMsisdn = `${countryCode}${msisdn}`;

    const cai3gUrl = await this.buildCai3gUrl();
    const credentials = await this.getCai3gCredentials();

    const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cai3="http://schemas.ericsson.com/cai3g1.2/" xmlns:gsm="http://schemas.ericsson.com/ema/UserProvisioning/GsmHlr/"><soapenv:Header><wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><wsse:UsernameToken><wsse:Username>${credentials.username}</wsse:Username><wsse:Password>${credentials.password}</wsse:Password></wsse:UsernameToken></wsse:Security></soapenv:Header><soapenv:Body><cai3:Get><cai3:MOType>Subscription@http://schemas.ericsson.com/ema/UserProvisioning/GsmHlr/</cai3:MOType><cai3:MOId><gsm:msisdn>${fullMsisdn}</gsm:msisdn></cai3:MOId><cai3:MOAttributes><gsm:getSubscription msisdn="${fullMsisdn}"/></cai3:MOAttributes></cai3:Get></soapenv:Body></soapenv:Envelope>`;

    let responseData: string;
    try {
      const response = await axios.post(cai3gUrl, soapBody, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://schemas.ericsson.com/cai3g1.2/Get',
        },
        timeout: 15000,
      });
      responseData = String(response.data);
    } catch (error) {
      this.logger.error(`HLR query failed for ${msisdn}`, (error as Error).stack);
      throw new BadRequestException(ErrorMessages.CC_HLR_FAIL);
    }

    const parser = new XMLParser();
    const parsed = parser.parse(responseData);
    const hlrResult = this.parseHlrResult(parsed);
    const header = this.generateHeader(hlrResult as unknown as Record<string, unknown>);

    return { header, body: [hlrResult] };
  }

  /**
   * Query HSS (Home Subscriber Server) via CAI3G SOAP API.
   * Mirrors v3 getHSS() — uses EPSMultiSC@HSS namespace.
   */
  async getHSS(msisdn: string): Promise<CustomerCareHssResponse> {
    const countryCode = await this.systemConfigService.getConfigValue(SystemKeys.countryCode);
    const fullMsisdn = `${countryCode}${msisdn}`;

    const cai3gUrl = await this.buildCai3gUrl();
    const credentials = await this.getCai3gCredentials();

    const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cai3="http://schemas.ericsson.com/cai3g1.2/" xmlns:hss="http://schemas.ericsson.com/ma/HSS/"><soapenv:Header><wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><wsse:UsernameToken><wsse:Username>${credentials.username}</wsse:Username><wsse:Password>${credentials.password}</wsse:Password></wsse:UsernameToken></wsse:Security></soapenv:Header><soapenv:Body><cai3:Get><cai3:MOType>EPSMultiSC@http://schemas.ericsson.com/ma/HSS/</cai3:MOType><cai3:MOId><hss:msisdn>${fullMsisdn}</hss:msisdn></cai3:MOId></cai3:Get></soapenv:Body></soapenv:Envelope>`;

    let responseData: string;
    try {
      const response = await axios.post(cai3gUrl, soapBody, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://schemas.ericsson.com/cai3g1.2/Get',
        },
        timeout: 15000,
      });
      responseData = String(response.data);
    } catch (error) {
      this.logger.error(`HSS query failed for ${msisdn}`, (error as Error).stack);
      throw new BadRequestException(ErrorMessages.CC_HSS_FAIL);
    }

    const parser = new XMLParser();
    const parsed = parser.parse(responseData);
    const hssResult = this.parseHSSResult(parsed);
    const header = this.generateHeader(hssResult as unknown as Record<string, unknown>);

    return { header, body: [hssResult] };
  }

  /**
   * Query MTAS (Multimedia Telephony Application Server) via CAI3G SOAP API.
   * Mirrors v3 getMTAS() — uses Subscription@MTAS namespace with SIP URI format.
   */
  async getMTAS(msisdn: string): Promise<CustomerCareBasicResponse> {
    const countryCode = await this.systemConfigService.getConfigValue(SystemKeys.countryCode);
    const sipUri = `sip:+${countryCode}${msisdn}@ims.mnc030.mcc621.3gppnetwork.org`;

    const cai3gUrl = await this.buildCai3gUrl();
    const credentials = await this.getCai3gCredentials();

    const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cai3="http://schemas.ericsson.com/cai3g1.2/" xmlns:mtas="http://schemas.ericsson.com/ema/UserProvisioning/MTAS/"><soapenv:Header><wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><wsse:UsernameToken><wsse:Username>${credentials.username}</wsse:Username><wsse:Password>${credentials.password}</wsse:Password></wsse:UsernameToken></wsse:Security></soapenv:Header><soapenv:Body><cai3:Get><cai3:MOType>Subscription@http://schemas.ericsson.com/ema/UserProvisioning/MTAS/</cai3:MOType><cai3:MOId><mtas:publicId>${sipUri}</mtas:publicId></cai3:MOId></cai3:Get></soapenv:Body></soapenv:Envelope>`;

    let responseData: string;
    try {
      const response = await axios.post(cai3gUrl, soapBody, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://schemas.ericsson.com/cai3g1.2/Get',
        },
        timeout: 15000,
      });
      responseData = String(response.data);
    } catch (error) {
      this.logger.error(`MTAS query failed for ${msisdn}`, (error as Error).stack);
      throw new BadRequestException(ErrorMessages.CC_MTAS_FAIL);
    }

    const parser = new XMLParser();
    const parsed = parser.parse(responseData);
    const mtasResult = this.parseMTASResult(parsed);
    const header = this.generateHeader(mtasResult as unknown as Record<string, unknown>);

    return { header, body: [mtasResult] };
  }

  /**
   * Fetch CIS subscription history via HTTPS API.
   * Mirrors v3 getSubscriptionHistory() — no temp file writes, parses XML in memory.
   */
  async getSubscriptionHistory(
    userId: string,
    fromDate: string,
    toDate: string,
    isTestNumber: boolean,
    msisdn: string,
  ): Promise<CustomerCareBasicResponse> {
    const configKeys = [
      SystemKeys.cisHost,
      SystemKeys.cisPort,
      SystemKeys.cisUserName,
      SystemKeys.cisPassword,
      SystemKeys.cisTestPort,
      SystemKeys.cisTestHost,
      SystemKeys.countryCode,
      SystemKeys.cisCertificateURL,
    ];

    const config = await this.systemConfigService.getConfigValues(configKeys);

    const httpConfig: CisHttpDTO = {
      UserName: config[SystemKeys.cisUserName] || '',
      PassWord: config[SystemKeys.cisPassword] || '',
      CertificatePath: config[SystemKeys.cisCertificateURL] || '',
      countryCode: config[SystemKeys.countryCode] || '',
      Host: isTestNumber
        ? config[SystemKeys.cisTestHost] || config[SystemKeys.cisHost] || ''
        : config[SystemKeys.cisHost] || '',
      PortNumber: isTestNumber
        ? config[SystemKeys.cisTestPort] || config[SystemKeys.cisPort] || ''
        : config[SystemKeys.cisPort] || '',
    };

    let xmlData: string;
    try {
      xmlData = await this.fetchCisData(httpConfig, msisdn, fromDate, toDate, userId);
    } catch (error) {
      this.logger.error(`CIS subscription history failed for ${msisdn}`, (error as Error).stack);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }

    const result = this.parseCisResponse(xmlData);

    if (!result.body || result.body.length === 0) {
      throw new BadRequestException(ErrorMessages.CC_NO_SUBSCRIPTION_HISTORY);
    }

    return result;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Build the CAI3G SOAP endpoint URL from system config.
   * Fetches cisHost and cisPort, constructs the standard CAI3G path.
   */
  private async buildCai3gUrl(): Promise<string> {
    const config = await this.systemConfigService.getConfigValues([SystemKeys.cisHost, SystemKeys.cisPort]);
    const host = config[SystemKeys.cisHost];
    const port = config[SystemKeys.cisPort];

    if (!host || !port) {
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }

    return `http://${host}:${port}/CAI3G1.2/services/CAI3G1.2`;
  }

  /**
   * Fetch CAI3G SOAP credentials from system config.
   */
  private async getCai3gCredentials(): Promise<{ username: string; password: string }> {
    const config = await this.systemConfigService.getConfigValues([SystemKeys.cisUserName, SystemKeys.cisPassword]);
    return {
      username: config[SystemKeys.cisUserName] || '',
      password: config[SystemKeys.cisPassword] || '',
    };
  }

  /**
   * Parse HLR SOAP response into HlrResult.
   * Navigates: S:Envelope > S:Body > GetResponse > MOAttributes > getResponseSubscription
   */
  private parseHlrResult(result: unknown): HlrResult {
    try {
      const envelope = this.getNestedValue(result, [
        'S:Envelope',
        'S:Body',
        'GetResponse',
        'MOAttributes',
        'getResponseSubscription:getResponseSubscription',
      ]);

      if (!envelope) {
        throw new Error('HLR response structure not found');
      }

      const data = envelope as Record<string, unknown>;
      const locationData = (data.locationData || {}) as Record<string, unknown>;
      const gprs = (data.gprs || {}) as Record<string, unknown>;

      return {
        imsi: this.extractNumber(data, 'imsi'),
        oick: this.extractNumber(data, 'oick'),
        csp: this.extractNumber(data, 'csp'),
        vlrAddress: this.has(locationData, 'vlrAddress') ? String(locationData.vlrAddress) : 'unknown',
        sgsnNumber: this.has(locationData, 'sgsnNumber') ? Number(locationData.sgsnNumber) : undefined,
        vlrData: this.has(data, 'vlrData') ? String(data.vlrData) : 'unknown',
        ts11: this.extractNumber(data, 'ts11'),
        ts21: this.extractNumber(data, 'ts21'),
        ts22: this.extractNumber(data, 'ts22'),
        apnId: this.has(gprs, 'apnid') ? Number(gprs.apnid) : 0,
        tick: this.extractNumber(data, 'tick'),
        obo: this.extractNumber(data, 'obo'),
        obi: this.extractNumber(data, 'obi'),
        obssm: this.extractNumber(data, 'obssm'),
        hlrStatus: this.has(data, 'hlrStatus') ? String(data.hlrStatus) : 'unknown',
        obp: this.extractNumber(data, 'obp'),
      };
    } catch (error) {
      this.logger.error('Failed to parse HLR result', (error as Error).stack);
      throw new BadRequestException(ErrorMessages.CC_HLR_FAIL);
    }
  }

  /**
   * Parse HSS SOAP response into HssDTO.
   * Navigates: S:Envelope > S:Body > GetResponse > MOAttributes > ns:GetResponseEPSMultiSC
   */
  private parseHSSResult(result: unknown): HssDTO {
    try {
      const envelope = this.getNestedValue(result, [
        'S:Envelope',
        'S:Body',
        'GetResponse',
        'MOAttributes',
        'ns:GetResponseEPSMultiSC',
      ]);

      if (!envelope) {
        throw new Error('HSS response structure not found');
      }

      const data = envelope as Record<string, unknown>;

      return {
        hss_imsi: this.has(data, 'ns:imsi') ? Number(data['ns:imsi']) : 0,
        hss_profileId: this.has(data, 'ns:epsProfileId') ? Number(data['ns:epsProfileId']) : 0,
        hss_odb: this.has(data, 'ns:epsOdb') ? String(data['ns:epsOdb']) : 'unknown',
        epsRoamingAllowed: this.has(data, 'epsRoamingAllowed') ? Boolean(data.epsRoamingAllowed) : undefined,
        epsIndividualDefaultContextId: this.has(data, 'epsIndividualDefaultContextId')
          ? Number(data.epsIndividualDefaultContextId)
          : undefined,
        epsIndividualContextId: this.has(data, 'epsIndividualContextId')
          ? Array.isArray(data.epsIndividualContextId)
            ? (data.epsIndividualContextId as number[])
            : [Number(data.epsIndividualContextId)]
          : undefined,
      };
    } catch (error) {
      this.logger.error('Failed to parse HSS result', (error as Error).stack);
      throw new BadRequestException(ErrorMessages.CC_HSS_FAIL);
    }
  }

  /**
   * Parse MTAS SOAP response into MtasDTO.
   * Navigates: S:Envelope > S:Body > GetResponse > MOAttributes >
   *   getResponseSubscription:getResponseSubscription > services > communication-diversion
   */
  private parseMTASResult(result: unknown): MtasDTO {
    try {
      const commDiversion = this.getNestedValue(result, [
        'S:Envelope',
        'S:Body',
        'GetResponse',
        'MOAttributes',
        'getResponseSubscription:getResponseSubscription',
        'services',
        'communication-diversion',
      ]) as Record<string, unknown> | undefined;

      if (!commDiversion) {
        throw new Error('MTAS response structure not found');
      }

      const cdOperatorConfig = (commDiversion['cdiv-operator-configuration'] || {}) as Record<string, unknown>;
      const cdUserConfig = (commDiversion['cdiv-user-configuration'] || {}) as Record<string, unknown>;
      const cdivRuleset = (cdUserConfig['cdiv-ruleset'] || {}) as Record<string, unknown>;
      const cdivRules = cdivRuleset['cdiv-rule'];

      // Find the rule that has cdiv-actions
      let cdivActions: Record<string, unknown> | null = null;
      if (Array.isArray(cdivRules)) {
        for (const rule of cdivRules) {
          if (this.has(rule, 'cdiv-actions')) {
            cdivActions = (rule as Record<string, unknown>)['cdiv-actions'] as Record<string, unknown>;
            break;
          }
        }
      }

      const opConditions = (cdOperatorConfig['cdiv-op-conditions'] || {}) as Record<string, unknown>;

      return {
        activated: this.has(cdOperatorConfig, 'activated') ? Boolean(cdOperatorConfig.activated) : false,
        unconditionalCondition: this.has(opConditions, 'unconditional-condition')
          ? String(opConditions['unconditional-condition'])
          : 'unknown',
        cdivActionTarget:
          cdivActions && this.has(cdivActions, 'forward-to')
            ? String((cdivActions['forward-to'] as Record<string, unknown>)?.target || 'unknown')
            : 'unknown',
        cdivActionNotifyCaller:
          cdivActions && this.has(cdivActions, 'forward-to')
            ? Boolean((cdivActions['forward-to'] as Record<string, unknown>)?.['notify-caller'])
            : false,
      };
    } catch (error) {
      this.logger.error('Failed to parse MTAS result', (error as Error).stack);
      throw new BadRequestException(ErrorMessages.CC_MTAS_FAIL);
    }
  }

  /**
   * Fetch CIS subscription history data via HTTPS GET.
   * Reads CA certificate, creates secure agent, makes request.
   * Returns raw XML string (no temp file — v4 improvement over v3).
   */
  private async fetchCisData(
    httpConfig: CisHttpDTO,
    msisdn: string,
    fromDate: string,
    toDate: string,
    userId: string,
  ): Promise<string> {
    let ca: Buffer | undefined;
    try {
      ca = await fsPromises.readFile(httpConfig.CertificatePath);
    } catch (error) {
      this.logger.warn(`Could not read CIS CA certificate at ${httpConfig.CertificatePath}`, (error as Error).message);
    }

    const agent = new https.Agent({
      ca: ca ? [ca] : undefined,
      rejectUnauthorized: !!ca,
    });

    const clientTransactionId = `${userId}${msisdn}`;
    const url =
      `https://${httpConfig.Host}:${httpConfig.PortNumber}/cisBusiness/service/fulfillmentService` +
      `?msisdn=${httpConfig.countryCode}${msisdn}` +
      `&username=${httpConfig.UserName}` +
      `&password=${httpConfig.PassWord}` +
      `&iname=IMONITOR` +
      `&input=VIEW_SUBSCRIBER_HISTORY` +
      `&startdate=${fromDate} 00:00:00` +
      `&enddate=${toDate} 23:59:59` +
      `&noOfRecords=999` +
      `&clientTransactionId=${clientTransactionId}`;

    const response = await axios.get(url, { httpsAgent: agent, timeout: 15000 });
    return String(response.data);
  }

  /**
   * Parse CIS fulfillment service XML response into tabular format.
   * Extracts product details from responseData.products.productDetails.
   */
  private parseCisResponse(xmlData: string): CustomerCareBasicResponse {
    const parser = new XMLParser();
    const parsed = parser.parse(xmlData);

    if (!this.has(parsed, 'fulfillmentService')) {
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }

    const fulfillment = (parsed as Record<string, unknown>).fulfillmentService as Record<string, unknown>;

    if (String(fulfillment.status) !== 'SUCCESS') {
      this.logger.warn('CIS response status is not SUCCESS', JSON.stringify(fulfillment));
      throw new BadRequestException(ErrorMessages.CC_NO_SUBSCRIPTION_HISTORY);
    }

    const responseData = fulfillment.responseData as Record<string, unknown>;
    if (!responseData || !this.has(responseData, 'products')) {
      throw new BadRequestException(ErrorMessages.CC_NO_SUBSCRIPTION_HISTORY);
    }

    const products = responseData.products as Record<string, unknown>;
    let productDetails = products.productDetails;

    if (!productDetails) {
      throw new BadRequestException(ErrorMessages.CC_NO_SUBSCRIPTION_HISTORY);
    }

    // Ensure productDetails is always an array
    let dataArray: Record<string, unknown>[];
    if (!Array.isArray(productDetails)) {
      dataArray = [productDetails as Record<string, unknown>];
    } else {
      dataArray = productDetails as Record<string, unknown>[];
    }

    const header: TabularHeaderDto[] = [
      { header: 'Product Id', field: 'productId', ...headerDefault },
      { header: 'Product Name', field: 'productName', ...headerDefault },
      { header: 'Product Description', field: 'productDescription', ...headerDefault },
      { header: 'Price', field: 'price', ...headerDefault },
      { header: 'Payment Mode', field: 'paymentMode', ...headerDefault },
      { header: 'Src Channel', field: 'srcChannel', ...headerDefault },
      { header: 'Auto Renewal', field: 'autoRenewal', ...headerDefault },
      { header: 'Action', field: 'action', ...headerDefault },
      { header: 'Cug Id', field: 'cugId', ...headerDefault },
      { header: 'Ben Msisdn', field: 'benMsisdn', ...headerDefault },
      { header: 'Agent Id', field: 'agentId', ...headerDefault },
      { header: 'Offer Id', field: 'offerId', ...headerDefault },
      { header: 'Transaction Date', field: 'transactionDate', ...headerDefault },
      { header: 'Activation Date', field: 'activationDate', ...headerDefault },
      { header: 'Expiry Date', field: 'expiryDate', ...headerDefault },
      { header: 'Status', field: 'status', ...headerDefault },
      { header: 'Failure Reason', field: 'failureReason', ...headerDefault },
    ];

    return { body: dataArray, header };
  }

  /**
   * Check if an object has a key.
   * Supports single key or array of keys for nested access.
   */
  private has(obj: unknown, key: string | string[]): boolean {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return false;
    }

    if (Array.isArray(key)) {
      let current: unknown = obj;
      for (const k of key) {
        if (current === null || current === undefined || typeof current !== 'object') {
          return false;
        }
        if (!(k in (current as Record<string, unknown>))) {
          return false;
        }
        current = (current as Record<string, unknown>)[k];
      }
      return true;
    }

    return key in (obj as Record<string, unknown>);
  }

  /**
   * Generate tabular header from object keys.
   * Splits camelCase into words and capitalizes the first letter.
   */
  private generateHeader(data: Record<string, unknown>): TabularHeaderDto[] {
    const header: TabularHeaderDto[] = [];

    for (const key of Object.keys(data)) {
      const displayName = capitalize(key.split(/(?=[A-Z])/).join(' '));
      header.push({
        header: displayName,
        field: key,
        ...headerDefault,
      });
    }

    return header;
  }

  /**
   * Navigate a nested object by an array of keys.
   * Returns undefined if any key in the path is missing.
   */
  private getNestedValue(obj: unknown, keys: string[]): unknown {
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  /**
   * Safely extract a numeric value from an object by key.
   * Returns 0 if the key does not exist.
   */
  private extractNumber(data: Record<string, unknown>, key: string): number {
    return this.has(data, key) ? Number(data[key]) || 0 : 0;
  }
}
