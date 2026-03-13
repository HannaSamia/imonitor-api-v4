import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CustomerCareHistoryService } from './customer-care-history.service';
import { SystemConfigService } from '../../../shared/services/system-config.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { ExportHelperService } from '../../../shared/services/export-helper.service';
import { SystemKeys } from '../../../shared/constants';
import { ErrorMessages } from '../../../shared/constants/error-messages';

jest.mock('axios');
const mockedAxios = axios as jest.MockedFunction<typeof axios> & { post: jest.MockedFunction<typeof axios.post> };

// Mock fs promises (readFile for certificate loading) — use partial mock to avoid breaking path-scurry
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: jest.fn().mockResolvedValue(Buffer.from('mock-cert')),
    },
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildConfigMap(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [SystemKeys.msapHost]: 'https://msap.example.com',
    [SystemKeys.msapTestHost]: 'https://msap-test.example.com',
    [SystemKeys.msapApiKey]: 'api-key',
    [SystemKeys.msapTestApiKey]: 'test-api-key',
    [SystemKeys.msapPlatformId]: 'platform-1',
    [SystemKeys.msapCertificatePath]: '/certs/cert.pem',
    [SystemKeys.msapRootCertificatePath]: '/certs/root.pem',
    [SystemKeys.msapBundleSubscriptionEndpoint]: '/bundle/history',
    [SystemKeys.msapVasSubscriptionEndpoint]: '/vas/history',
    [SystemKeys.countryCode]: '234',
    [SystemKeys.daasHost]: 'https://daas.example.com',
    [SystemKeys.dsmTransactionHistAPI]: 'https://dsm.example.com/api',
    [SystemKeys.dsmAuthorizationKey]: 'Basic auth-key',
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('CustomerCareHistoryService', () => {
  let service: CustomerCareHistoryService;
  let systemConfigService: { getConfigValues: jest.Mock };
  let legacyDataDbService: { query: jest.Mock };
  let exportHelperService: { exportTabularToExcel: jest.Mock };

  beforeEach(async () => {
    systemConfigService = { getConfigValues: jest.fn() };
    legacyDataDbService = { query: jest.fn() };
    exportHelperService = { exportTabularToExcel: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerCareHistoryService,
        DateHelperService,
        { provide: SystemConfigService, useValue: systemConfigService },
        { provide: LegacyDataDbService, useValue: legacyDataDbService },
        { provide: ExportHelperService, useValue: exportHelperService },
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation(
                (key: string) => ({ DB_CORE_NAME: 'iMonitorV3_1', DB_DATA_NAME: 'iMonitorData' })[key],
              ),
          },
        },
      ],
    }).compile();

    service = module.get<CustomerCareHistoryService>(CustomerCareHistoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── getMsapSubscriptionHistory ─────────────────────────────────────────────

  describe('getMsapSubscriptionHistory', () => {
    it('should return parsed MSAP subscription data on success', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          code: 200,
          status: 'Success',
          transactionId: 'txn-1',
          data: [{ bundleName: 'Data Plan', startDate: '2025-01-01', endDate: '2025-01-31' }],
        },
      });

      const result = await service.getMsapSubscriptionHistory(
        'user-1',
        '2025-01-01T00:00',
        '2025-01-31T00:00',
        false,
        '8012345678',
      );

      expect(result.header).toBeDefined();
      expect(result.header.length).toBeGreaterThan(0);
      expect(result.body).toHaveLength(1);
      expect((result.body[0] as Record<string, unknown>).bundleName).toBe('Data Plan');
    });

    it('should use test host and test API key when isTestNumber is true', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          code: 200,
          status: 'Success',
          transactionId: 'txn-2',
          data: [{ bundleName: 'Test Plan' }],
        },
      });

      await service.getMsapSubscriptionHistory('user-1', '2025-01-01T00:00', '2025-01-31T00:00', true, '8012345678');

      const callConfig = mockedAxios.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(callConfig.url as string).toContain('msap-test.example.com');
    });

    it('should throw BadRequestException when MSAP returns non-200 code', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          code: 404,
          status: 'Error',
          message: 'Not found',
          transactionId: 'txn-3',
        },
      });

      await expect(
        service.getMsapSubscriptionHistory('user-1', '2025-01-01', '2025-01-31', false, '8012345678'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with ERROR_OCCURED on axios failure', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockRejectedValue(new Error('Network error'));

      await expect(
        service.getMsapSubscriptionHistory('user-1', '2025-01-01', '2025-01-31', false, '8012345678'),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.ERROR_OCCURED));
    });
  });

  // ─── getMsapVasSubscription ────────────────────────────────────────────────

  describe('getMsapVasSubscription', () => {
    it('should return parsed VAS subscription data on success', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          code: 200,
          status: 'Success',
          transactionId: 'txn-4',
          data: [{ serviceName: 'Caller Tune', status: 'active' }],
        },
      });

      const result = await service.getMsapVasSubscription(
        'user-1',
        false,
        '8012345678',
        '2025-01-01T00:00',
        '2025-01-31T00:00',
      );

      expect(result.header).toBeDefined();
      expect(result.body).toHaveLength(1);
      expect((result.body[0] as Record<string, unknown>).serviceName).toBe('Caller Tune');
    });

    it('should work without optional date parameters', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          code: 200,
          status: 'Success',
          transactionId: 'txn-5',
          data: [{ serviceName: 'VAS Service' }],
        },
      });

      const result = await service.getMsapVasSubscription('user-1', false, '8012345678');

      expect(result.body).toHaveLength(1);
    });

    it('should throw BadRequestException with CC_NO_SUBSCRIPTION_HISTORY when data is empty', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          code: 200,
          status: 'Success',
          transactionId: 'txn-6',
          data: [],
        },
      });

      await expect(service.getMsapVasSubscription('user-1', false, '8012345678')).rejects.toThrow(
        new BadRequestException(ErrorMessages.CC_NO_SUBSCRIPTION_HISTORY),
      );
    });
  });

  // ─── getCdrHistory ─────────────────────────────────────────────────────────

  describe('getCdrHistory', () => {
    it('should return parsed CDR records with DA detail flattening and summary row', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          APIStatus: {
            msisdn: '2348012345678',
            requestId: 'req-1',
            dateRange: ['20250101', '20250131'],
            maxRecs: 500,
            numRecs: 1,
            pageNum: 1,
            statusCode: 200,
            statusMsg: 'OK',
          },
          APIData: [
            {
              record_type: 'VOICE',
              number_called: '2348099999999',
              event_dt: '20250115120000',
              call_duration_qty: '120',
              charged_amount: '10.50',
              balance_before_amt: '100.00',
              balance_after_amt: '89.50',
              discount_amt: '0',
              country: 'NG',
              operator: 'MTN',
              bytes_received_qty: 0,
              bytes_sent_qty: 0,
              da_details: [
                { account_id: 'DA1', amount_before: 50, amount_after: 45, amount_charged: 5 },
                { account_id: 'DA2', amount_before: 30, amount_after: 28, amount_charged: 2 },
              ],
            },
          ],
        },
      });

      const result = await service.getCdrHistory('8012345678', '2025-01-01', '2025-01-31');

      // 2 DA detail rows + 1 summary row = 3
      expect(result.body).toHaveLength(3);

      const firstRow = result.body[0] as Record<string, unknown>;
      expect(firstRow.record_type).toBe('VOICE');
      expect(firstRow.da_account_id).toBe('DA1');
      expect(firstRow.da_amount_charged).toBe(5);

      const secondRow = result.body[1] as Record<string, unknown>;
      expect(secondRow.da_account_id).toBe('DA2');

      const summaryRow = result.body[2] as Record<string, unknown>;
      expect(summaryRow.record_type).toBe('SUMMARY');
      expect(summaryRow.charged_amount).toBe(10.5);
      expect(summaryRow.da_amount_charged).toBe(7);
    });

    it('should handle CDR records with no DA details', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          APIStatus: {
            statusCode: 200,
            statusMsg: 'OK',
            msisdn: '',
            requestId: '',
            dateRange: [],
            maxRecs: 500,
            numRecs: 1,
            pageNum: 1,
          },
          APIData: [
            {
              record_type: 'SMS',
              number_called: '2348099999999',
              event_dt: '20250115',
              call_duration_qty: '0',
              charged_amount: '4.00',
              balance_before_amt: '50.00',
              balance_after_amt: '46.00',
              discount_amt: '0',
              country: 'NG',
              operator: 'GLO',
              bytes_received_qty: 0,
              bytes_sent_qty: 0,
              da_details: [],
            },
          ],
        },
      });

      const result = await service.getCdrHistory('8012345678', '2025-01-01', '2025-01-31');

      // 1 row (no DA) + 1 summary = 2
      expect(result.body).toHaveLength(2);
      const row = result.body[0] as Record<string, unknown>;
      expect(row.da_account_id).toBe('');
      expect(row.da_amount_before).toBe('');
    });

    it('should throw BadRequestException when DAAS returns non-200 status', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          APIStatus: {
            statusCode: 500,
            statusMsg: 'Internal error',
            msisdn: '',
            requestId: '',
            dateRange: [],
            maxRecs: 0,
            numRecs: 0,
            pageNum: 1,
          },
          APIData: [],
        },
      });

      await expect(service.getCdrHistory('8012345678', '2025-01-01', '2025-01-31')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should prepend country code only if msisdn does not already have it', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          APIStatus: {
            statusCode: 200,
            statusMsg: 'OK',
            msisdn: '',
            requestId: '',
            dateRange: [],
            maxRecs: 500,
            numRecs: 1,
            pageNum: 1,
          },
          APIData: [
            {
              record_type: 'SMS',
              number_called: '',
              event_dt: '',
              call_duration_qty: '0',
              charged_amount: '1',
              balance_before_amt: '10',
              balance_after_amt: '9',
              discount_amt: '0',
              country: '',
              operator: '',
              bytes_received_qty: 0,
              bytes_sent_qty: 0,
              da_details: [],
            },
          ],
        },
      });

      await service.getCdrHistory('2348012345678', '2025-01-01', '2025-01-31');

      const callConfig = mockedAxios.mock.calls[0][0] as unknown as Record<string, unknown>;
      const callUrl = callConfig.url as string;
      // Should NOT double-prepend: should contain 2348012345678, not 2342348012345678
      expect(callUrl).toContain('2348012345678');
      expect(callUrl).not.toContain('2342348012345678');
    });
  });

  // ─── exportCdrHistoryExcel ─────────────────────────────────────────────────

  describe('exportCdrHistoryExcel', () => {
    it('should call getCdrHistory and exportTabularToExcel, then return file path', async () => {
      // Mock getCdrHistory indirectly via axios
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          APIStatus: {
            statusCode: 200,
            statusMsg: 'OK',
            msisdn: '',
            requestId: '',
            dateRange: [],
            maxRecs: 500,
            numRecs: 1,
            pageNum: 1,
          },
          APIData: [
            {
              record_type: 'VOICE',
              number_called: '123',
              event_dt: '20250115',
              call_duration_qty: '60',
              charged_amount: '5',
              balance_before_amt: '100',
              balance_after_amt: '95',
              discount_amt: '0',
              country: 'NG',
              operator: 'MTN',
              bytes_received_qty: 0,
              bytes_sent_qty: 0,
              da_details: [],
            },
          ],
        },
      });
      exportHelperService.exportTabularToExcel.mockResolvedValue('/exports/cdr_export.xlsx');

      const result = await service.exportCdrHistoryExcel('8012345678', '2025-01-01', '2025-01-31');

      expect(result).toBe('/exports/cdr_export.xlsx');
      expect(exportHelperService.exportTabularToExcel).toHaveBeenCalledTimes(1);

      const sheets = exportHelperService.exportTabularToExcel.mock.calls[0][0];
      expect(sheets).toHaveLength(1);
      expect(sheets[0].name).toBe('cdr_history');
    });

    it('should stringify all body values to prevent scientific notation', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.mockResolvedValue({
        data: {
          APIStatus: {
            statusCode: 200,
            statusMsg: 'OK',
            msisdn: '',
            requestId: '',
            dateRange: [],
            maxRecs: 500,
            numRecs: 1,
            pageNum: 1,
          },
          APIData: [
            {
              record_type: 'DATA',
              number_called: '',
              event_dt: '20250115',
              call_duration_qty: '0',
              charged_amount: '1234567890123',
              balance_before_amt: '9999999999',
              balance_after_amt: '8765432100',
              discount_amt: '0',
              country: '',
              operator: '',
              bytes_received_qty: 123456789,
              bytes_sent_qty: 987654321,
              da_details: [],
            },
          ],
        },
      });
      exportHelperService.exportTabularToExcel.mockResolvedValue('/exports/file.xlsx');

      await service.exportCdrHistoryExcel('8012345678', '2025-01-01', '2025-01-31');

      const sheets = exportHelperService.exportTabularToExcel.mock.calls[0][0];
      const firstRow = sheets[0].body[0] as Record<string, unknown>;
      // All values should be strings
      for (const key of Object.keys(firstRow)) {
        expect(typeof firstRow[key]).toBe('string');
      }
    });
  });

  // ─── getHourlyBalance ──────────────────────────────────────────────────────

  describe('getHourlyBalance', () => {
    beforeEach(() => {
      // Default DB mocks
      legacyDataDbService.query
        .mockResolvedValueOnce([{ cluster: 'cluster1' }]) // cluster query
        .mockResolvedValueOnce([{ ip_address: '10.0.0.1', ssh_user: 'admin', ssh_pass: 'pass' }]); // SSH config
    });

    it('should return hourly balance rows with formatted date', async () => {
      const executeSshSpy = jest.spyOn(service as any, 'executeSshCommand');
      // First call: list files
      executeSshSpy.mockResolvedValueOnce('dump_202501151000.dat\ndump_202501151100.dat\n');
      // Second call: grep balance for file 1
      executeSshSpy.mockResolvedValueOnce('50000\n');
      // Third call: grep balance for file 2
      executeSshSpy.mockResolvedValueOnce('48000\n');

      const result = await service.getHourlyBalance('20250115120000', '10.0.0.1', '2348012345678');

      expect(result.header).toHaveLength(2);
      expect(result.header[0].field).toBe('dateTime');
      expect(result.header[1].field).toBe('balanceNGN');
      expect(result.body).toHaveLength(2);
      expect(result.body[0].dateTime).toBe('2025-01-15 10:00');
      expect(result.body[0].balanceNGN).toBe('50000');
      expect(result.body[1].dateTime).toBe('2025-01-15 11:00');
      expect(result.body[1].balanceNGN).toBe('48000');
    });

    it('should throw BadRequestException when no cluster found', async () => {
      legacyDataDbService.query.mockReset();
      legacyDataDbService.query.mockResolvedValueOnce([]);

      await expect(service.getHourlyBalance('20250115120000', '10.0.0.1', '2348012345678')).rejects.toThrow(
        new BadRequestException(ErrorMessages.ERROR_OCCURED),
      );
    });

    it('should throw BadRequestException when no SSH config found', async () => {
      legacyDataDbService.query.mockReset();
      legacyDataDbService.query.mockResolvedValueOnce([{ cluster: 'cluster1' }]).mockResolvedValueOnce([]);

      await expect(service.getHourlyBalance('20250115120000', '10.0.0.1', '2348012345678')).rejects.toThrow(
        new BadRequestException(ErrorMessages.ERROR_OCCURED),
      );
    });

    it('should throw CC_NO_HOURLY_BALANCE_ON_DATE when no remote files found', async () => {
      const executeSshSpy = jest.spyOn(service as any, 'executeSshCommand');
      executeSshSpy.mockResolvedValueOnce(null);

      await expect(service.getHourlyBalance('20250115120000', '10.0.0.1', '2348012345678')).rejects.toThrow(
        new BadRequestException(ErrorMessages.CC_NO_HOURLY_BALANCE_ON_DATE),
      );
    });

    it('should throw CC_NO_HOURLY_BALANCE_ON_NUMBER when grep returns no balance', async () => {
      const executeSshSpy = jest.spyOn(service as any, 'executeSshCommand');
      executeSshSpy.mockResolvedValueOnce('dump_202501151000.dat\n');
      executeSshSpy.mockResolvedValueOnce(null); // no balance for msisdn

      await expect(service.getHourlyBalance('20250115120000', '10.0.0.1', '2348012345678')).rejects.toThrow(
        new BadRequestException(ErrorMessages.CC_NO_HOURLY_BALANCE_ON_NUMBER),
      );
    });

    it('should filter out .gz files from the file list', async () => {
      const executeSshSpy = jest.spyOn(service as any, 'executeSshCommand');
      executeSshSpy.mockResolvedValueOnce('dump_202501151000.dat\ndump_202501151100.dat.gz\n');
      executeSshSpy.mockResolvedValueOnce('50000\n');

      const result = await service.getHourlyBalance('20250115120000', '10.0.0.1', '2348012345678');

      expect(result.body).toHaveLength(1);
    });
  });

  // ─── getDailyDAHistory ─────────────────────────────────────────────────────

  describe('getDailyDAHistory', () => {
    beforeEach(() => {
      legacyDataDbService.query
        .mockResolvedValueOnce([{ cluster: 'cluster1' }])
        .mockResolvedValueOnce([{ ip_address: '10.0.0.1', ssh_user: 'admin', ssh_pass: 'pass' }]);
    });

    it('should return daily DA rows with headers derived from body keys', async () => {
      const executeSshSpy = jest.spyOn(service as any, 'executeSshCommand');
      // List files
      executeSshSpy.mockResolvedValueOnce('20250115\n');
      // Grep DA data — 14-field line
      executeSshSpy.mockResolvedValueOnce(
        '20250115,101,5000,20250201,100,OFFER1,20250101,UNIT,CAT,MONEY,800,PAM1,PROD1\n',
      );

      const result = await service.getDailyDAHistory('2025-01-15', '2025-01-15', '10.0.0.1', '2348012345678');

      expect(result.body).toHaveLength(1);
      expect(result.body[0].Date).toBe('2025-01-15');
      expect(result.body[0].DA_ID).toBe('101');
      expect(result.body[0].DA_Balance).toBe('5000');
      expect(result.header.length).toBeGreaterThan(0);
      expect(result.header[0].header).toBe('Date');
    });

    it('should throw CC_NO_DA_DAILY_BALANCE_ON_DATE when no files found', async () => {
      const executeSshSpy = jest.spyOn(service as any, 'executeSshCommand');
      executeSshSpy.mockResolvedValueOnce(null);

      await expect(service.getDailyDAHistory('2025-01-15', '2025-01-15', '10.0.0.1', '2348012345678')).rejects.toThrow(
        new BadRequestException(ErrorMessages.CC_NO_DA_DAILY_BALANCE_ON_DATE),
      );
    });

    it('should throw CC_NO_HOURLY_BALANCE_ON_NUMBER when grep returns no data', async () => {
      const executeSshSpy = jest.spyOn(service as any, 'executeSshCommand');
      executeSshSpy.mockResolvedValueOnce('20250115\n');
      executeSshSpy.mockResolvedValueOnce(null);

      await expect(service.getDailyDAHistory('2025-01-15', '2025-01-15', '10.0.0.1', '2348012345678')).rejects.toThrow(
        new BadRequestException(ErrorMessages.CC_NO_HOURLY_BALANCE_ON_NUMBER),
      );
    });

    it('should throw when no cluster found', async () => {
      legacyDataDbService.query.mockReset();
      legacyDataDbService.query.mockResolvedValueOnce([]);

      await expect(service.getDailyDAHistory('2025-01-15', '2025-01-15', '10.0.0.1', '2348012345678')).rejects.toThrow(
        new BadRequestException(ErrorMessages.ERROR_OCCURED),
      );
    });
  });

  // ─── shareNSellTransactionHistory ──────────────────────────────────────────

  describe('shareNSellTransactionHistory', () => {
    it('should return parsed XML response with ocsResponse body', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: '<?xml version="1.0"?><ocsResponse><transactionId>123</transactionId><status>Success</status><amount>500</amount></ocsResponse>',
      });

      const result = await service.shareNSellTransactionHistory('8012345678', '2025-01-01', '2025-01-31');

      expect(result.header).toBeDefined();
      expect(result.body).toHaveLength(1);
      const body = result.body[0] as Record<string, unknown>;
      expect(body.transactionId).toBe(123);
      expect(body.status).toBe('Success');
    });

    it('should fall back to "response" key when ocsResponse is not present', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: '<?xml version="1.0"?><response><result>OK</result></response>',
      });

      const result = await service.shareNSellTransactionHistory('8012345678', '2025-01-01', '2025-01-31');

      expect(result.body).toHaveLength(1);
      const body = result.body[0] as Record<string, unknown>;
      expect(body.result).toBe('OK');
    });

    it('should throw CC_SELL_N_SHARE_FAIL when axios.post fails', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.post.mockRejectedValue(new Error('Connection refused'));

      await expect(service.shareNSellTransactionHistory('8012345678', '2025-01-01', '2025-01-31')).rejects.toThrow(
        new BadRequestException(ErrorMessages.CC_SELL_N_SHARE_FAIL),
      );
    });

    it('should throw CC_ERROR_FROM_HOST when status is not 200', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.post.mockResolvedValue({
        status: 500,
        data: 'error',
      });

      await expect(service.shareNSellTransactionHistory('8012345678', '2025-01-01', '2025-01-31')).rejects.toThrow(
        new BadRequestException(ErrorMessages.CC_ERROR_FROM_HOST),
      );
    });

    it('should throw CC_EMPTY_RESPONSE when data is null', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: null,
      });

      await expect(service.shareNSellTransactionHistory('8012345678', '2025-01-01', '2025-01-31')).rejects.toThrow(
        new BadRequestException(ErrorMessages.CC_EMPTY_RESPONSE),
      );
    });

    it('should capitalize and split camelCase header names', async () => {
      systemConfigService.getConfigValues.mockResolvedValue(buildConfigMap());
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: '<?xml version="1.0"?><ocsResponse><callingParty>234801</callingParty></ocsResponse>',
      });

      const result = await service.shareNSellTransactionHistory('8012345678', '2025-01-01', '2025-01-31');

      const headerItem = result.header.find((h) => h.field === 'callingParty');
      expect(headerItem).toBeDefined();
      // 'callingParty' → split on capitals → 'calling Party' → capitalize → 'Calling Party'
      expect(headerItem!.header).toBe('Calling Party');
    });
  });
});
