import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CustomerCareAirService } from './customer-care-air.service';
import { SystemConfigService } from '../../../shared/services/system-config.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { CoreCustomerCareError } from '../../../database/entities/core-customer-care-error.entity';
import { CustomerCareXMLRequest } from '../interfaces';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { Resolver } from 'dns/promises';

jest.mock('dns/promises');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockRequest(overrides: Partial<CustomerCareXMLRequest> = {}): CustomerCareXMLRequest {
  return {
    AIRServer: '10.0.0.1',
    usr: 'admin',
    pass: 'secret',
    homedir: '/home/air',
    SDPUSR: 'sdpuser',
    SDPPASS: 'sdppass',
    ReportDate: '20260312',
    DateTime: '20260312T10:00:00+03:00',
    TransID: '261234567890',
    Port: 8080,
    Agent: 'TestAgent',
    ...overrides,
  };
}

/** Build a minimal XML-RPC methodResponse with the given members (flat key-value). */
function buildXmlRpcResponse(members: Record<string, { type: string; value: unknown }>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, { type, value }] of Object.entries(members)) {
    if (type === 'array') {
      result[key] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('CustomerCareAirService', () => {
  let service: CustomerCareAirService;
  let systemConfigService: any;
  let dateHelperService: any;
  let legacyDataDbService: any;
  let errorRepo: any;

  beforeEach(async () => {
    systemConfigService = {
      getConfigValues: jest.fn().mockResolvedValue({}),
      getConfigValue: jest.fn().mockResolvedValue(''),
    };

    dateHelperService = {
      formatDate: jest.fn().mockReturnValue('20260312T10:00:00+03:00'),
    };

    legacyDataDbService = {
      query: jest.fn().mockResolvedValue([]),
    };

    errorRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerCareAirService,
        { provide: SystemConfigService, useValue: systemConfigService },
        { provide: DateHelperService, useValue: dateHelperService },
        { provide: LegacyDataDbService, useValue: legacyDataDbService },
        { provide: getRepositoryToken(CoreCustomerCareError), useValue: errorRepo },
      ],
    }).compile();

    service = module.get<CustomerCareAirService>(CustomerCareAirService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── airServerAdjuster ────────────────────────────────────────────────────

  describe('airServerAdjuster', () => {
    it('should fetch production config keys when isTest=false', async () => {
      systemConfigService.getConfigValues.mockResolvedValue({
        air_server: '10.0.0.1',
        air_server_user: 'admin',
        air_server_pass: 'pass123',
        air_home_dir: '/home/air',
        air_sdp_user: 'sdpusr',
        air_sdp_pass: 'sdppass',
        air_report_date: '20260312',
        air_date_time: "yyyyMMdd'T'HH:mm:ssXXX",
        air_server_port: '8080',
      });
      dateHelperService.formatDate.mockReturnValueOnce('20260312T10:00:00+03:00').mockReturnValueOnce('26');

      const result = await service.airServerAdjuster(false);

      expect(systemConfigService.getConfigValues).toHaveBeenCalledWith(
        expect.arrayContaining(['air_server', 'air_server_user', 'air_server_pass', 'air_server_port']),
      );
      // No test suffix keys
      expect(systemConfigService.getConfigValues).toHaveBeenCalledWith(expect.not.arrayContaining(['air_server_test']));
      expect(result.AIRServer).toBe('10.0.0.1');
      expect(result.usr).toBe('admin');
      expect(result.pass).toBe('pass123');
      expect(result.Port).toBe(8080);
      expect(result.DateTime).toBe('20260312T10:00:00+03:00');
    });

    it('should fetch test config keys when isTest=true', async () => {
      systemConfigService.getConfigValues.mockResolvedValue({
        air_server_test: '10.0.0.2',
        air_server_user_test: 'testadmin',
        air_server_pass_test: 'testpass',
        air_home_dir_test: '/home/airtest',
        air_sdp_user_test: 'testsdp',
        air_sdp_pass_test: 'testsdppass',
        air_report_date_test: '20260312',
        air_date_time_test: "yyyyMMdd'T'HH:mm:ssXXX",
        air_trans_id_test: 'test-trans',
        air_server_port_test: '9090',
      });
      dateHelperService.formatDate.mockReturnValueOnce('20260312T10:00:00+03:00').mockReturnValueOnce('26');

      const result = await service.airServerAdjuster(true);

      expect(systemConfigService.getConfigValues).toHaveBeenCalledWith(
        expect.arrayContaining(['air_server_test', 'air_server_user_test', 'air_trans_id_test']),
      );
      expect(result.AIRServer).toBe('10.0.0.2');
      expect(result.usr).toBe('testadmin');
      expect(result.Port).toBe(9090);
    });

    it('should default Port to 0 when air_server_port is not a number', async () => {
      systemConfigService.getConfigValues.mockResolvedValue({
        air_server: '10.0.0.1',
        air_server_user: 'admin',
        air_server_pass: 'pass',
        air_home_dir: '/home',
        air_sdp_user: 'u',
        air_sdp_pass: 'p',
        air_report_date: '',
        air_date_time: '',
        air_server_port: 'not-a-number',
      });
      dateHelperService.formatDate.mockReturnValue('26');

      const result = await service.airServerAdjuster(false);

      expect(result.Port).toBe(0);
    });

    it('should set Agent to empty string', async () => {
      systemConfigService.getConfigValues.mockResolvedValue({});
      dateHelperService.formatDate.mockReturnValue('26');

      const result = await service.airServerAdjuster(false);

      expect(result.Agent).toBe('');
    });
  });

  // ─── getSDP ─────────────────────────────────────────────────────────────────

  describe('getSDP', () => {
    it('should throw BadRequestException when DNS resolution fails', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('234');

      (Resolver as jest.Mock).mockImplementation(() => ({
        setServers: jest.fn(),
        resolve4: jest.fn().mockRejectedValue(new Error('DNS failed')),
      }));

      const request = makeMockRequest();

      await expect(service.getSDP('8012345678', request)).rejects.toThrow(BadRequestException);
      await expect(service.getSDP('8012345678', request)).rejects.toThrow(ErrorMessages.CC_SDP_WRONG_NUMBER);
    });

    it('should return SDP info on successful DNS resolution and DB lookup', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('234');

      (Resolver as jest.Mock).mockImplementation(() => ({
        setServers: jest.fn(),
        resolve4: jest.fn().mockResolvedValue(['192.168.1.1', '192.168.1.2']),
      }));

      legacyDataDbService.query.mockResolvedValue([{ sdp_id: 'SDP-01', cluster: 'ClusterA' }]);

      const request = makeMockRequest();
      const result = await service.getSDP('8012345678', request);

      expect(result).toEqual({
        sdpVIP: '192.168.1.2', // last address
        sdpId: 'SDP-01',
        sdpName: 'ClusterA',
      });
    });

    it('should return Undefined values when DB has no matching SDP node', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('234');

      (Resolver as jest.Mock).mockImplementation(() => ({
        setServers: jest.fn(),
        resolve4: jest.fn().mockResolvedValue(['192.168.1.1']),
      }));

      legacyDataDbService.query.mockResolvedValue([]);

      const request = makeMockRequest();
      const result = await service.getSDP('8012345678', request);

      expect(result.sdpId).toBe('Undefined');
      expect(result.sdpName).toBe('Undefined');
    });
  });

  // ─── getDedicatedAccounts ───────────────────────────────────────────────────

  describe('getDedicatedAccounts', () => {
    let executeAirXmlRpcSpy: jest.SpyInstance;

    beforeEach(() => {
      systemConfigService.getConfigValues.mockResolvedValue({
        air_server_port_dateBalance: '8080',
        air_server_dateBalance_agent: 'BalanceAgent',
      });
    });

    it('should throw when Port is 0 (not configured)', async () => {
      systemConfigService.getConfigValues.mockResolvedValue({
        air_server_port_dateBalance: '0',
        air_server_dateBalance_agent: 'Agent',
      });

      const request = makeMockRequest();

      await expect(service.getDedicatedAccounts('8012345678', request)).rejects.toThrow(BadRequestException);
    });

    it('should return header and body from parsed XML with dedicated accounts', async () => {
      executeAirXmlRpcSpy = jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        dedicatedAccountInformation: [
          {
            dedicatedAccountID: 1,
            dedicatedAccountValue1: 50000,
            dedicatedAccountUnitType: 1,
            startDate: 'Always',
            expiryDate: 'Never',
          },
        ],
      });

      legacyDataDbService.query
        .mockResolvedValueOnce([{ da_id: 1 }]) // daIdsResult
        .mockResolvedValueOnce([{ description: 'Main Account' }]); // description lookup

      const request = makeMockRequest();
      const result = await service.getDedicatedAccounts('8012345678', request);

      expect(result).toHaveProperty('header');
      expect(result).toHaveProperty('body');
      expect(result.header.length).toBeGreaterThan(0);
      expect(executeAirXmlRpcSpy).toHaveBeenCalled();
    });

    it('should throw CC_DEDICATED_ACCOUNTS_NOT_FOUND when key is missing', async () => {
      executeAirXmlRpcSpy = jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        // no dedicatedAccountInformation key
      });

      const request = makeMockRequest();

      await expect(service.getDedicatedAccounts('8012345678', request)).rejects.toThrow(
        ErrorMessages.CC_DEDICATED_ACCOUNTS_NOT_FOUND,
      );
    });
  });

  // ─── getOffers ──────────────────────────────────────────────────────────────

  describe('getOffers', () => {
    beforeEach(() => {
      systemConfigService.getConfigValues.mockResolvedValue({
        air_server_port_dateBalance: '8080',
        air_server_dateBalance_agent: 'BalanceAgent',
      });
    });

    it('should return parsed offers with correct header mapping', async () => {
      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        offerInformationList: [
          {
            offerID: 100,
            offerType: 1,
            startDateTime: '20260101T00:00:00',
            expiryDateTime: '99991231T23:59:59',
          },
        ],
      });

      const request = makeMockRequest();
      const result = await service.getOffers('8012345678', request);

      expect(result).toHaveProperty('header');
      expect(result).toHaveProperty('body');

      const headerFields = result.header.map((h) => h.field);
      expect(headerFields).toContain('offerID');
    });

    it('should throw CC_OFFERS_NOT_FOUND when offerInformationList is missing', async () => {
      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
      });

      const request = makeMockRequest();

      await expect(service.getOffers('8012345678', request)).rejects.toThrow(ErrorMessages.CC_OFFERS_NOT_FOUND);
    });

    it('should throw CC_DATA_PARSING on unexpected parsing errors', async () => {
      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        offerInformationList: 'invalid-not-an-array',
      });

      const request = makeMockRequest();

      await expect(service.getOffers('8012345678', request)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getAccumulators ────────────────────────────────────────────────────────

  describe('getAccumulators', () => {
    it('should return accumulators with correct headers', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('AccumAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        accumulatorInformation: [
          {
            accumulatorID: 1,
            accumulatorValue: 500,
            accumulatorStartDate: '20260101T00:00:00',
            accumulatorEndDate: '99991231T23:59:59',
          },
        ],
      });

      const request = makeMockRequest();
      const result = await service.getAccumulators('8012345678', request);

      expect(result.header.length).toBeGreaterThan(0);
      const headerFields = result.header.map((h) => h.field);
      expect(headerFields).toContain('accumulatorID');
      expect(headerFields).toContain('accumulatorValue');
    });

    it('should throw CC_ACCUMULATORS_NOT_FOUND when key is missing', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('AccumAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
      });

      const request = makeMockRequest();

      await expect(service.getAccumulators('8012345678', request)).rejects.toThrow(
        ErrorMessages.CC_ACCUMULATORS_NOT_FOUND,
      );
    });
  });

  // ─── getPAM ─────────────────────────────────────────────────────────────────

  describe('getPAM', () => {
    it('should return PAM data with correct headers', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('AccDetAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        pamInformationList: [
          {
            pamClassID: 1,
            pamServiceID: 10,
            scheduleID: 5,
            currentPamPeriod: '2026-03',
            lastEvaluationDate: '20260311T10:00:00',
          },
        ],
      });

      const request = makeMockRequest();
      const result = await service.getPAM('8012345678', request);

      expect(result.header.length).toBeGreaterThan(0);
      const headerFields = result.header.map((h) => h.field);
      expect(headerFields).toContain('pamClassID');
      expect(headerFields).toContain('pamServiceID');
    });

    it('should throw CC_PAM_DATA_NOT_FOUND when key is missing', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('AccDetAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
      });

      const request = makeMockRequest();

      await expect(service.getPAM('8012345678', request)).rejects.toThrow(ErrorMessages.CC_PAM_DATA_NOT_FOUND);
    });
  });

  // ─── getUsageCounter ────────────────────────────────────────────────────────

  describe('getUsageCounter', () => {
    it('should return usage counters with value type classification', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('UsageAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        usageCounterUsageThresholdInformation: [
          {
            usageCounterID: 1,
            usageCounterValue: 5000,
            usageThresholdInformation: [{ usageThresholdValue: 10000 }],
          },
        ],
      });

      const request = makeMockRequest();
      const result = await service.getUsageCounter('8012345678', request);

      expect(result.header.length).toBeGreaterThan(0);
      const headerFields = result.header.map((h) => h.field);
      expect(headerFields).toContain('usageCounterID');
      expect(headerFields).toContain('valueType');
    });

    it('should classify monetary values and divide by 100', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('UsageAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        usageCounterUsageThresholdInformation: [
          {
            usageCounterID: 1,
            usageCounterMonetaryValue1: 10000,
            usageThresholdInformation: [{ usageThresholdMonetaryValue1: 20000 }],
          },
        ],
      });

      const request = makeMockRequest();
      const result = await service.getUsageCounter('8012345678', request);

      // Monetary value should be divided by 100
      const body = result.body[0] as Record<string, unknown>;
      expect(body.usageCounterMonetaryValue1).toBe(100);
      expect(body.valueType).toBe('Monetary Cost');
    });

    it('should throw CC_USAGE_COUNTER_NOT_FOUND when key is missing', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('UsageAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
      });

      const request = makeMockRequest();

      await expect(service.getUsageCounter('8012345678', request)).rejects.toThrow(
        ErrorMessages.CC_USAGE_COUNTER_NOT_FOUND,
      );
    });
  });

  // ─── getUsageThreshold ──────────────────────────────────────────────────────

  describe('getUsageThreshold', () => {
    it('should return flattened threshold data with correct headers', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('UsageAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        usageCounterUsageThresholdInformation: [
          {
            usageCounterID: 1,
            usageThresholdInformation: [
              {
                usageThresholdID: 10,
                usageThresholdSource: 'AIR',
                usageThresholdMonetaryValue1: 5000,
              },
            ],
          },
        ],
      });

      const request = makeMockRequest();
      const result = await service.getUsageThreshold('8012345678', request);

      expect(result.header).toHaveLength(4);
      const headerFields = result.header.map((h) => h.field);
      expect(headerFields).toEqual([
        'usageThresholdID',
        'usageCounterID',
        'usageThresholdSource',
        'usageThresholdMonetaryValue1',
      ]);

      // Body should have the flattened threshold with usageCounterID injected
      expect(result.body.length).toBeGreaterThan(0);
      const bodyItem = result.body[0] as Record<string, unknown>;
      expect(bodyItem.usageCounterID).toBe(1);
      // Monetary value divided by 100
      expect(bodyItem.usageThresholdMonetaryValue1).toBe(50);
    });

    it('should use usageThresholdValue when monetary value is missing', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('UsageAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        usageCounterUsageThresholdInformation: [
          {
            usageCounterID: 2,
            usageThresholdInformation: [
              {
                usageThresholdID: 20,
                usageThresholdSource: 'AIR',
                usageThresholdValue: 999,
              },
            ],
          },
        ],
      });

      const request = makeMockRequest();
      const result = await service.getUsageThreshold('8012345678', request);

      const bodyItem = result.body[0] as Record<string, unknown>;
      expect(bodyItem.usageThresholdMonetaryValue1).toBe(999);
    });

    it('should throw CC_USAGE_THRESHOLD_NOT_FOUND when key is missing', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('UsageAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
      });

      const request = makeMockRequest();

      await expect(service.getUsageThreshold('8012345678', request)).rejects.toThrow(
        ErrorMessages.CC_USAGE_THRESHOLD_NOT_FOUND,
      );
    });
  });

  // ─── getSob ─────────────────────────────────────────────────────────────────

  describe('getSob', () => {
    it('should return SOB data combining account details and balance', async () => {
      systemConfigService.getConfigValues.mockResolvedValue({
        air_server_port_dateBalance: '8080',
        air_server_dateBalance_agent: 'BalanceAgent',
        air_server_accDet_agent: 'AccDetAgent',
      });

      const accountDetailsParsed: Record<string, unknown> = {
        responseCode: 0,
        serviceClassCurrent: 100,
        serviceFeeExpiryDate: '20270101T00:00:00',
        activationDate: '20200101T00:00:00',
        languageIDCurrent: 'en',
        serviceRemovalDate: '20280101T00:00:00',
        accountGroupID: 'AG-1',
        supervisionExpiryDate: '20280601T00:00:00',
        ussdEndOfCallNotificationID: '5',
        temporaryBlockedFlag: false,
        offerInformationList: [[{ offerProviderID: 'GDS-1' }], [{ offerProviderID: 'GDS-2' }]],
        communityInformationCurrent: [{ communityID: 42 }],
        serviceOfferings: [{ serviceOfferingActiveFlag: 1 }, { serviceOfferingActiveFlag: 0 }],
      };

      const balanceParsed: Record<string, unknown> = {
        responseCode: 0,
        accountValue1: 150000,
      };

      jest
        .spyOn(service as any, 'executeAirXmlRpc')
        .mockResolvedValueOnce(accountDetailsParsed)
        .mockResolvedValueOnce(balanceParsed);

      legacyDataDbService.query.mockResolvedValue([{ service_name: 'Gold Plan' }]);

      const request = makeMockRequest();
      const result = await service.getSob('8012345678', request);

      expect(result.serviceName).toBe('Gold Plan');
      expect(result.serviceId).toBe('100');
      expect(result.GDS).toEqual(['GDS-1', 'GDS-2']);
      expect(result.CUG).toBe(42);
      expect(result.EOCN).toBe(5);
      expect(result.temporaryBlockedFlag).toBe(false);
      expect(result.balance).toContain('NGN');
    });

    it('should handle missing optional fields gracefully', async () => {
      systemConfigService.getConfigValues.mockResolvedValue({
        air_server_port_dateBalance: '8080',
        air_server_dateBalance_agent: 'BalanceAgent',
        air_server_accDet_agent: 'AccDetAgent',
      });

      jest
        .spyOn(service as any, 'executeAirXmlRpc')
        .mockResolvedValueOnce({
          responseCode: 0,
          serviceClassCurrent: 200,
        })
        .mockResolvedValueOnce({
          responseCode: 0,
          accountValue1: 0,
        });

      legacyDataDbService.query.mockResolvedValue([{ service_name: 'Undefined' }]);

      const request = makeMockRequest();
      const result = await service.getSob('8012345678', request);

      expect(result.GDS).toEqual([]);
      expect(result.CUG).toBe(0);
      expect(result.SOB).toBe(0);
      expect(result.balance).toBe('0 (NGN)');
    });
  });

  // ─── Error Logging ──────────────────────────────────────────────────────────

  describe('error logging', () => {
    it('should save errors to the repository without blocking on getDedicatedAccounts failure', async () => {
      systemConfigService.getConfigValues.mockResolvedValue({
        air_server_port_dateBalance: '8080',
        air_server_dateBalance_agent: 'Agent',
      });

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
        // missing key triggers error logging + throw
      });

      const request = makeMockRequest();

      await expect(service.getDedicatedAccounts('8012345678', request)).rejects.toThrow(BadRequestException);

      expect(errorRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'getDedicatedAccounts',
          phone: '8012345678',
        }),
      );
      expect(errorRepo.save).toHaveBeenCalled();
    });

    it('should not throw when error repo save fails', async () => {
      systemConfigService.getConfigValues.mockResolvedValue({
        air_server_port_dateBalance: '8080',
        air_server_dateBalance_agent: 'Agent',
      });

      errorRepo.save.mockRejectedValue(new Error('DB connection lost'));

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
      });

      const request = makeMockRequest();

      // Should still throw the business exception, not the repo save error
      await expect(service.getOffers('8012345678', request)).rejects.toThrow(ErrorMessages.CC_OFFERS_NOT_FOUND);
    });

    it('should log errors for getAccumulators when parsing fails', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('AccumAgent');

      jest.spyOn(service as any, 'executeAirXmlRpc').mockResolvedValue({
        responseCode: 0,
      });

      const request = makeMockRequest();

      await expect(service.getAccumulators('8012345678', request)).rejects.toThrow(BadRequestException);

      expect(errorRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'getAccumulators',
          phone: '8012345678',
        }),
      );
    });
  });
});
