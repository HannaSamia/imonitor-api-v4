import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ObservabilityAlertsGateway } from './observability-alerts.gateway';
import { RedisSocketStateService } from '../redis-socket-state.service';
import type { Socket } from 'socket.io';

describe('ObservabilityAlertsGateway', () => {
  let gateway: ObservabilityAlertsGateway;

  const mockJwtService = { verify: jest.fn() };
  const mockRedisState = {
    del: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    scan: jest.fn().mockResolvedValue([]),
    lrange: jest.fn(),
    rpush: jest.fn(),
  };
  const mockServer = {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) }),
  };

  function buildClient(
    id = 'obs-alert-socket-1',
    queryId?: string,
  ): Partial<Socket> & { emit: jest.Mock; join: jest.Mock } {
    return {
      id,
      handshake: {
        auth: {},
        query: queryId ? { id: queryId } : {},
      } as unknown as Socket['handshake'],
      data: {},
      emit: jest.fn(),
      join: jest.fn(),
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservabilityAlertsGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: RedisSocketStateService, useValue: mockRedisState },
      ],
    }).compile();

    gateway = module.get<ObservabilityAlertsGateway>(ObservabilityAlertsGateway);
    (gateway as unknown as { server: unknown }).server = mockServer;
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleConnection', () => {
    it('should join the observability_alerts room', () => {
      const client = buildClient();
      gateway.handleConnection(client as unknown as Socket);
      expect(client.join).toHaveBeenCalledWith('observability_alerts');
    });

    it('should call addSocket when query.id is present', async () => {
      const client = buildClient('s1', 'user-obs');
      gateway.handleConnection(client as unknown as Socket);
      await Promise.resolve();
      expect(mockRedisState.set).toHaveBeenCalledWith(
        'observabilityNotifications:s1',
        JSON.stringify({ s1: 'user-obs' }),
      );
    });

    it('should not call redisState.set when query.id is absent', () => {
      const client = buildClient('s1');
      gateway.handleConnection(client as unknown as Socket);
      expect(mockRedisState.set).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should delete Redis key using observabilityNotifications prefix', async () => {
      const client = buildClient('s-obs');
      await gateway.handleDisconnect(client as unknown as Socket);
      expect(mockRedisState.del).toHaveBeenCalledWith('observabilityNotifications:s-obs');
    });
  });

  describe('sendAlert', () => {
    it('should emit alert to matching user sockets', async () => {
      const socketId = 's-match-obs';
      const userId = 'u-obs';
      const payload = { metric: 'CPU', threshold: 95 };

      mockRedisState.scan.mockResolvedValue([`observabilityNotifications:${socketId}`]);
      mockRedisState.get.mockResolvedValue(JSON.stringify({ [socketId]: userId }));
      mockServer.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([{ id: socketId }]),
      });

      const emitMock = jest.fn();
      mockServer.to.mockReturnValue({ emit: emitMock });

      await gateway.sendAlert(userId, payload);

      expect(mockServer.to).toHaveBeenCalledWith(socketId);
      expect(emitMock).toHaveBeenCalledWith('alert', payload);
    });

    it('should not emit when no keys found', async () => {
      mockRedisState.scan.mockResolvedValue([]);
      await gateway.sendAlert('user-1', { msg: 'test' });
      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('should not emit when userId does not match', async () => {
      const socketId = 's-no-match';
      mockRedisState.scan.mockResolvedValue([`observabilityNotifications:${socketId}`]);
      mockRedisState.get.mockResolvedValue(JSON.stringify({ [socketId]: 'other-user' }));
      mockServer.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([{ id: socketId }]),
      });

      await gateway.sendAlert('target-user', { msg: 'alert' });
      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  describe('@OnEvent handler', () => {
    it('handleObservabilityAlertEvent should call sendAlert', async () => {
      const spy = jest.spyOn(gateway, 'sendAlert').mockResolvedValue();
      gateway.handleObservabilityAlertEvent({ userId: 'u-obs', payload: { metric: 'MEM' } });
      await Promise.resolve();
      expect(spy).toHaveBeenCalledWith('u-obs', { metric: 'MEM' });
    });
  });
});
