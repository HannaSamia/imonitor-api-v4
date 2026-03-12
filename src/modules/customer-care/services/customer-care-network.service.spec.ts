import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { SystemKeys } from '../../../shared/constants';
import { ErrorMessages } from '../../../shared/constants/error-messages';

// Mock SystemConfigService module before importing the service under test
// to avoid transitive @nestjs/typeorm native module resolution issues.
jest.mock('../../../shared/services/system-config.service', () => ({
  SystemConfigService: class MockSystemConfigService {},
}));

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock fs.promises.readFile to avoid real filesystem access
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn().mockRejectedValue(new Error('mock: no cert file')),
  },
}));

// Import after mocks are set up
import { CustomerCareNetworkService } from './customer-care-network.service';
import { SystemConfigService } from '../../../shared/services/system-config.service';

// ─── Mock SOAP/XML Responses ──────────────────────────────────────────────────

const MOCK_HLR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <GetResponse>
      <MOAttributes>
        <getResponseSubscription:getResponseSubscription>
          <imsi>123456789012345</imsi>
          <csp>10</csp>
          <oick>5</oick>
          <locationData>
            <vlrAddress>192.168.1.1</vlrAddress>
            <sgsnNumber>99887766</sgsnNumber>
          </locationData>
          <vlrData>active</vlrData>
          <ts11>1</ts11>
          <ts21>1</ts21>
          <ts22>0</ts22>
          <gprs>
            <apnid>3</apnid>
          </gprs>
          <tick>2</tick>
          <obo>0</obo>
          <obi>0</obi>
          <obssm>0</obssm>
          <hlrStatus>active</hlrStatus>
          <obp>0</obp>
        </getResponseSubscription:getResponseSubscription>
      </MOAttributes>
    </GetResponse>
  </S:Body>
</S:Envelope>`;

const MOCK_HSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <GetResponse>
      <MOAttributes>
        <ns:GetResponseEPSMultiSC>
          <ns:imsi>123456789012345</ns:imsi>
          <ns:epsProfileId>100</ns:epsProfileId>
          <ns:epsOdb>ODB_ALL_BARRING</ns:epsOdb>
          <epsRoamingAllowed>true</epsRoamingAllowed>
          <epsIndividualDefaultContextId>5</epsIndividualDefaultContextId>
          <epsIndividualContextId>7</epsIndividualContextId>
        </ns:GetResponseEPSMultiSC>
      </MOAttributes>
    </GetResponse>
  </S:Body>
</S:Envelope>`;

const MOCK_MTAS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <GetResponse>
      <MOAttributes>
        <getResponseSubscription:getResponseSubscription>
          <services>
            <communication-diversion>
              <cdiv-operator-configuration>
                <activated>true</activated>
                <cdiv-op-conditions>
                  <unconditional-condition>enabled</unconditional-condition>
                </cdiv-op-conditions>
              </cdiv-operator-configuration>
              <cdiv-user-configuration>
                <cdiv-ruleset>
                  <cdiv-rule>
                    <cdiv-conditions>
                      <busy/>
                    </cdiv-conditions>
                  </cdiv-rule>
                  <cdiv-rule>
                    <cdiv-actions>
                      <forward-to>
                        <target>sip:+2349012345678@ims.example.org</target>
                        <notify-caller>true</notify-caller>
                      </forward-to>
                    </cdiv-actions>
                  </cdiv-rule>
                </cdiv-ruleset>
              </cdiv-user-configuration>
            </communication-diversion>
          </services>
        </getResponseSubscription:getResponseSubscription>
      </MOAttributes>
    </GetResponse>
  </S:Body>
