import { ConfigService } from '@nestjs/config';
import { RateLimiterMiddleware } from './rate-limiter.middleware';

// ─── Mock rate-limiter-flexible ──────────────────────────────────────────────

const mockConsume = jest.fn();
const mockPoints = 200;

jest.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: jest.fn().mockImplementation(() => ({
    consume: mockConsume,
    points: mockPoints,
  })),
  RateLimiterMemory: jest.fn().mockImplementation(() => ({})),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockReqResNext(ip = '192.168.1.1') {
  const req = { ip } as any;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
  const next = jest.fn();
  return { req, res, next };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('RateLimiterMiddleware', () => {
  let middleware: RateLimiterMiddleware;
  let dataSource: any;

  beforeEach(() => {
    mockConsume.mockReset();

    const redisClient = {} as any;
    dataSource = { query: jest.fn().mockResolvedValue(undefined) };
    const configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal: any) => defaultVal),
    } as unknown as ConfigService;

    middleware = new RateLimiterMiddleware(redisClient, dataSource, configService);
  });

  it('should call next() when rate limit not exceeded', async () => {
    mockConsume.mockResolvedValue({ consumedPoints: 1 });
    const { req, res, next } = createMockReqResNext();

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 429 when rate limit exceeded', async () => {
    mockConsume.mockRejectedValue({ consumedPoints: 201 });
    const { req, res, next } = createMockReqResNext();

    await middleware.use(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 429,
      message: 'Too Many Requests',
    });
  });

  it('should log IP to database on first excess (consumedPoints === points+1)', async () => {
    mockConsume.mockRejectedValue({ consumedPoints: mockPoints + 1 });
    const { req, res, next } = createMockReqResNext('10.0.0.1');

    await middleware.use(req, res, next);

    expect(dataSource.query).toHaveBeenCalledWith('INSERT INTO core_rate_limiter (ipAddress) VALUES (?)', ['10.0.0.1']);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('should NOT log IP to database on subsequent excess', async () => {
    mockConsume.mockRejectedValue({ consumedPoints: mockPoints + 5 });
    const { req, res, next } = createMockReqResNext();

    await middleware.use(req, res, next);

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('should still return 429 even if DB logging fails', async () => {
    mockConsume.mockRejectedValue({ consumedPoints: mockPoints + 1 });
    dataSource.query.mockRejectedValue(new Error('DB down'));
    const { req, res, next } = createMockReqResNext();

    await middleware.use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('should strip IPv6 prefix from IP', async () => {
    mockConsume.mockResolvedValue({ consumedPoints: 1 });
    const { req, res, next } = createMockReqResNext('::ffff:192.168.1.1');

    await middleware.use(req, res, next);

    expect(mockConsume).toHaveBeenCalledWith('192.168.1.1');
    expect(next).toHaveBeenCalled();
  });

  it('should handle empty IP gracefully', async () => {
    mockConsume.mockResolvedValue({ consumedPoints: 1 });
    const { req, res, next } = createMockReqResNext('');

    await middleware.use(req, res, next);

    expect(mockConsume).toHaveBeenCalledWith('');
    expect(next).toHaveBeenCalled();
  });
});
