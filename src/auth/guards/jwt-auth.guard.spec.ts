import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ErrorMessages } from '../../shared/constants';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createMockContext(
  headers: Record<string, string> = {},
  overrides: Record<string, any> = {},
): ExecutionContext {
  const request = { headers, user: undefined, ...overrides };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

const VALID_PAYLOAD = {
  id: 'user-1',
  email: 'test@example.com',
  credential: 'testuser',
  theme: 'light',
  keepLogin: false,
  iat: Math.floor(Date.now() / 1000),
};

// ─── Suite ─────────────────────────────────────────────────────────────────────

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: any;
  let reflector: any;

  beforeEach(async () => {
    jwtService = {
      verify: jest.fn(),
    };
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: jwtService },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  // ─── Public routes ─────────────────────────────────────────────────────

  describe('public routes (@Public decorator)', () => {
    it('should allow access without token on public routes', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const ctx = createMockContext({});
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow access even with invalid token on public routes', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const ctx = createMockContext({ authorization: 'Bearer garbage' });
      expect(await guard.canActivate(ctx)).toBe(true);
    });
  });

  // ─── Token extraction ──────────────────────────────────────────────────

  describe('token extraction', () => {
    it('should reject when no Authorization header is present', async () => {
      const ctx = createMockContext({});
      await expect(guard.canActivate(ctx)).rejects.toThrow(new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID));
    });

    it('should reject when Authorization is not Bearer scheme', async () => {
      const ctx = createMockContext({ authorization: 'Basic abc123' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject when Bearer token is empty', async () => {
      const ctx = createMockContext({ authorization: 'Bearer ' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Valid tokens ──────────────────────────────────────────────────────

  describe('valid token verification', () => {
    it('should accept valid JWT and attach payload to request.user', async () => {
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);
      const ctx = createMockContext({ authorization: 'Bearer valid.jwt.token' });

      expect(await guard.canActivate(ctx)).toBe(true);
      expect(ctx.switchToHttp().getRequest().user).toEqual(VALID_PAYLOAD);
    });

    it('should call jwtService.verify with clockTolerance', async () => {
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);
      const ctx = createMockContext({ authorization: 'Bearer my.jwt.token' });

      await guard.canActivate(ctx);
      expect(jwtService.verify).toHaveBeenCalledWith('my.jwt.token', { clockTolerance: 60 });
    });
  });

  // ─── Invalid tokens ───────────────────────────────────────────────────

  describe('invalid token handling', () => {
    it('should reject token with invalid signature', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      const ctx = createMockContext({ authorization: 'Bearer tampered.jwt.token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject malformed tokens', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });
      const ctx = createMockContext({ authorization: 'Bearer not-a-jwt' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Expired token + keepLogin ─────────────────────────────────────────

  describe('expired token handling', () => {
    function makeExpiredError(): Error {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      return err;
    }

    it('should reject expired token when keepLogin is false', async () => {
      jwtService.verify
        .mockImplementationOnce(() => {
          throw makeExpiredError();
        })
        .mockReturnValueOnce({ ...VALID_PAYLOAD, keepLogin: false });

      const ctx = createMockContext({ authorization: 'Bearer expired.jwt.token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should accept expired token when keepLogin is true and within 30-day limit', async () => {
      const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
      jwtService.verify
        .mockImplementationOnce(() => {
          throw makeExpiredError();
        })
        .mockReturnValueOnce({ ...VALID_PAYLOAD, keepLogin: true, iat: oneDayAgo });

      const ctx = createMockContext({ authorization: 'Bearer expired.jwt.token' });
      expect(await guard.canActivate(ctx)).toBe(true);
      expect(ctx.switchToHttp().getRequest().user).toBeDefined();
    });

    it('should reject expired keepLogin token beyond 30-day maximum (SC-01 fix)', async () => {
      const thirtyOneDaysAgo = Math.floor(Date.now() / 1000) - 31 * 24 * 60 * 60;
      jwtService.verify
        .mockImplementationOnce(() => {
          throw makeExpiredError();
        })
        .mockReturnValueOnce({ ...VALID_PAYLOAD, keepLogin: true, iat: thirtyOneDaysAgo });

      const ctx = createMockContext({ authorization: 'Bearer old.jwt.token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should accept expired keepLogin token at exactly 30 days', async () => {
      const exactlyThirtyDays = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
      jwtService.verify
        .mockImplementationOnce(() => {
          throw makeExpiredError();
        })
        .mockReturnValueOnce({ ...VALID_PAYLOAD, keepLogin: true, iat: exactlyThirtyDays });

      const ctx = createMockContext({ authorization: 'Bearer borderline.jwt.token' });
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should reject expired token when payload has no id', async () => {
      jwtService.verify
        .mockImplementationOnce(() => {
          throw makeExpiredError();
        })
        .mockReturnValueOnce({ keepLogin: true, iat: Math.floor(Date.now() / 1000) });

      const ctx = createMockContext({ authorization: 'Bearer noid.jwt.token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject when ignoreExpiration verify also fails', async () => {
      jwtService.verify
        .mockImplementationOnce(() => {
          throw makeExpiredError();
        })
        .mockImplementationOnce(() => {
          throw new Error('bad signature');
        });

      const ctx = createMockContext({ authorization: 'Bearer doubly-bad.token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should accept keepLogin token with missing iat (skips lifetime check)', async () => {
      jwtService.verify
        .mockImplementationOnce(() => {
          throw makeExpiredError();
        })
        .mockReturnValueOnce({ id: 'user-1', keepLogin: true });

      const ctx = createMockContext({ authorization: 'Bearer no-iat.token' });
      expect(await guard.canActivate(ctx)).toBe(true);
    });
  });
});
