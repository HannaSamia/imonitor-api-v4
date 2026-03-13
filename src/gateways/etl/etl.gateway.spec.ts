import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EtlGateway } from './etl.gateway';
import { DashboardGateway } from '../dashboard/dashboard.gateway';
import { ConnectivityGateway } from '../connectivity/connectivity.gateway';
import { WidgetBuilderService } from '../../modules/widget-builder/widget-builder.service';
import { NotificationService } from '../../modules/notifications/notification.service';
import { CoreDashboardError } from '../../database/entities/core-dashboard-error.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import type { Socket } from 'socket.io';

describe('EtlGateway', () => {
  let gateway: EtlGateway;

  const mockDashboardServer = {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  };

  const mockDashboardGateway = {
    getClientsFromStorage: jest.fn().mockResolvedValue({}),
    server: mockDashboardServer,
  };
  const mockConnectivityGateway = {
    broadcastConnectivityUpdate: jest.fn().mockResolvedValue(undefined),
  };
  const mockWidgetBuilderService = {
    fetchWidgetBuildersByTableName: jest.fn().mockResolvedValue([]),
    generateChartByType: jest.fn(),
  };
  const mockNotificationService = {
    processChartNotification: jest.fn().mockResolvedValue(undefined),
  };
  const mockDashboardErrorRepo = {
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockResolvedValue({}),
  };
  const mockDateHelper = { formatDate: jest.fn().mockReturnValue('2026-03-13 00:00:00') };

  function buildClient(id = 'etl-socket-1'): Partial<Socket> & { join: jest.Mock } {
    return {
      id,
      handshake: { auth: {} } as Socket['handshake'],
      data: {},
      join: jest.fn(),
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtlGateway,
        { provide: DashboardGateway, useValue: mockDashboardGateway },
        { provide: ConnectivityGateway, useValue: mockConnectivityGateway },
        { provide: WidgetBuilderService, useValue: mockWidgetBuilderService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: getRepositoryToken(CoreDashboardError), useValue: mockDashboardErrorRepo },
        { provide: DateHelperService, useValue: mockDateHelper },
      ],
    }).compile();

    gateway = module.get<EtlGateway>(EtlGateway);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleConnection', () => {
    it('should join the etl room', () => {
      const client = buildClient();
      gateway.handleConnection(client as unknown as Socket);
      expect(client.join).toHaveBeenCalledWith('etl');
    });
  });

  describe('handleConnectivityCheck', () => {
    it('should call broadcastConnectivityUpdate', async () => {
      await gateway.handleConnectivityCheck();
      expect(mockConnectivityGateway.broadcastConnectivityUpdate).toHaveBeenCalled();
    });
  });

  describe('handleTrigger', () => {
    it('should do nothing when no widget builders found for table', async () => {
      mockWidgetBuilderService.fetchWidgetBuildersByTableName.mockResolvedValue([]);
      const client = buildClient();
      await gateway.handleTrigger(client as unknown as Socket, { tableName: 'unknown_table' });
      expect(mockDashboardGateway.getClientsFromStorage).not.toHaveBeenCalled();
    });

    it('should do nothing when tableName is missing', async () => {
      const client = buildClient();
      await gateway.handleTrigger(client as unknown as Socket, { tableName: '' });
      expect(mockWidgetBuilderService.fetchWidgetBuildersByTableName).not.toHaveBeenCalled();
    });

    it('should process charts for matched widget builders', async () => {
      const wb1 = 'wb-match';
      const chart = { widgetBuilderId: wb1, chartId: 'c1' };
      const chartResult = { type: 'counter', data: 42 };

      mockWidgetBuilderService.fetchWidgetBuildersByTableName.mockResolvedValue([wb1]);
      mockDashboardGateway.getClientsFromStorage.mockResolvedValue({
        'socket-1': [chart],
      });
      mockWidgetBuilderService.generateChartByType.mockResolvedValue(chartResult);

      const emitMock = jest.fn();
      mockDashboardServer.to.mockReturnValue({ emit: emitMock });

      const client = buildClient();
      await gateway.handleTrigger(client as unknown as Socket, { tableName: 'some_table' });

      expect(mockWidgetBuilderService.generateChartByType).toHaveBeenCalledWith(chart);
      expect(emitMock).toHaveBeenCalledWith(`${wb1}_c1`, chartResult);
    });

    it('should call processChartNotification for non-excluded chart types', async () => {
      const wb1 = 'wb-notif';
      const chart = { widgetBuilderId: wb1, chartId: 'c-notif' };
      // 'counter' is not in CHARTS_WITHOUT_NOTIFICATION → should trigger notification
      const chartResult = { type: 'counter', data: 100 };

      mockWidgetBuilderService.fetchWidgetBuildersByTableName.mockResolvedValue([wb1]);
      mockDashboardGateway.getClientsFromStorage.mockResolvedValue({
        's-notif': [chart],
      });
      mockWidgetBuilderService.generateChartByType.mockResolvedValue(chartResult);
      mockDashboardServer.to.mockReturnValue({ emit: jest.fn() });

      const client = buildClient();
      await gateway.handleTrigger(client as unknown as Socket, { tableName: 'notif_table' });

      // Allow micro-tasks (fire-and-forget) to run
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotificationService.processChartNotification).toHaveBeenCalledWith(chartResult, wb1);
    });

    it('should NOT call processChartNotification for excluded chart types', async () => {
      const wb1 = 'wb-trend';
      const chart = { widgetBuilderId: wb1, chartId: 'c-trend' };
      const chartResult = { type: 'trend', data: [] };

      mockWidgetBuilderService.fetchWidgetBuildersByTableName.mockResolvedValue([wb1]);
      mockDashboardGateway.getClientsFromStorage.mockResolvedValue({
        's-trend': [chart],
      });
      mockWidgetBuilderService.generateChartByType.mockResolvedValue(chartResult);
      mockDashboardServer.to.mockReturnValue({ emit: jest.fn() });

      const client = buildClient();
      await gateway.handleTrigger(client as unknown as Socket, { tableName: 'trend_table' });

      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotificationService.processChartNotification).not.toHaveBeenCalled();
    });

    it('should save error and emit error payload when chart generation fails', async () => {
      const wb1 = 'wb-err';
      const chart = { widgetBuilderId: wb1, chartId: 'c-err' };

      mockWidgetBuilderService.fetchWidgetBuildersByTableName.mockResolvedValue([wb1]);
      mockDashboardGateway.getClientsFromStorage.mockResolvedValue({
        's-err': [chart],
      });
      mockWidgetBuilderService.generateChartByType.mockRejectedValue(new Error('Chart generation failed'));

      const emitMock = jest.fn();
      mockDashboardServer.to.mockReturnValue({ emit: emitMock });

      const client = buildClient();
      await gateway.handleTrigger(client as unknown as Socket, { tableName: 'err_table' });

      expect(mockDashboardErrorRepo.save).toHaveBeenCalled();
      expect(emitMock).toHaveBeenCalledWith(
        `${wb1}_c-err`,
        expect.objectContaining({ hasError: true, message: 'Chart not loaded' }),
      );
    });

    it('should deduplicate charts with same widgetBuilderId+chartId', async () => {
      const wb1 = 'wb-dup';
      const chart = { widgetBuilderId: wb1, chartId: 'c-dup' };

      mockWidgetBuilderService.fetchWidgetBuildersByTableName.mockResolvedValue([wb1]);
      // Same chart appears twice for the same socket
      mockDashboardGateway.getClientsFromStorage.mockResolvedValue({
        's-dup': [chart, chart],
      });
      mockWidgetBuilderService.generateChartByType.mockResolvedValue({ type: 'counter', data: 1 });
      mockDashboardServer.to.mockReturnValue({ emit: jest.fn() });

      const client = buildClient();
      await gateway.handleTrigger(client as unknown as Socket, { tableName: 'dup_table' });

      // Should only generate once due to deduplication
      expect(mockWidgetBuilderService.generateChartByType).toHaveBeenCalledTimes(1);
    });
  });
});
