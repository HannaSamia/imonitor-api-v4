import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { RequestFilterMiddleware } from './request-filter.middleware';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createMockReqResNext(url: string) {
  const req = { originalUrl: url, ip: '192.168.1.1', method: 'GET', headers: { 'user-agent': 'test' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req: req as any, res: res as any, next };
}

// ─── Suite ─────────────────────────────────────────────────────────────────────

describe('RequestFilterMiddleware', () => {
  let middleware: RequestFilterMiddleware;
  let dataSource: any;

  beforeEach(async () => {
    dataSource = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RequestFilterMiddleware, { provide: DataSource, useValue: dataSource }],
    }).compile();

    middleware = module.get<RequestFilterMiddleware>(RequestFilterMiddleware);
  });

  // ─── Legitimate requests ───────────────────────────────────────────────

  describe('legitimate requests', () => {
    it('should allow normal API requests through', async () => {
      const { req, res, next } = createMockReqResNext('/api/v1/users');
      await middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow requests with query parameters', async () => {
      const { req, res, next } = createMockReqResNext('/api/v1/users?page=1&limit=10');
      await middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  // ─── Directory traversal attacks ───────────────────────────────────────

  describe('directory traversal detection', () => {
    it('should block %2e%2e (URL-encoded ..)', async () => {
      const { req, res, next } = createMockReqResNext('/api/%2e%2e/etc/passwd');
      await middleware.use(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should block %c0%ae (overlong UTF-8 encoded .)', async () => {
      const { req, res, next } = createMockReqResNext('/api/%c0%ae%c0%ae/etc/passwd');
      await middleware.use(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should block %e0%80%ae (3-byte overlong UTF-8)', async () => {
      const { req, res, next } = createMockReqResNext('/api/%e0%80%ae/etc/shadow');
      await middleware.use(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should block .% pattern', async () => {
      const { req, res, next } = createMockReqResNext('/api/test.%00');
      await middleware.use(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ─── CGI probing ───────────────────────────────────────────────────────

  describe('CGI probing detection', () => {
    it('should block cgi-bin requests', async () => {
      const { req, res, next } = createMockReqResNext('/cgi-bin/admin.pl');
      await middleware.use(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ─── Malformed URI ─────────────────────────────────────────────────────

  describe('malformed URI handling', () => {
    it('should block requests with invalid URI encoding', async () => {
      const { req, res, next } = createMockReqResNext('/%E0%A4%A');
      await middleware.use(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ─── Database logging ──────────────────────────────────────────────────

  describe('malicious request logging', () => {
    it('should log suspicious requests to database', async () => {
      const { req, res, next } = createMockReqResNext('/cgi-bin/test');
      await middleware.use(req, res, next);
      expect(dataSource.query).toHaveBeenCalledWith(
        'INSERT INTO core_malicious_requests (ipAddress, method, headers, endpoint) VALUES (?, ?, ?, ?)',
        ['192.168.1.1', 'GET', expect.any(String), '/cgi-bin/test'],
      );
    });

    it('should still block even if database logging fails', async () => {
      dataSource.query.mockRejectedValue(new Error('DB down'));
      const { req, res, next } = createMockReqResNext('/cgi-bin/test');
      await middleware.use(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
