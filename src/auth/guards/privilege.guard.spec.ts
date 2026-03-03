import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrivilegeGuard } from './privilege.guard';
import { CoreMinimumPrivileges } from '../../database/entities/core-minimum-privileges.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { ErrorMessages } from '../../shared/constants';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createMockContext(user: any, route = '/api/v1/users', method = 'GET'): ExecutionContext {
  const request = {
    user,
    route: { path: route },
    path: route,
    method,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

const VALID_USER = { id: 'user-1', email: 'test@test.com', credential: 'testuser', theme: 'light' };

// ─── Suite ─────────────────────────────────────────────────────────────────────

describe('PrivilegeGuard', () => {
  let guard: PrivilegeGuard;
  let minPrivRepo: any;
  let privilegesRepo: any;

  beforeEach(async () => {
    minPrivRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    privilegesRepo = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivilegeGuard,
        { provide: getRepositoryToken(CoreMinimumPrivileges), useValue: minPrivRepo },
        { provide: getRepositoryToken(CorePrivileges), useValue: privilegesRepo },
      ],
    }).compile();

    guard = module.get<PrivilegeGuard>(PrivilegeGuard);
  });

  // ─── onModuleInit / Cache ──────────────────────────────────────────────

  describe('onModuleInit (cache loading)', () => {
    it('should load all minimum privileges into cache at startup', async () => {
      const mockPrivileges = [
        { request: '/api/v1/users', method: 'GET', role: { name: 'user' }, moduleId: 1 },
        { request: '/api/v1/settings', method: 'POST', role: { name: 'admin' }, moduleId: 2 },
      ];
      minPrivRepo.find.mockResolvedValue(mockPrivileges);

      await guard.onModuleInit();

      expect(minPrivRepo.find).toHaveBeenCalledWith({ relations: { role: true } });
    });
  });

  // ─── canActivate ───────────────────────────────────────────────────────

  describe('canActivate', () => {
    it('should throw ForbiddenException when no user on request', async () => {
      await guard.onModuleInit();
      const ctx = createMockContext(null);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should allow through when route is not registered in minimum privileges', async () => {
      minPrivRepo.find.mockResolvedValue([]); // no rules
      await guard.onModuleInit();

      const ctx = createMockContext(VALID_USER, '/api/v1/unregistered', 'GET');
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow through when minPriv has no role requirement', async () => {
      minPrivRepo.find.mockResolvedValue([{ request: '/api/v1/users', method: 'GET', role: null, moduleId: null }]);
      await guard.onModuleInit();

      const ctx = createMockContext(VALID_USER, '/api/v1/users', 'GET');
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow when user has sufficient privilege', async () => {
      minPrivRepo.find.mockResolvedValue([
        { request: '/api/v1/users', method: 'GET', role: { name: 'user' }, moduleId: 1 },
      ]);
      await guard.onModuleInit();

      privilegesRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        moduleId: 1,
        role: { name: 'admin' },
      });

      const ctx = createMockContext(VALID_USER, '/api/v1/users', 'GET');
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should deny when user has insufficient privilege', async () => {
      minPrivRepo.find.mockResolvedValue([
        { request: '/api/v1/settings', method: 'POST', role: { name: 'admin' }, moduleId: 2 },
      ]);
      await guard.onModuleInit();

      privilegesRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        moduleId: 2,
        role: { name: 'user' },
      });

      const ctx = createMockContext(VALID_USER, '/api/v1/settings', 'POST');
      await expect(guard.canActivate(ctx)).rejects.toThrow(new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE));
    });

    it('should deny when user has no privilege record for the module', async () => {
      minPrivRepo.find.mockResolvedValue([
        { request: '/api/v1/users', method: 'GET', role: { name: 'user' }, moduleId: 1 },
      ]);
      await guard.onModuleInit();

      privilegesRepo.findOne.mockResolvedValue(null);

      const ctx = createMockContext(VALID_USER, '/api/v1/users', 'GET');
      await expect(guard.canActivate(ctx)).rejects.toThrow(new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE));
    });

    it('should query user privilege with correct moduleId and relations', async () => {
      minPrivRepo.find.mockResolvedValue([
        { request: '/api/v1/users', method: 'GET', role: { name: 'user' }, moduleId: 5 },
      ]);
      await guard.onModuleInit();

      privilegesRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        moduleId: 5,
        role: { name: 'admin' },
      });

      const ctx = createMockContext(VALID_USER, '/api/v1/users', 'GET');
      await guard.canActivate(ctx);

      expect(privilegesRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', moduleId: 5 },
        relations: { role: true },
      });
    });
  });
});
