import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter } from 'events';
import { RedisSocketStateService } from './redis-socket-state.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

describe('RedisSocketStateService', () => {
  let service: RedisSocketStateService;

  const mockRedis = {
    lrange: jest.fn(),
    rpush: jest.fn(),
    del: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    scanStream: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisSocketStateService, { provide: REDIS_CLIENT, useValue: mockRedis }],
    }).compile();

    service = module.get<RedisSocketStateService>(RedisSocketStateService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('lrange', () => {
    it('should call redis.lrange with correct args and return result', async () => {
      mockRedis.lrange.mockResolvedValue(['a', 'b']);
      const result = await service.lrange('mykey', 0, -1);
      expect(mockRedis.lrange).toHaveBeenCalledWith('mykey', 0, -1);
      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('rpush', () => {
    it('should call redis.rpush with correct args', async () => {
      mockRedis.rpush.mockResolvedValue(1);
      await service.rpush('mylist', 'value');
      expect(mockRedis.rpush).toHaveBeenCalledWith('mylist', 'value');
    });
  });

  describe('del', () => {
    it('should call redis.del with the given key', async () => {
      mockRedis.del.mockResolvedValue(1);
      await service.del('mykey');
      expect(mockRedis.del).toHaveBeenCalledWith('mykey');
    });
  });

  describe('set', () => {
    it('should call redis.set with key and value', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await service.set('mykey', 'myvalue');
      expect(mockRedis.set).toHaveBeenCalledWith('mykey', 'myvalue');
    });
  });

  describe('get', () => {
    it('should call redis.get and return the value', async () => {
      mockRedis.get.mockResolvedValue('stored-value');
      const result = await service.get('mykey');
      expect(mockRedis.get).toHaveBeenCalledWith('mykey');
      expect(result).toBe('stored-value');
    });

    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('scan', () => {
    it('should return all keys from scan stream', async () => {
      const stream = new EventEmitter();
      mockRedis.scanStream.mockReturnValue(stream);

      const promise = service.scan('prefix:*');

      // Emit batches of keys then end
      stream.emit('data', ['prefix:1', 'prefix:2']);
      stream.emit('data', ['prefix:3']);
      stream.emit('end');

      const keys = await promise;
      expect(keys).toEqual(['prefix:1', 'prefix:2', 'prefix:3']);
      expect(mockRedis.scanStream).toHaveBeenCalledWith({ match: 'prefix:*', count: 100 });
    });

    it('should reject when stream emits an error', async () => {
      const stream = new EventEmitter();
      mockRedis.scanStream.mockReturnValue(stream);

      const promise = service.scan('prefix:*');
      stream.emit('error', new Error('Redis scan failed'));

      await expect(promise).rejects.toThrow('Redis scan failed');
    });
  });
});
