import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { ErrorMessages } from '../../shared/constants';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createMockContext(user: any): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

const VALID_USER = { id: 'user-1', email: 'test@test.com', credential: 'testuser', theme: 'light' };

// ─── Suite ─────────────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: any;
  let privilegesRepo: any;
  let modulesRepo: any;

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    privilegesRepo = {
      findOne: jest.fn(),
    };
    modulesRepo = {
      find: jest.fn().mockResolvedValue([
        { id: '1', name: 'settings' },
        { id: '2', name: 'dashboard' },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        { provide: Reflector, useValue: reflector },
        { provide: getRepositoryToken(CorePrivileges), useValue: privilegesRepo },
        { provide: getRepositoryToken(CoreModules), useValue: modulesRepo },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    await guard.onModuleInit(); // load module cache
  });

  describe('onModuleInit (cache loading)', () => {
    it('should load all modules into cache at startup', () => {
      expect(modulesRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('canActivate', () => {
    it('should allow through when no @Roles() decorator is present', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(null).mockReturnValueOnce(null);
      const ctx = createMockContext(VALID_USER);
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should throw when @Roles() is present but @ModuleName() is missing', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce([AvailableRoles.ADMIN]) // @Roles
        .mockReturnValueOnce(null); // @ModuleName missing
      const ctx = createMockContext(VALID_USER);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should throw when no user on request', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce([AvailableRoles.ADMIN]).mockReturnValueOnce('settings');
      const ctx = createMockContext(null);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should throw when module not found in cache', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce([AvailableRoles.ADMIN]).mockReturnValueOnce('nonexistent');
      const ctx = createMockContext(VALID_USER);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should allow when user role matches required role', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce([AvailableRoles.ADMIN, AvailableRoles.SUPER_ADMIN])
        .mockReturnValueOnce('settings');

      privilegesRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        moduleId: 1,
        role: { name: AvailableRoles.ADMIN },
      });

      const ctx = createMockContext(VALID_USER);
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should deny when user role does not match required roles', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce([AvailableRoles.ADMIN, AvailableRoles.SUPER_ADMIN])
        .mockReturnValueOnce('settings');

      privilegesRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        moduleId: 1,
        role: { name: AvailableRoles.USER },
      });

      const ctx = createMockContext(VALID_USER);
      await expect(guard.canActivate(ctx)).rejects.toThrow(new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE));
    });

    it('should deny when user has no privilege record for the module', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce([AvailableRoles.ADMIN]).mockReturnValueOnce('settings');

      privilegesRepo.findOne.mockResolvedValue(null);

      const ctx = createMockContext(VALID_USER);
      await expect(guard.canActivate(ctx)).rejects.toThrow(new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE));
    });

    it('should query privilege with correct moduleId and relations', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce([AvailableRoles.ADMIN]).mockReturnValueOnce('dashboard');

      privilegesRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        moduleId: 2,
        role: { name: AvailableRoles.ADMIN },
      });

      const ctx = createMockContext(VALID_USER);
      await guard.canActivate(ctx);

      expect(privilegesRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', moduleId: 2 },
        relations: { role: true },
      });
    });
  });
});
