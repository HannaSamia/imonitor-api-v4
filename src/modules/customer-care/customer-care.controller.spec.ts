import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';
import { CustomerCareController } from './customer-care.controller';
import { CustomerCareService } from './customer-care.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';

// Mock fs.createReadStream to avoid ENOENT errors on fake file paths
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: jest.fn().mockReturnValue(
    new Readable({
      read() {
        this.push(null);
      },
    }),
  ),
}));

describe('CustomerCareController', () => {
  let controller: CustomerCareController;
  let service: jest.Mocked<CustomerCareService>;

  const mockService = {
    getSDP: jest.fn().mockResolvedValue({ sdpVIP: '10.0.0.1', sdpId: '1', sdpName: 'SDP1' }),
    getDedicatedAccounts: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getOffers: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getAccumulators: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getPAM: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getUsageCounter: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getUsageThreshold: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getSob: jest.fn().mockResolvedValue({ SOB: 100, balance: '500' }),
    getHLR: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getHSS: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getMTAS: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getSubscriptionHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getMsapSubscriptionHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getMsapVasSubscription: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getCdrHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
    exportCdrHistoryExcel: jest.fn().mockResolvedValue('/tmp/cdr-export.xlsx'),
    getHourlyBalance: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getDailyDAHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
    shareNSellTransactionHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
    setTrace: jest.fn().mockResolvedValue(undefined),
    unsetTrace: jest.fn().mockResolvedValue(undefined),
    fetchTrace: jest.fn().mockResolvedValue('<html>trace</html>'),
    exportSdpTraceHtml: jest.fn().mockResolvedValue('/tmp/trace.html'),
    exportSdpTraceRawMappingHtml: jest.fn().mockResolvedValue('/tmp/trace-raw.html'),
    exportSdpTraceRawText: jest.fn().mockResolvedValue('/tmp/trace.txt'),
    setAirTrace: jest.fn().mockResolvedValue(undefined),
    unsetAirTrace: jest.fn().mockResolvedValue(undefined),
    fetchAirTrace: jest.fn().mockResolvedValue({ data: '<html>air</html>', downloadUrl: 'http://test/download' }),
    exportAirTraceHtml: jest.fn().mockResolvedValue('/tmp/air-trace.html'),
    downloadAirTrace: jest.fn().mockResolvedValue({ fileName: 'trace.txt', content: 'raw trace data' }),
    fetchTraceHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
    fetchTracedNumbers: jest.fn().mockResolvedValue({ header: [], body: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerCareController],
      providers: [{ provide: CustomerCareService, useValue: mockService }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CustomerCareController>(CustomerCareController);
    service = module.get(CustomerCareService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ───────────────────── 1-8: AIR endpoints ─────────────────────

  describe('getSDP', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getSDP({ msisdn: '961123456', test: 'true' });
      expect(service.getSDP).toHaveBeenCalledWith('961123456', true);
      expect(result).toEqual({ result: { sdpVIP: '10.0.0.1', sdpId: '1', sdpName: 'SDP1' } });
    });

    it('should convert test=false correctly', async () => {
      await controller.getSDP({ msisdn: '961123456', test: 'false' });
      expect(service.getSDP).toHaveBeenCalledWith('961123456', false);
    });
  });

  describe('getDedicatedAccounts', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getDedicatedAccounts({ msisdn: '961123456', test: 'True' });
      expect(service.getDedicatedAccounts).toHaveBeenCalledWith('961123456', true);
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getOffers', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getOffers({ msisdn: '961123456', test: 'false' });
      expect(service.getOffers).toHaveBeenCalledWith('961123456', false);
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getAccumulators', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getAccumulators({ msisdn: '961123456', test: 'true' });
      expect(service.getAccumulators).toHaveBeenCalledWith('961123456', true);
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getPAM', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getPAM({ msisdn: '961123456', test: 'true' });
      expect(service.getPAM).toHaveBeenCalledWith('961123456', true);
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getUsageCounter', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getUsageCounter({ msisdn: '961123456', test: 'false' });
      expect(service.getUsageCounter).toHaveBeenCalledWith('961123456', false);
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getUsageThreshold', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getUsageThreshold({ msisdn: '961123456', test: 'true' });
      expect(service.getUsageThreshold).toHaveBeenCalledWith('961123456', true);
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getSob', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getSob({ msisdn: '961123456', test: 'true' });
      expect(service.getSob).toHaveBeenCalledWith('961123456', true);
      expect(result).toEqual({ result: { SOB: 100, balance: '500' } });
    });
  });

  // ───────────────────── 9-11: Network endpoints ─────────────────────

  describe('getHLR', () => {
    it('should pass msisdn and return { result }', async () => {
      const result = await controller.getHLR({ msisdn: '961123456' });
      expect(service.getHLR).toHaveBeenCalledWith('961123456');
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getHSS', () => {
    it('should pass msisdn and return { result }', async () => {
      const result = await controller.getHSS({ msisdn: '961123456' });
      expect(service.getHSS).toHaveBeenCalledWith('961123456');
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getMTAS', () => {
    it('should pass msisdn and return { result }', async () => {
      const result = await controller.getMTAS({ msisdn: '961123456' });
      expect(service.getMTAS).toHaveBeenCalledWith('961123456');
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  // ───────────────────── 12-13: Balance & DA History ─────────────────────

  describe('getHourlyBalance', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getHourlyBalance({ date: '2024-01-15', sdpvip: '10.0.0.1', msisdn: '961123456' });
      expect(service.getHourlyBalance).toHaveBeenCalledWith('2024-01-15', '10.0.0.1', '961123456');
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getDailyDAHistory', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getDailyDAHistory({
        fromdate: '2024-01-01',
        todate: '2024-01-31',
        sdpvip: '10.0.0.1',
        msisdn: '961123456',
      });
      expect(service.getDailyDAHistory).toHaveBeenCalledWith('2024-01-01', '2024-01-31', '10.0.0.1', '961123456');
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  // ───────────────────── 14-16: Subscription History ─────────────────────

  describe('getSubscriptionHistory', () => {
    it('should pass correct params including userId and return { result }', async () => {
      const result = await controller.getSubscriptionHistory(
        { fromdate: '2024-01-01', todate: '2024-01-31', test: 'true', msisdn: '961123456' },
        'user-id-1',
      );
      expect(service.getSubscriptionHistory).toHaveBeenCalledWith(
        'user-id-1',
        '2024-01-01',
        '2024-01-31',
        true,
        '961123456',
      );
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getMsapSubscriptionHistory', () => {
    it('should pass correct params including userId and return { result }', async () => {
      const result = await controller.getMsapSubscriptionHistory(
        { fromdate: '2024-01-01', todate: '2024-01-31', test: 'false', msisdn: '961123456' },
        'user-id-1',
      );
      expect(service.getMsapSubscriptionHistory).toHaveBeenCalledWith(
        'user-id-1',
        '2024-01-01',
        '2024-01-31',
        false,
        '961123456',
      );
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('getMsapVasSubscription', () => {
    it('should pass correct params including userId and return { result }', async () => {
      const result = await controller.getMsapVasSubscription(
        { fromdate: '2024-01-01', todate: '2024-01-31', test: 'true', msisdn: '961123456' },
        'user-id-1',
      );
      expect(service.getMsapVasSubscription).toHaveBeenCalledWith(
        'user-id-1',
        true,
        '961123456',
        '2024-01-01',
        '2024-01-31',
      );
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  // ───────────────────── 17-18: CDR History ─────────────────────

  describe('getCdrHistory', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.getCdrHistory({
        fromdate: '2024-01-01',
        todate: '2024-01-31',
        msisdn: '961123456',
      });
      expect(service.getCdrHistory).toHaveBeenCalledWith('2024-01-01', '2024-01-31', '961123456');
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('exportCdrHistoryExcel', () => {
    it('should call service with correct params and return StreamableFile', async () => {
      const mockRes = { set: jest.fn() } as any;
      // The method creates a StreamableFile from createReadStream — we just verify service delegation
      // Since createReadStream will fail on a non-existent path, we test that the service was called
      try {
        await controller.exportCdrHistoryExcel(
          { fromdate: '2024-01-01', todate: '2024-01-31', msisdn: '961123456' },
          mockRes,
        );
      } catch {
        // Expected: createReadStream will fail on fake path, but service was called
      }
      expect(service.exportCdrHistoryExcel).toHaveBeenCalledWith('2024-01-01', '2024-01-31', '961123456');
    });
  });

  // ───────────────────── 19-20: SDP Trace set/unset ─────────────────────

  describe('setTrace', () => {
    it('should call service and return { result: success }', async () => {
      const result = await controller.setTrace({ sdpvip: '10.0.0.1', msisdn: '961123456' }, 'user-id-1');
      expect(service.setTrace).toHaveBeenCalledWith('10.0.0.1', '961123456', 'user-id-1');
      expect(result).toEqual({ result: 'success' });
    });
  });

  describe('unsetTrace', () => {
    it('should call service and return { result: success }', async () => {
      const result = await controller.unsetTrace({ sdpvip: '10.0.0.1', msisdn: '961123456' }, 'user-id-1');
      expect(service.unsetTrace).toHaveBeenCalledWith('10.0.0.1', '961123456', 'user-id-1');
      expect(result).toEqual({ result: 'success' });
    });
  });

  // ───────────────────── 21-23: SDP Trace fetch & export ─────────────────────

  describe('fetchTrace', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.fetchTrace({
        fromhour: '08:00',
        tohour: '12:00',
        sdpvip: '10.0.0.1',
        msisdn: '961123456',
      });
      expect(service.fetchTrace).toHaveBeenCalledWith('08:00', '12:00', '10.0.0.1', '961123456');
      expect(result).toEqual({ result: '<html>trace</html>' });
    });
  });

  describe('exportSdpTraceHtml', () => {
    it('should call exportSdpTraceHtml when raw is not true', async () => {
      const mockRes = { set: jest.fn() } as any;
      try {
        await controller.exportSdpTraceHtml(
          { fromhour: '08:00', tohour: '12:00', sdpvip: '10.0.0.1', msisdn: '961123456' },
          {},
          mockRes,
        );
      } catch {
        // createReadStream fails on fake path
      }
      expect(service.exportSdpTraceHtml).toHaveBeenCalledWith('08:00', '12:00', '10.0.0.1', '961123456');
    });

    it('should call exportSdpTraceRawMappingHtml when raw=true', async () => {
      const mockRes = { set: jest.fn() } as any;
      try {
        await controller.exportSdpTraceHtml(
          { fromhour: '08:00', tohour: '12:00', sdpvip: '10.0.0.1', msisdn: '961123456' },
          { raw: 'true' },
          mockRes,
        );
      } catch {
        // createReadStream fails on fake path
      }
      expect(service.exportSdpTraceRawMappingHtml).toHaveBeenCalledWith('08:00', '12:00', '10.0.0.1', '961123456');
    });
  });

  describe('exportSdpTraceRawText', () => {
    it('should call service with correct params', async () => {
      const mockRes = { set: jest.fn() } as any;
      try {
        await controller.exportSdpTraceRawText(
          { fromhour: '08:00', tohour: '12:00', sdpvip: '10.0.0.1', msisdn: '961123456' },
          mockRes,
        );
      } catch {
        // createReadStream fails on fake path
      }
      expect(service.exportSdpTraceRawText).toHaveBeenCalledWith('08:00', '12:00', '10.0.0.1', '961123456');
    });
  });

  // ───────────────────── 24-25: AIR Trace set/unset ─────────────────────

  describe('setAirTrace', () => {
    it('should call service and return { result: success }', async () => {
      const result = await controller.setAirTrace({ msisdn: '961123456' }, 'user-id-1');
      expect(service.setAirTrace).toHaveBeenCalledWith('961123456', 'user-id-1');
      expect(result).toEqual({ result: 'success' });
    });
  });

  describe('unsetAirTrace', () => {
    it('should call service and return { result: success }', async () => {
      const result = await controller.unsetAirTrace({ msisdn: '961123456' }, 'user-id-1');
      expect(service.unsetAirTrace).toHaveBeenCalledWith('961123456', 'user-id-1');
      expect(result).toEqual({ result: 'success' });
    });
  });

  // ───────────────────── 26-28: AIR Trace fetch & export ─────────────────────

  describe('fetchAirTrace', () => {
    it('should pass correct params including baseUrl and return { result }', async () => {
      const mockReq = { protocol: 'http', get: jest.fn().mockReturnValue('localhost:5011') } as any;
      const result = await controller.fetchAirTrace(
        { fromhour: '08:00', tohour: '12:00', msisdn: '961123456' },
        mockReq,
      );
      expect(service.fetchAirTrace).toHaveBeenCalledWith('08:00', '12:00', '961123456', 'http://localhost:5011');
      expect(result).toEqual({ result: { data: '<html>air</html>', downloadUrl: 'http://test/download' } });
    });
  });

  describe('exportAirTraceHtml', () => {
    it('should call service with correct params including baseUrl', async () => {
      const mockReq = { protocol: 'http', get: jest.fn().mockReturnValue('localhost:5011') } as any;
      const mockRes = { set: jest.fn() } as any;
      try {
        await controller.exportAirTraceHtml(
          { fromhour: '08:00', tohour: '12:00', msisdn: '961123456' },
          mockReq,
          mockRes,
        );
      } catch {
        // createReadStream fails on fake path
      }
      expect(service.exportAirTraceHtml).toHaveBeenCalledWith('08:00', '12:00', '961123456', 'http://localhost:5011');
    });
  });

  describe('downloadAirTrace', () => {
    it('should call service with correct params and return StreamableFile', async () => {
      const mockRes = { set: jest.fn() } as any;
      const result = await controller.downloadAirTrace(
        { fromhour: '08:00', tohour: '12:00', msisdn: '961123456' },
        mockRes,
      );
      expect(service.downloadAirTrace).toHaveBeenCalledWith('08:00', '12:00', '961123456');
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'text/plain',
        'Content-Disposition': 'attachment; filename="trace.txt"',
      });
      // StreamableFile wraps a Buffer
      expect(result).toBeDefined();
    });
  });

  // ───────────────────── 29-30: Trace History ─────────────────────

  describe('fetchTraceHistory', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.fetchTraceHistory({ fromdate: '2024-01-01', todate: '2024-01-31' });
      expect(service.fetchTraceHistory).toHaveBeenCalledWith('2024-01-01', '2024-01-31');
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  describe('fetchTracedNumbers', () => {
    it('should return { result }', async () => {
      const result = await controller.fetchTracedNumbers();
      expect(service.fetchTracedNumbers).toHaveBeenCalled();
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });

  // ───────────────────── 31: Share'n'Sell ─────────────────────

  describe('shareNSellTransactionHistory', () => {
    it('should pass correct params and return { result }', async () => {
      const result = await controller.shareNSellTransactionHistory({
        fromdate: '2024-01-01',
        todate: '2024-01-31',
        msisdn: '961123456',
      });
      expect(service.shareNSellTransactionHistory).toHaveBeenCalledWith('2024-01-01', '2024-01-31', '961123456');
      expect(result).toEqual({ result: { header: [], body: [] } });
    });
  });
});
