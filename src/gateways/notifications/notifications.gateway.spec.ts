import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { NotificationsGateway } from './notifications.gateway';
import { RedisSocketStateService } from '../redis-socket-state.service';
import type { Socket } from 'socket.io';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;

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
    id = 'notif-socket-1',
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
        NotificationsGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: RedisSocketStateService, useValue: mockRedisState },
      ],
    }).compile();

    gateway = module.get<NotificationsGateway>(NotificationsGateway);
    (gateway as unknown as { server: unknown }).server = mockServer;
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleConnection', () => {
    it('should join the notifications room', () => {
      const client = buildClient();
      gateway.handleConnection(client as unknown as Socket);
      expect(client.join).toHaveBeenCalledWith('notifications');
    });

    it('should call addSocket when query.id is present', async () => {
      const client = buildClient('s1', 'user-123');
      gateway.handleConnection(client as unknown as Socket);
      // Allow microtask to run
      await Promise.resolve();
      expect(mockRedisState.set).toHaveBeenCalledWith('notifications:s1', JSON.stringify({ s1: 'user-123' }));
    });

    it('should not call redisState.set when query.id is absent', () => {
      const client = buildClient('s1');
      gateway.handleConnection(client as unknown as Socket);
      expect(mockRedisState.set).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should delete Redis key on disconnect', async () => {
      const client = buildClient('s-abc');
      await gateway.handleDisconnect(client as unknown as Socket);
      expect(mockRedisState.del).toHaveBeenCalledWith('notifications:s-abc');
    });
  });

  describe('sendAlert', () => {
    it('should emit alert to sockets matching the userId', async () => {
      const socketId = 's-match';
      const userId = 'user-42';
      const payload = { message: 'Alert!' };

      mockRedisState.scan.mockResolvedValue([`notifications:${socketId}`]);
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

    it('should not emit when userId does not match stored mapping', async () => {
      const socketId = 's-other';
      mockRedisState.scan.mockResolvedValue([`notifications:${socketId}`]);
      mockRedisState.get.mockResolvedValue(JSON.stringify({ [socketId]: 'different-user' }));

      mockServer.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([{ id: socketId }]),
      });

      await gateway.sendAlert('target-user', { message: 'Alert' });

      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('should do nothing when no Redis keys found', async () => {
      mockRedisState.scan.mockResolvedValue([]);
      await gateway.sendAlert('user-1', { message: 'Alert' });
      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  describe('sendConnectivityAlert', () => {
    it('should emit connectivity_alert event to matching user sockets', async () => {
      const socketId = 's-conn';
      const userId = 'user-conn';

      mockRedisState.scan.mockResolvedValue([`notifications:${socketId}`]);
      mockRedisState.get.mockResolvedValue(JSON.stringify({ [socketId]: userId }));

      mockServer.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([{ id: socketId }]),
      });

      const emitMock = jest.fn();
      mockServer.to.mockReturnValue({ emit: emitMock });

      await gateway.sendConnectivityAlert(userId, { type: 'DOWN' });

      expect(emitMock).toHaveBeenCalledWith('connectivity_alert', { type: 'DOWN' });
    });
  });

  describe('@OnEvent handlers', () => {
    it('handleNotificationSendEvent should call sendAlert', async () => {
      const spy = jest.spyOn(gateway, 'sendAlert').mockResolvedValue();
      gateway.handleNotificationSendEvent({ userId: 'u1', payload: { msg: 'hi' } });
      await Promise.resolve();
      expect(spy).toHaveBeenCalledWith('u1', { msg: 'hi' });
    });

    it('handleConnectivityAlertEvent should call sendConnectivityAlert', async () => {
      const spy = jest.spyOn(gateway, 'sendConnectivityAlert').mockResolvedValue();
      gateway.handleConnectivityAlertEvent({ userId: 'u2', payload: { type: 'DOWN' } });
      await Promise.resolve();
      expect(spy).toHaveBeenCalledWith('u2', { type: 'DOWN' });
    });
  });
});
