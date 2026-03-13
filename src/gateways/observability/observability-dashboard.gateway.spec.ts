import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObservabilityDashboardGateway } from './observability-dashboard.gateway';
import { RedisSocketStateService } from '../redis-socket-state.service';
import { CoreObservabilityDashboardError } from '../../database/entities/core-observability-dashboard-error.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ObservabilityService } from '../../modules/observability/observability.service';
import type { Socket } from 'socket.io';

describe('ObservabilityDashboardGateway', () => {
  let gateway: ObservabilityDashboardGateway;

  const mockJwtService = { verify: jest.fn() };
  const mockObservabilityService = { generateChartByType: jest.fn() };
  const mockRedisState = {
    del: jest.fn(),
    lrange: jest.fn().mockResolvedValue([]),
    rpush: jest.fn(),
    scan: jest.fn().mockResolvedValue([]),
  };
  const mockDateHelper = { formatDate: jest.fn().mockReturnValue('2026-03-13 00:00:00') };
  const mockObsErrorRepo = {
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockResolvedValue({}),
  };

  function buildClient(id = 'obs-socket-1'): Partial<Socket> & { emit: jest.Mock; join: jest.Mock } {
    return {
      id,
      handshake: { auth: {} } as Socket['handshake'],
      data: {},
      emit: jest.fn(),
      join: jest.fn(),
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservabilityDashboardGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ObservabilityService, useValue: mockObservabilityService },
        { provide: RedisSocketStateService, useValue: mockRedisState },
        { provide: DateHelperService, useValue: mockDateHelper },
        { provide: getRepositoryToken(CoreObservabilityDashboardError), useValue: mockObsErrorRepo },
      ],
    }).compile();

    gateway = module.get<ObservabilityDashboardGateway>(ObservabilityDashboardGateway);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleConnection', () => {
    it('should join the observability_dashboards room', () => {
      const client = buildClient();
      gateway.handleConnection(client as unknown as Socket);
      expect(client.join).toHaveBeenCalledWith('observability_dashboards');
    });
  });

  describe('handleDisconnect', () => {
    it('should delete Redis key for disconnected socket', async () => {
      const client = buildClient('obs-123');
      await gateway.handleDisconnect(client as unknown as Socket);
      expect(mockRedisState.del).toHaveBeenCalledWith('observability_dashboards:obs-123');
    });
  });

  describe('handleRunChart', () => {
    it('should emit chart result keyed by chartId on success', async () => {
      const client = buildClient('s1');
      const body = { chartId: 'chart-abc', someField: 'value' };
      const chartResult = { data: [1, 2, 3] };

      mockRedisState.lrange.mockResolvedValue([]);
      mockObservabilityService.generateChartByType.mockResolvedValue(chartResult);

      await gateway.handleRunChart(client as unknown as Socket, body);

      expect(mockRedisState.rpush).toHaveBeenCalledWith('observability_dashboards:s1', 'chart-abc');
      expect(mockObservabilityService.generateChartByType).toHaveBeenCalledWith(body);
      expect(client.emit).toHaveBeenCalledWith('chart-abc', chartResult);
    });

    it('should skip duplicate chartId already in Redis list', async () => {
      const client = buildClient('s1');
      const body = { chartId: 'chart-abc' };

      mockRedisState.lrange.mockResolvedValue(['chart-abc']);

      await gateway.handleRunChart(client as unknown as Socket, body);

      expect(mockObservabilityService.generateChartByType).not.toHaveBeenCalled();
    });

    it('should return early if chartId is missing', async () => {
      const client = buildClient('s1');
      await gateway.handleRunChart(client as unknown as Socket, { someOtherField: true });

      expect(mockObservabilityService.generateChartByType).not.toHaveBeenCalled();
    });

    it('should save error and emit error object on failure', async () => {
      const client = buildClient('s1');
      const body = { chartId: 'chart-xyz' };
      const error = new Error('Service failure');

      mockRedisState.lrange.mockResolvedValue([]);
      mockObservabilityService.generateChartByType.mockRejectedValue(error);

      await gateway.handleRunChart(client as unknown as Socket, body);

      expect(mockObsErrorRepo.save).toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'chart-xyz',
        expect.objectContaining({ hasError: true, message: 'Chart not loaded' }),
      );
    });
  });
});
