import { Test, TestingModule } from '@nestjs/testing';
import { CustomerCareService } from './customer-care.service';
import { CustomerCareAirService } from './services/customer-care-air.service';
import { CustomerCareNetworkService } from './services/customer-care-network.service';
import { CustomerCareHistoryService } from './services/customer-care-history.service';
import { CustomerCareSdpTraceService } from './services/customer-care-sdp-trace.service';
import { CustomerCareAirTraceService } from './services/customer-care-air-trace.service';

describe('CustomerCareService', () => {
  let service: CustomerCareService;
  let airService: jest.Mocked<CustomerCareAirService>;
  let networkService: jest.Mocked<CustomerCareNetworkService>;
  let historyService: jest.Mocked<CustomerCareHistoryService>;
  let sdpTraceService: jest.Mocked<CustomerCareSdpTraceService>;
  let airTraceService: jest.Mocked<CustomerCareAirTraceService>;

  const mockRequest = { AIRServer: '10.0.0.1', usr: 'user', pass: 'pass' } as any;

  const mockAirService = {
    airServerAdjuster: jest.fn().mockResolvedValue(mockRequest),
    getSDP: jest.fn().mockResolvedValue({ sdpVIP: '10.0.0.1', sdpId: '1', sdpName: 'SDP1' }),
    getDedicatedAccounts: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getOffers: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getAccumulators: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getPAM: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getUsageCounter: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getUsageThreshold: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getSob: jest.fn().mockResolvedValue({ SOB: 100, balance: '500' }),
  };

  const mockNetworkService = {
    getHLR: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getHSS: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getMTAS: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getSubscriptionHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
  };

  const mockHistoryService = {
    getMsapSubscriptionHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getMsapVasSubscription: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getCdrHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
    exportCdrHistoryExcel: jest.fn().mockResolvedValue('/tmp/cdr.xlsx'),
    getHourlyBalance: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getDailyDAHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
    shareNSellTransactionHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
  };

  const mockSdpTraceService = {
    setTrace: jest.fn().mockResolvedValue(undefined),
    unsetTrace: jest.fn().mockResolvedValue(undefined),
    fetchTrace: jest.fn().mockResolvedValue('<html>trace</html>'),
    exportSdpTraceHtml: jest.fn().mockResolvedValue('/tmp/trace.html'),
    exportSdpTraceRawMappingHtml: jest.fn().mockResolvedValue('/tmp/trace-raw.html'),
    exportSdpTraceRawText: jest.fn().mockResolvedValue('/tmp/trace.txt'),
  };

  const mockAirTraceService = {
    setAirTrace: jest.fn().mockResolvedValue(undefined),
    unsetAirTrace: jest.fn().mockResolvedValue(undefined),
    fetchAirTrace: jest.fn().mockResolvedValue({ data: '<html>air</html>', downloadUrl: 'http://test/download' }),
    exportAirTraceHtml: jest.fn().mockResolvedValue('/tmp/air-trace.html'),
    downloadAirTrace: jest.fn().mockResolvedValue({ fileName: 'trace.txt', content: 'raw trace' }),
    fetchTraceHistory: jest.fn().mockResolvedValue({ header: [], body: [] }),
    fetchTracedNumbers: jest.fn().mockResolvedValue({ header: [], body: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerCareService,
        { provide: CustomerCareAirService, useValue: mockAirService },
        { provide: CustomerCareNetworkService, useValue: mockNetworkService },
        { provide: CustomerCareHistoryService, useValue: mockHistoryService },
        { provide: CustomerCareSdpTraceService, useValue: mockSdpTraceService },
        { provide: CustomerCareAirTraceService, useValue: mockAirTraceService },
      ],
    }).compile();

    service = module.get<CustomerCareService>(CustomerCareService);
    airService = module.get(CustomerCareAirService);
    networkService = module.get(CustomerCareNetworkService);
    historyService = module.get(CustomerCareHistoryService);
    sdpTraceService = module.get(CustomerCareSdpTraceService);
    airTraceService = module.get(CustomerCareAirTraceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───────────────────── AIR methods (airServerAdjuster + delegation) ─────────────────────

  describe('getSDP', () => {
    it('should call airServerAdjuster then delegate to airService.getSDP', async () => {
      const result = await service.getSDP('961123456', true);
      expect(airService.airServerAdjuster).toHaveBeenCalledWith(true);
      expect(airService.getSDP).toHaveBeenCalledWith('961123456', mockRequest);
      expect(result).toEqual({ sdpVIP: '10.0.0.1', sdpId: '1', sdpName: 'SDP1' });
    });
  });

  describe('getDedicatedAccounts', () => {
    it('should call airServerAdjuster then delegate to airService.getDedicatedAccounts', async () => {
      await service.getDedicatedAccounts('961123456', false);
      expect(airService.airServerAdjuster).toHaveBeenCalledWith(false);
      expect(airService.getDedicatedAccounts).toHaveBeenCalledWith('961123456', mockRequest);
    });
  });

  describe('getOffers', () => {
    it('should call airServerAdjuster then delegate to airService.getOffers', async () => {
      await service.getOffers('961123456', true);
      expect(airService.airServerAdjuster).toHaveBeenCalledWith(true);
      expect(airService.getOffers).toHaveBeenCalledWith('961123456', mockRequest);
    });
  });

  describe('getAccumulators', () => {
    it('should call airServerAdjuster then delegate to airService.getAccumulators', async () => {
      await service.getAccumulators('961123456', false);
      expect(airService.airServerAdjuster).toHaveBeenCalledWith(false);
      expect(airService.getAccumulators).toHaveBeenCalledWith('961123456', mockRequest);
    });
  });

  describe('getPAM', () => {
    it('should call airServerAdjuster then delegate to airService.getPAM', async () => {
      await service.getPAM('961123456', true);
      expect(airService.airServerAdjuster).toHaveBeenCalledWith(true);
      expect(airService.getPAM).toHaveBeenCalledWith('961123456', mockRequest);
    });
  });

  describe('getUsageCounter', () => {
    it('should call airServerAdjuster then delegate to airService.getUsageCounter', async () => {
      await service.getUsageCounter('961123456', false);
      expect(airService.airServerAdjuster).toHaveBeenCalledWith(false);
      expect(airService.getUsageCounter).toHaveBeenCalledWith('961123456', mockRequest);
    });
  });

  describe('getUsageThreshold', () => {
    it('should call airServerAdjuster then delegate to airService.getUsageThreshold', async () => {
      await service.getUsageThreshold('961123456', true);
      expect(airService.airServerAdjuster).toHaveBeenCalledWith(true);
      expect(airService.getUsageThreshold).toHaveBeenCalledWith('961123456', mockRequest);
    });
  });

  describe('getSob', () => {
    it('should call airServerAdjuster then delegate to airService.getSob', async () => {
      const result = await service.getSob('961123456', false);
      expect(airService.airServerAdjuster).toHaveBeenCalledWith(false);
      expect(airService.getSob).toHaveBeenCalledWith('961123456', mockRequest);
      expect(result).toEqual({ SOB: 100, balance: '500' });
    });
  });

  // ───────────────────── Network methods (direct delegation) ─────────────────────

  describe('getHLR', () => {
    it('should delegate directly to networkService.getHLR', async () => {
      await service.getHLR('961123456');
      expect(networkService.getHLR).toHaveBeenCalledWith('961123456');
    });
  });

  describe('getHSS', () => {
    it('should delegate directly to networkService.getHSS', async () => {
      await service.getHSS('961123456');
      expect(networkService.getHSS).toHaveBeenCalledWith('961123456');
    });
  });

  describe('getMTAS', () => {
    it('should delegate directly to networkService.getMTAS', async () => {
      await service.getMTAS('961123456');
      expect(networkService.getMTAS).toHaveBeenCalledWith('961123456');
    });
  });

  describe('getSubscriptionHistory', () => {
    it('should delegate directly to networkService.getSubscriptionHistory', async () => {
      await service.getSubscriptionHistory('user1', '2024-01-01', '2024-01-31', true, '961123456');
      expect(networkService.getSubscriptionHistory).toHaveBeenCalledWith(
        'user1',
        '2024-01-01',
        '2024-01-31',
        true,
        '961123456',
      );
    });
  });

  // ───────────────────── History methods (direct delegation) ─────────────────────

  describe('getMsapSubscriptionHistory', () => {
    it('should delegate directly to historyService.getMsapSubscriptionHistory', async () => {
      await service.getMsapSubscriptionHistory('user1', '2024-01-01', '2024-01-31', false, '961123456');
      expect(historyService.getMsapSubscriptionHistory).toHaveBeenCalledWith(
        'user1',
        '2024-01-01',
        '2024-01-31',
        false,
        '961123456',
      );
    });
  });

  describe('getMsapVasSubscription', () => {
    it('should delegate directly to historyService.getMsapVasSubscription', async () => {
      await service.getMsapVasSubscription('user1', true, '961123456', '2024-01-01', '2024-01-31');
      expect(historyService.getMsapVasSubscription).toHaveBeenCalledWith(
        'user1',
        true,
        '961123456',
        '2024-01-01',
        '2024-01-31',
      );
    });
  });

  describe('getCdrHistory', () => {
    it('should delegate directly to historyService.getCdrHistory with correct param order', async () => {
      await service.getCdrHistory('2024-01-01', '2024-01-31', '961123456');
      expect(historyService.getCdrHistory).toHaveBeenCalledWith('961123456', '2024-01-01', '2024-01-31');
    });
  });

  describe('exportCdrHistoryExcel', () => {
    it('should delegate directly to historyService.exportCdrHistoryExcel with correct param order', async () => {
      const result = await service.exportCdrHistoryExcel('2024-01-01', '2024-01-31', '961123456');
      expect(historyService.exportCdrHistoryExcel).toHaveBeenCalledWith('961123456', '2024-01-01', '2024-01-31');
      expect(result).toBe('/tmp/cdr.xlsx');
    });
  });

  describe('getHourlyBalance', () => {
    it('should delegate directly to historyService.getHourlyBalance', async () => {
      await service.getHourlyBalance('2024-01-15', '10.0.0.1', '961123456');
      expect(historyService.getHourlyBalance).toHaveBeenCalledWith('2024-01-15', '10.0.0.1', '961123456');
    });
  });

  describe('getDailyDAHistory', () => {
    it('should delegate directly to historyService.getDailyDAHistory', async () => {
      await service.getDailyDAHistory('2024-01-01', '2024-01-31', '10.0.0.1', '961123456');
      expect(historyService.getDailyDAHistory).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-01-31',
        '10.0.0.1',
        '961123456',
      );
    });
  });

  describe('shareNSellTransactionHistory', () => {
    it('should delegate directly to historyService.shareNSellTransactionHistory', async () => {
      await service.shareNSellTransactionHistory('2024-01-01', '2024-01-31', '961123456');
      expect(historyService.shareNSellTransactionHistory).toHaveBeenCalledWith('2024-01-01', '2024-01-31', '961123456');
    });
  });

  // ───────────────────── SDP Trace methods (direct delegation) ─────────────────────

  describe('setTrace', () => {
    it('should delegate directly to sdpTraceService.setTrace', async () => {
      await service.setTrace('10.0.0.1', '961123456', 'user1');
      expect(sdpTraceService.setTrace).toHaveBeenCalledWith('10.0.0.1', '961123456', 'user1');
    });
  });

  describe('unsetTrace', () => {
    it('should delegate directly to sdpTraceService.unsetTrace', async () => {
      await service.unsetTrace('10.0.0.1', '961123456', 'user1');
      expect(sdpTraceService.unsetTrace).toHaveBeenCalledWith('10.0.0.1', '961123456', 'user1');
    });
  });

  describe('fetchTrace', () => {
    it('should delegate directly to sdpTraceService.fetchTrace', async () => {
      const result = await service.fetchTrace('08:00', '12:00', '10.0.0.1', '961123456');
      expect(sdpTraceService.fetchTrace).toHaveBeenCalledWith('08:00', '12:00', '10.0.0.1', '961123456');
      expect(result).toBe('<html>trace</html>');
    });
  });

  describe('exportSdpTraceHtml', () => {
    it('should delegate directly to sdpTraceService.exportSdpTraceHtml', async () => {
      const result = await service.exportSdpTraceHtml('08:00', '12:00', '10.0.0.1', '961123456');
      expect(sdpTraceService.exportSdpTraceHtml).toHaveBeenCalledWith('08:00', '12:00', '10.0.0.1', '961123456');
      expect(result).toBe('/tmp/trace.html');
    });
  });

  describe('exportSdpTraceRawMappingHtml', () => {
    it('should delegate directly to sdpTraceService.exportSdpTraceRawMappingHtml', async () => {
      const result = await service.exportSdpTraceRawMappingHtml('08:00', '12:00', '10.0.0.1', '961123456');
      expect(sdpTraceService.exportSdpTraceRawMappingHtml).toHaveBeenCalledWith(
        '08:00',
        '12:00',
        '10.0.0.1',
        '961123456',
      );
      expect(result).toBe('/tmp/trace-raw.html');
    });
  });

  describe('exportSdpTraceRawText', () => {
    it('should delegate directly to sdpTraceService.exportSdpTraceRawText', async () => {
      const result = await service.exportSdpTraceRawText('08:00', '12:00', '10.0.0.1', '961123456');
      expect(sdpTraceService.exportSdpTraceRawText).toHaveBeenCalledWith('08:00', '12:00', '10.0.0.1', '961123456');
      expect(result).toBe('/tmp/trace.txt');
    });
  });

  // ───────────────────── AIR Trace methods (direct delegation) ─────────────────────

  describe('setAirTrace', () => {
    it('should delegate directly to airTraceService.setAirTrace', async () => {
      await service.setAirTrace('961123456', 'user1');
      expect(airTraceService.setAirTrace).toHaveBeenCalledWith('961123456', 'user1');
    });
  });

  describe('unsetAirTrace', () => {
    it('should delegate directly to airTraceService.unsetAirTrace', async () => {
      await service.unsetAirTrace('961123456', 'user1');
      expect(airTraceService.unsetAirTrace).toHaveBeenCalledWith('961123456', 'user1');
    });
  });

  describe('fetchAirTrace', () => {
    it('should delegate directly to airTraceService.fetchAirTrace', async () => {
      const result = await service.fetchAirTrace('08:00', '12:00', '961123456', 'http://localhost:5011');
      expect(airTraceService.fetchAirTrace).toHaveBeenCalledWith(
        '08:00',
        '12:00',
        '961123456',
        'http://localhost:5011',
      );
      expect(result).toEqual({ data: '<html>air</html>', downloadUrl: 'http://test/download' });
    });
  });

  describe('exportAirTraceHtml', () => {
    it('should delegate directly to airTraceService.exportAirTraceHtml', async () => {
      const result = await service.exportAirTraceHtml('08:00', '12:00', '961123456', 'http://localhost:5011');
      expect(airTraceService.exportAirTraceHtml).toHaveBeenCalledWith(
        '08:00',
        '12:00',
        '961123456',
        'http://localhost:5011',
      );
      expect(result).toBe('/tmp/air-trace.html');
    });
  });

  describe('downloadAirTrace', () => {
    it('should delegate directly to airTraceService.downloadAirTrace', async () => {
      const result = await service.downloadAirTrace('08:00', '12:00', '961123456');
      expect(airTraceService.downloadAirTrace).toHaveBeenCalledWith('08:00', '12:00', '961123456');
      expect(result).toEqual({ fileName: 'trace.txt', content: 'raw trace' });
    });
  });

  describe('fetchTraceHistory', () => {
    it('should delegate directly to airTraceService.fetchTraceHistory', async () => {
      await service.fetchTraceHistory('2024-01-01', '2024-01-31');
      expect(airTraceService.fetchTraceHistory).toHaveBeenCalledWith('2024-01-01', '2024-01-31');
    });
  });

  describe('fetchTracedNumbers', () => {
    it('should delegate directly to airTraceService.fetchTracedNumbers', async () => {
      await service.fetchTracedNumbers();
      expect(airTraceService.fetchTracedNumbers).toHaveBeenCalled();
    });
  });
});
