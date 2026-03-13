import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardGateway } from './dashboard.gateway';
import { RedisSocketStateService } from '../redis-socket-state.service';
import { CoreDashboardError } from '../../database/entities/core-dashboard-error.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { WidgetBuilderService } from '../../modules/widget-builder/widget-builder.service';
import type { Socket } from 'socket.io';

describe('DashboardGateway', () => {
  let gateway: DashboardGateway;

  const mockJwtService = { verify: jest.fn() };
  const mockWidgetBuilderService = { generateChartByType: jest.fn() };
  const mockRedisState = {
    del: jest.fn(),
    lrange: jest.fn().mockResolvedValue([]),
    rpush: jest.fn(),
    scan: jest.fn().mockResolvedValue([]),
    get: jest.fn(),
    set: jest.fn(),
  };
  const mockLegacyDataDb = { affectedQuery: jest.fn().mockResolvedValue({ affectedRows: 1 }) };
  const mockDateHelper = { formatDate: jest.fn().mockReturnValue('2026-03-13 00:00:00') };
  const mockDashboardErrorRepo = {
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockResolvedValue({}),
  };

  function buildClient(id = 'socket-1'): Partial<Socket> & { emit: jest.Mock; join: jest.Mock } {
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
        DashboardGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: WidgetBuilderService, useValue: mockWidgetBuilderService },
        { provide: RedisSocketStateService, useValue: mockRedisState },
        { provide: LegacyDataDbService, useValue: mockLegacyDataDb },
        { provide: DateHelperService, useValue: mockDateHelper },
        { provide: getRepositoryToken(CoreDashboardError), useValue: mockDashboardErrorRepo },
      ],
    }).compile();

    gateway = module.get<DashboardGateway>(DashboardGateway);

    // Provide a mock server with fetchSockets
    (gateway as unknown as { server: unknown }).server = {
      in: jest.fn().mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([]),
      }),
    };
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleConnection', () => {
    it('should join the dashboard room on connection', () => {
      const client = buildClient();
      gateway.handleConnection(client as unknown as Socket);
      expect(client.join).toHaveBeenCalledWith('dashboard');
    });
  });

  describe('handleDisconnect', () => {
    it('should delete the Redis key for the disconnecting socket', async () => {
      const client = buildClient('socket-abc');
      await gateway.handleDisconnect(client as unknown as Socket);
      expect(mockRedisState.del).toHaveBeenCalledWith('dashboard:socket-abc');
    });
  });

  describe('handleRunChart', () => {
    it('should emit chart result on successful generation', async () => {
      const client = buildClient('s1');
      const body = { widgetBuilderId: 'wb1', chartId: 'c1' };
      const chartResult = { type: 'trend', data: [] };

      mockRedisState.lrange.mockResolvedValue([]);
      mockWidgetBuilderService.generateChartByType.mockResolvedValue(chartResult);

      await gateway.handleRunChart(client as unknown as Socket, body);

      expect(mockRedisState.rpush).toHaveBeenCalledWith('dashboard:s1', JSON.stringify(body));
      expect(mockWidgetBuilderService.generateChartByType).toHaveBeenCalledWith(body);
      expect(client.emit).toHaveBeenCalledWith('wb1_c1', chartResult);
    });

    it('should skip duplicate chart already in Redis list', async () => {
      const client = buildClient('s1');
      const body = { widgetBuilderId: 'wb1', chartId: 'c1' };

      mockRedisState.lrange.mockResolvedValue([JSON.stringify(body)]);

      await gateway.handleRunChart(client as unknown as Socket, body);

      expect(mockWidgetBuilderService.generateChartByType).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
    });

    it('should save error and emit error object on chart generation failure', async () => {
      const client = buildClient('s1');
      const body = { widgetBuilderId: 'wb1', chartId: 'c1' };
      const error = new Error('DB down');

      mockRedisState.lrange.mockResolvedValue([]);
      mockWidgetBuilderService.generateChartByType.mockRejectedValue(error);

      await gateway.handleRunChart(client as unknown as Socket, body);

      expect(mockDashboardErrorRepo.save).toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'wb1_c1',
        expect.objectContaining({ hasError: true, message: 'Chart not loaded' }),
      );
    });
  });

  describe('getClientsFromStorage', () => {
    it('should return an empty map when no Redis keys exist', async () => {
      mockRedisState.scan.mockResolvedValue([]);
      const result = await gateway.getClientsFromStorage();
      expect(result).toEqual({});
    });

    it('should build client map for connected sockets with their charts', async () => {
      const charts = [{ widgetBuilderId: 'wb1', chartId: 'c1' }];
      mockRedisState.scan.mockResolvedValue(['dashboard:socket-1']);
      mockRedisState.lrange.mockResolvedValue([JSON.stringify(charts[0])]);

      (gateway as unknown as { server: { in: jest.Mock } }).server.in = jest.fn().mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([{ id: 'socket-1' }]),
      });

      const result = await gateway.getClientsFromStorage();
      expect(result).toEqual({ 'socket-1': charts });
    });

    it('should exclude sockets that are no longer connected', async () => {
      mockRedisState.scan.mockResolvedValue(['dashboard:socket-ghost']);
      mockRedisState.lrange.mockResolvedValue([JSON.stringify({ widgetBuilderId: 'wb1', chartId: 'c1' })]);

      // fetchSockets returns no connected sockets
      (gateway as unknown as { server: { in: jest.Mock } }).server.in = jest.fn().mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([]),
      });

      const result = await gateway.getClientsFromStorage();
      expect(result).toEqual({});
    });
  });
});