</S:Envelope>`;

const MOCK_CIS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<fulfillmentService>
  <status>SUCCESS</status>
  <responseData>
    <products>
      <productDetails>
        <productId>PRD-001</productId>
        <productName>Data Bundle 1GB</productName>
        <productDescription>1GB monthly data</productDescription>
        <price>500</price>
        <paymentMode>prepaid</paymentMode>
        <srcChannel>USSD</srcChannel>
        <autoRenewal>true</autoRenewal>
        <action>ACTIVATE</action>
        <cugId>0</cugId>
        <benMsisdn>9012345678</benMsisdn>
        <agentId>AGT-01</agentId>
        <offerId>OFF-100</offerId>
        <transactionDate>2026-03-10 14:30:00</transactionDate>
        <activationDate>2026-03-10 14:30:00</activationDate>
        <expiryDate>2026-04-10 14:30:00</expiryDate>
        <status>ACTIVE</status>
        <failureReason></failureReason>
      </productDetails>
    </products>
  </responseData>
</fulfillmentService>`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockSystemConfigService() {
  return {
    getConfigValue: jest.fn().mockResolvedValue('234'),
    getConfigValues: jest.fn().mockResolvedValue({
      [SystemKeys.cisHost]: '10.0.0.1',
      [SystemKeys.cisPort]: '8080',
      [SystemKeys.cisUserName]: 'testuser',
      [SystemKeys.cisPassword]: 'testpass',
      [SystemKeys.cisTestHost]: '10.0.0.2',
      [SystemKeys.cisTestPort]: '9090',
      [SystemKeys.countryCode]: '234',
      [SystemKeys.cisCertificateURL]: '/path/to/cert.pem',
    }),
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('CustomerCareNetworkService', () => {
  let service: any;
  let systemConfigService: ReturnType<typeof createMockSystemConfigService>;

  beforeEach(async () => {
    systemConfigService = createMockSystemConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerCareNetworkService, { provide: SystemConfigService, useValue: systemConfigService }],
    }).compile();

    service = module.get(CustomerCareNetworkService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── getHLR ────────────────────────────────────────────────────────────────

  describe('getHLR', () => {
    it('should parse SOAP response and return HlrResult with header and body', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: MOCK_HLR_XML });

      const result = await service.getHLR('9012345678');

      expect(result.body).toHaveLength(1);
      const hlr = result.body[0];
      expect(hlr.imsi).toBe(123456789012345);
      expect(hlr.csp).toBe(10);
      expect(hlr.oick).toBe(5);
      expect(hlr.vlrAddress).toBe('192.168.1.1');
      expect(hlr.sgsnNumber).toBe(99887766);
      expect(hlr.vlrData).toBe('active');
      expect(hlr.ts11).toBe(1);
      expect(hlr.ts21).toBe(1);
      expect(hlr.ts22).toBe(0);
      expect(hlr.apnId).toBe(3);
      expect(hlr.tick).toBe(2);
      expect(hlr.obo).toBe(0);
      expect(hlr.obi).toBe(0);
      expect(hlr.obssm).toBe(0);
      expect(hlr.hlrStatus).toBe('active');
      expect(hlr.obp).toBe(0);
    });

    it('should generate a header from the HlrResult keys', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: MOCK_HLR_XML });

      const result = await service.getHLR('9012345678');

      expect(result.header).toBeDefined();
      expect(result.header.length).toBeGreaterThan(0);
      // Each header entry should have field, header, cellsalign, align
      const firstHeader = result.header[0];
      expect(firstHeader).toHaveProperty('field');
      expect(firstHeader).toHaveProperty('header');
      expect(firstHeader).toHaveProperty('cellsalign', 'left');
      expect(firstHeader).toHaveProperty('align', 'left');
    });

    it('should prepend country code to msisdn', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: MOCK_HLR_XML });

      await service.getHLR('9012345678');

      // getConfigValue called for countryCode, getConfigValues called for cai3g url + credentials
      expect(systemConfigService.getConfigValue).toHaveBeenCalledWith(SystemKeys.countryCode);
      // The SOAP body should contain the full msisdn with country code
      const soapBody = mockedAxios.post.mock.calls[0][1] as string;
      expect(soapBody).toContain('2349012345678');
    });

    it('should throw BadRequestException with CC_HLR_FAIL when axios fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.getHLR('9012345678')).rejects.toThrow(BadRequestException);
      await expect(service.getHLR('9012345678')).rejects.toThrow(ErrorMessages.CC_HLR_FAIL);
    });

    it('should throw BadRequestException when SOAP response structure is missing', async () => {
      const badXml = `<?xml version="1.0"?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><GetResponse><MOAttributes></MOAttributes></GetResponse></S:Body></S:Envelope>`;
      mockedAxios.post.mockResolvedValueOnce({ data: badXml });

      await expect(service.getHLR('9012345678')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getHSS ────────────────────────────────────────────────────────────────

  describe('getHSS', () => {
    it('should parse SOAP response and return HssDTO with header and body', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: MOCK_HSS_XML });

      const result = await service.getHSS('9012345678');

      expect(result.body).toHaveLength(1);
      const hss = result.body[0];
      expect(hss.hss_imsi).toBe(123456789012345);
      expect(hss.hss_profileId).toBe(100);
      expect(hss.hss_odb).toBe('ODB_ALL_BARRING');
      expect(hss.epsRoamingAllowed).toBe(true);
      expect(hss.epsIndividualDefaultContextId).toBe(5);
      expect(hss.epsIndividualContextId).toEqual([7]);
    });

    it('should generate a header from the HssDTO keys', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: MOCK_HSS_XML });

      const result = await service.getHSS('9012345678');

      expect(result.header).toBeDefined();
      expect(result.header.length).toBeGreaterThan(0);
      const imsiHeader = result.header.find((h: any) => h.field === 'hss_imsi');
      expect(imsiHeader).toBeDefined();
    });

    it('should throw BadRequestException with CC_HSS_FAIL when axios fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.getHSS('9012345678')).rejects.toThrow(BadRequestException);
      await expect(service.getHSS('9012345678')).rejects.toThrow(ErrorMessages.CC_HSS_FAIL);
    });

    it('should throw BadRequestException when HSS response structure is missing', async () => {
      const badXml = `<?xml version="1.0"?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><GetResponse><MOAttributes></MOAttributes></GetResponse></S:Body></S:Envelope>`;
      mockedAxios.post.mockResolvedValueOnce({ data: badXml });

      await expect(service.getHSS('9012345678')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getMTAS ───────────────────────────────────────────────────────────────

  describe('getMTAS', () => {
    it('should parse SOAP response and return MtasDTO with header and body', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: MOCK_MTAS_XML });

      const result = await service.getMTAS('9012345678');

      expect(result.body).toHaveLength(1);
      const mtas = result.body[0] as Record<string, unknown>;
      expect(mtas.activated).toBe(true);
      expect(mtas.unconditionalCondition).toBe('enabled');
      expect(mtas.cdivActionTarget).toBe('sip:+2349012345678@ims.example.org');
      expect(mtas.cdivActionNotifyCaller).toBe(true);
    });

    it('should generate a header from the MtasDTO keys', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: MOCK_MTAS_XML });

      const result = await service.getMTAS('9012345678');

      expect(result.header).toBeDefined();
      expect(result.header.length).toBe(4);
      const activatedHeader = result.header.find((h: any) => h.field === 'activated');
      expect(activatedHeader).toBeDefined();
    });

    it('should use SIP URI format for MTAS request', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: MOCK_MTAS_XML });

      await service.getMTAS('9012345678');

      const soapBody = mockedAxios.post.mock.calls[0][1] as string;
      expect(soapBody).toContain('sip:+2349012345678@ims.mnc030.mcc621.3gppnetwork.org');
    });

    it('should throw BadRequestException with CC_MTAS_FAIL when axios fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.getMTAS('9012345678')).rejects.toThrow(BadRequestException);
      await expect(service.getMTAS('9012345678')).rejects.toThrow(ErrorMessages.CC_MTAS_FAIL);
    });

    it('should throw BadRequestException when MTAS response structure is missing', async () => {
      const badXml = `<?xml version="1.0"?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><GetResponse><MOAttributes><getResponseSubscription:getResponseSubscription><services></services></getResponseSubscription:getResponseSubscription></MOAttributes></GetResponse></S:Body></S:Envelope>`;
      mockedAxios.post.mockResolvedValueOnce({ data: badXml });

      await expect(service.getMTAS('9012345678')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getSubscriptionHistory ────────────────────────────────────────────────

  describe('getSubscriptionHistory', () => {
    it('should parse CIS XML response and return header + body with product details', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: MOCK_CIS_XML });

      const result = await service.getSubscriptionHistory('user-1', '2026-03-01', '2026-03-10', false, '9012345678');

      expect(result.body).toHaveLength(1);
      const product = result.body[0] as Record<string, unknown>;
      expect(product.productId).toBe('PRD-001');
      expect(product.productName).toBe('Data Bundle 1GB');
      expect(product.price).toBe(500);
      expect(product.status).toBe('ACTIVE');
    });

    it('should return a predefined header with 17 columns', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: MOCK_CIS_XML });

      const result = await service.getSubscriptionHistory('user-1', '2026-03-01', '2026-03-10', false, '9012345678');

      expect(result.header).toHaveLength(17);
      expect(result.header[0]).toEqual(expect.objectContaining({ header: 'Product Id', field: 'productId' }));
      expect(result.header[16]).toEqual(expect.objectContaining({ header: 'Failure Reason', field: 'failureReason' }));
    });

    it('should use test host/port when isTestNumber is true', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: MOCK_CIS_XML });

      await service.getSubscriptionHistory('user-1', '2026-03-01', '2026-03-10', true, '9012345678');

      const url = mockedAxios.get.mock.calls[0][0] as string;
      expect(url).toContain('10.0.0.2');
      expect(url).toContain('9090');
    });

    it('should use production host/port when isTestNumber is false', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: MOCK_CIS_XML });

      await service.getSubscriptionHistory('user-1', '2026-03-01', '2026-03-10', false, '9012345678');

      const url = mockedAxios.get.mock.calls[0][0] as string;
      expect(url).toContain('10.0.0.1');
      expect(url).toContain('8080');
    });

    it('should throw BadRequestException when CIS request fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        service.getSubscriptionHistory('user-1', '2026-03-01', '2026-03-10', false, '9012345678'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when CIS response status is not SUCCESS', async () => {
      const failXml = `<?xml version="1.0"?><fulfillmentService><status>FAILURE</status><responseData></responseData></fulfillmentService>`;
      mockedAxios.get.mockResolvedValueOnce({ data: failXml });

      await expect(
        service.getSubscriptionHistory('user-1', '2026-03-01', '2026-03-10', false, '9012345678'),
      ).rejects.toThrow(ErrorMessages.CC_NO_SUBSCRIPTION_HISTORY);
    });

    it('should throw BadRequestException when there are no product details', async () => {
      const emptyXml = `<?xml version="1.0"?><fulfillmentService><status>SUCCESS</status><responseData><products></products></responseData></fulfillmentService>`;
      mockedAxios.get.mockResolvedValueOnce({ data: emptyXml });

      await expect(
        service.getSubscriptionHistory('user-1', '2026-03-01', '2026-03-10', false, '9012345678'),
      ).rejects.toThrow(ErrorMessages.CC_NO_SUBSCRIPTION_HISTORY);
    });

    it('should handle single productDetails (not wrapped in array)', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: MOCK_CIS_XML });

      const result = await service.getSubscriptionHistory('user-1', '2026-03-01', '2026-03-10', false, '9012345678');

      // Single product detail should still be wrapped in an array
      expect(Array.isArray(result.body)).toBe(true);
      expect(result.body).toHaveLength(1);
    });

    it('should handle multiple productDetails entries', async () => {
      const multiXml = `<?xml version="1.0"?>
<fulfillmentService>
  <status>SUCCESS</status>
  <responseData>
    <products>
      <productDetails>
        <productId>PRD-001</productId>
        <productName>Bundle A</productName>
      </productDetails>
      <productDetails>
        <productId>PRD-002</productId>
        <productName>Bundle B</productName>
      </productDetails>
    </products>
  </responseData>
</fulfillmentService>`;
      mockedAxios.get.mockResolvedValueOnce({ data: multiXml });

      const result = await service.getSubscriptionHistory('user-1', '2026-03-01', '2026-03-10', false, '9012345678');

      expect(result.body).toHaveLength(2);
    });

    it('should throw BadRequestException when fulfillmentService element is missing', async () => {
      const badXml = `<?xml version="1.0"?><root><data>something</data></root>`;
      mockedAxios.get.mockResolvedValueOnce({ data: badXml });

      await expect(
        service.getSubscriptionHistory('user-1', '2026-03-01', '2026-03-10', false, '9012345678'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── buildCai3gUrl (tested indirectly) ─────────────────────────────────────

  describe('buildCai3gUrl (via getHLR)', () => {
    it('should throw BadRequestException when cisHost is missing', async () => {
      systemConfigService.getConfigValues.mockResolvedValueOnce({
        [SystemKeys.cisHost]: '',
        [SystemKeys.cisPort]: '8080',
      });

      await expect(service.getHLR('9012345678')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when cisPort is missing', async () => {
      systemConfigService.getConfigValues.mockResolvedValueOnce({
        [SystemKeys.cisHost]: '10.0.0.1',
        [SystemKeys.cisPort]: '',
      });

      await expect(service.getHLR('9012345678')).rejects.toThrow(BadRequestException);
    });
  });
});
