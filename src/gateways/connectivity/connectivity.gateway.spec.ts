import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConnectivityGateway } from './connectivity.gateway';
import { RedisSocketStateService } from '../redis-socket-state.service';
import { ConnectivityService } from '../../modules/connectivity/connectivity.service';
import type { Socket } from 'socket.io';

describe('ConnectivityGateway', () => {
  let gateway: ConnectivityGateway;

  const mockJwtService = { verify: jest.fn() };
  const mockConnectivityService = {
    getAllConnectivities: jest.fn().mockResolvedValue({ header: [], body: [] }),
    getFailedNodes: jest.fn().mockResolvedValue(''),
  };
  const mockRedisState = {
    del: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    scan: jest.fn().mockResolvedValue([]),
    lrange: jest.fn(),
    rpush: jest.fn(),
  };
  const mockEventEmitter = { emit: jest.fn() };
  const mockServer = {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) }),
  };

  function buildClient(id = 'conn-socket-1', queryId?: string): Partial<Socket> & { emit: jest.Mock; join: jest.Mock } {
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
        ConnectivityGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConnectivityService, useValue: mockConnectivityService },
        { provide: RedisSocketStateService, useValue: mockRedisState },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    gateway = module.get<ConnectivityGateway>(ConnectivityGateway);
    (gateway as unknown as { server: unknown }).server = mockServer;
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleConnection', () => {
    it('should join the connectivities room', () => {
      const client = buildClient();
      gateway.handleConnection(client as unknown as Socket);
      expect(client.join).toHaveBeenCalledWith('connectivities');
    });

    it('should call addSocket and emit fetchData when query.id is present', async () => {
      const client = buildClient('s1', 'user-77');
      const result = { header: ['h'], body: ['b'] };
      mockConnectivityService.getAllConnectivities.mockResolvedValue(result);

      gateway.handleConnection(client as unknown as Socket);
      // Allow microtasks to execute
      await new Promise((r) => setTimeout(r, 10));

      expect(mockRedisState.set).toHaveBeenCalledWith('connectivities:s1', JSON.stringify({ s1: 'user-77' }));
      expect(mockConnectivityService.getAllConnectivities).toHaveBeenCalledWith('user-77');
      expect(client.emit).toHaveBeenCalledWith('fetchData', result);
    });

    it('should not call addSocket when query.id is absent', () => {
      const client = buildClient('s1');
      gateway.handleConnection(client as unknown as Socket);
      expect(mockRedisState.set).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should delete Redis key on disconnect', async () => {
      const client = buildClient('s-del');
      await gateway.handleDisconnect(client as unknown as Socket);
      expect(mockRedisState.del).toHaveBeenCalledWith('connectivities:s-del');
    });
  });

  describe('broadcastConnectivityUpdate', () => {
    it('should emit fetchData to all connected user sockets', async () => {
      const socketId = 's-broadcast';
      const userId = 'u-broadcast';

      mockRedisState.scan.mockResolvedValue([`connectivities:${socketId}`]);
      mockRedisState.get.mockResolvedValue(JSON.stringify({ [socketId]: userId }));
      mockServer.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([{ id: socketId }]),
      });

      const result = { header: [], body: [{ node: 'N1' }] };
      mockConnectivityService.getAllConnectivities.mockResolvedValue(result);
      mockConnectivityService.getFailedNodes.mockResolvedValue('');

      const emitMock = jest.fn();
      mockServer.to.mockReturnValue({ emit: emitMock });

      await gateway.broadcastConnectivityUpdate();

      expect(mockConnectivityService.getAllConnectivities).toHaveBeenCalledWith(userId);
      expect(emitMock).toHaveBeenCalledWith('fetchData', result);
    });

    it('should emit socket.connectivity.alert event when failed nodes exist', async () => {
      const socketId = 's-failed';
      const userId = 'u-failed';

      mockRedisState.scan.mockResolvedValue([`connectivities:${socketId}`]);
      mockRedisState.get.mockResolvedValue(JSON.stringify({ [socketId]: userId }));
      mockServer.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([{ id: socketId }]),
      });

      mockConnectivityService.getAllConnectivities.mockResolvedValue({ header: [], body: [] });
      mockConnectivityService.getFailedNodes.mockResolvedValue('NODE1,NODE2');

      await gateway.broadcastConnectivityUpdate();

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'socket.connectivity.alert',
        expect.objectContaining({ userId }),
      );
    });

    it('should not emit alert when getFailedNodes returns empty string', async () => {
      const socketId = 's-ok';
      const userId = 'u-ok';

      mockRedisState.scan.mockResolvedValue([`connectivities:${socketId}`]);
      mockRedisState.get.mockResolvedValue(JSON.stringify({ [socketId]: userId }));
      mockServer.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([{ id: socketId }]),
      });

      mockConnectivityService.getAllConnectivities.mockResolvedValue({ header: [], body: [] });
      mockConnectivityService.getFailedNodes.mockResolvedValue('');

      await gateway.broadcastConnectivityUpdate();

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
