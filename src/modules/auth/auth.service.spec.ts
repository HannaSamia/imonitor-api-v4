import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CoreApplicationRefreshToken } from '../../database/entities/core-application-refresh-token.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { PasswordService } from '../../shared/services/password.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants';

const mockUser = {
  id: 'user-1',
  userName: 'testuser',
  email: 'test@example.com',
  passwordHash: '$2b$10$hashedpassword',
  isLocked: false,
  allowMultipleSessions: true,
  theme: 'light',
  keepLogin: false,
};

const mockRefreshToken = {
  id: 'rt-1',
  jwtId: 'jwt-id-1',
  userId: 'user-1',
  used: false,
  invalidated: false,
  expiryDate: new Date(Date.now() + 86400000), // 1 day ahead
};

// Helper to create a mock QueryBuilder
function createMockQueryBuilder(result: any) {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getExists: jest.fn().mockResolvedValue(false),
  };
  return qb;
}

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: any;
  let rolesRepo: any;
  let refreshTokenRepo: any;
  let privilegesRepo: any;
  let modulesRepo: any;
  let jwtServiceMock: any;
  let passwordService: any;
  let dateHelper: any;
  let systemConfigService: any;

  beforeEach(async () => {
    usersRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    rolesRepo = {
      findOne: jest.fn(),
    };
    refreshTokenRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };
    privilegesRepo = {
      findOne: jest.fn(),
    };
    modulesRepo = {
      findOne: jest.fn(),
    };
    jwtServiceMock = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };
    passwordService = {
      isPasswordValid: jest.fn(),
      hashPassword: jest.fn(),
    };
    dateHelper = {
      currentDate: jest.fn().mockReturnValue(new Date('2026-03-02T12:00:00Z')),
      addDurationToDate: jest.fn().mockReturnValue(new Date('2026-03-09T12:00:00Z')),
    };
    systemConfigService = {
      getConfigValue: jest.fn().mockResolvedValue('30'),
      getConfigValues: jest.fn().mockResolvedValue({ tokenExpiryInMinutes: '30', rtokenExpiryInMinutes: '10080' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(CoreApplicationUsers), useValue: usersRepo },
        { provide: getRepositoryToken(CoreApplicationRoles), useValue: rolesRepo },
        { provide: getRepositoryToken(CoreApplicationRefreshToken), useValue: refreshTokenRepo },
        { provide: getRepositoryToken(CorePrivileges), useValue: privilegesRepo },
        { provide: getRepositoryToken(CoreModules), useValue: modulesRepo },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: PasswordService, useValue: passwordService },
        { provide: DateHelperService, useValue: dateHelper },
        { provide: SystemConfigService, useValue: systemConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const qb = createMockQueryBuilder(mockUser);
      usersRepo.createQueryBuilder.mockReturnValue(qb);
      passwordService.isPasswordValid.mockResolvedValue(true);

      // No active tokens
      const tokenQb = createMockQueryBuilder(null);
      tokenQb.getExists.mockResolvedValue(false);
      refreshTokenRepo.createQueryBuilder.mockReturnValue(tokenQb);

      const result = await service.login({ credential: 'testuser', password: 'password123' });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(jwtServiceMock.sign).toHaveBeenCalled();
      expect(usersRepo.update).toHaveBeenCalledWith('user-1', expect.objectContaining({ lastLogin: expect.any(Date) }));
    });

    it('should throw on invalid credentials (user not found)', async () => {
      const qb = createMockQueryBuilder(null);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.login({ credential: 'nonexistent', password: 'pass' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.INVALID_CREDENTIALS),
      );
    });

    it('should throw if account is locked', async () => {
      const lockedUser = { ...mockUser, isLocked: true };
      const qb = createMockQueryBuilder(lockedUser);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.login({ credential: 'testuser', password: 'pass' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.ACCOUNT_LOCKED),
      );
    });

    it('should throw on wrong password', async () => {
      const qb = createMockQueryBuilder(mockUser);
      usersRepo.createQueryBuilder.mockReturnValue(qb);
      passwordService.isPasswordValid.mockResolvedValue(false);

      await expect(service.login({ credential: 'testuser', password: 'wrongpass' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.INVALID_CREDENTIALS),
      );
    });

    it('should throw if multiple sessions not allowed and active token exists', async () => {
      const singleSessionUser = { ...mockUser, allowMultipleSessions: false };
      const qb = createMockQueryBuilder(singleSessionUser);
      usersRepo.createQueryBuilder.mockReturnValue(qb);
      passwordService.isPasswordValid.mockResolvedValue(true);

      const tokenQb = createMockQueryBuilder(null);
      tokenQb.getExists.mockResolvedValue(true);
      refreshTokenRepo.createQueryBuilder.mockReturnValue(tokenQb);

      await expect(service.login({ credential: 'testuser', password: 'password123' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.ONLY_ONE_SESSION_ALLOWED),
      );
    });
  });

  describe('logout', () => {
    it('should invalidate refresh token and update lastLogout', async () => {
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        email: 'test@example.com',
        credential: 'testuser',
        theme: 'light',
        jti: 'jwt-id-1',
      });

      refreshTokenRepo.findOne.mockResolvedValue(mockRefreshToken);

      await service.logout('some-jwt-token', 'user-1');

      expect(jwtServiceMock.verify).toHaveBeenCalledWith('some-jwt-token', { ignoreExpiration: true });
      expect(refreshTokenRepo.update).toHaveBeenCalledWith('rt-1', { invalidated: true });
      expect(usersRepo.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ lastLogout: expect.any(Date) }),
      );
    });

    it('should throw on invalid JWT', async () => {
      jwtServiceMock.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.logout('invalid.token.here', 'user-1')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should generate new tokens when keepLogin is true', async () => {
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        email: 'test@example.com',
        credential: 'testuser',
        theme: 'light',
        jti: 'jwt-id-1',
        exp: Math.floor(Date.now() / 1000) + 1800,
      });

      usersRepo.findOne.mockResolvedValue({ ...mockUser, keepLogin: true });
      refreshTokenRepo.findOne.mockResolvedValue(mockRefreshToken);

      const result = await service.refreshToken({ token: 'some-token', refreshToken: 'rt-1' });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw if refresh token is used', async () => {
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        email: 'test@example.com',
        credential: 'testuser',
        theme: 'light',
        jti: 'jwt-id-1',
        exp: Math.floor(Date.now() / 1000) - 10,
      });

      usersRepo.findOne.mockResolvedValue(mockUser);
      refreshTokenRepo.findOne.mockResolvedValue({ ...mockRefreshToken, used: true });

      await expect(service.refreshToken({ token: 'some-token', refreshToken: 'rt-1' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID),
      );
    });

    it('should throw if refresh token is invalidated', async () => {
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        email: 'test@example.com',
        credential: 'testuser',
        theme: 'light',
        jti: 'jwt-id-1',
        exp: Math.floor(Date.now() / 1000) - 10,
      });

      usersRepo.findOne.mockResolvedValue(mockUser);
      refreshTokenRepo.findOne.mockResolvedValue({ ...mockRefreshToken, invalidated: true });

      await expect(service.refreshToken({ token: 'some-token', refreshToken: 'rt-1' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID),
      );
    });

    it('should throw if refresh token is expired', async () => {
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        email: 'test@example.com',
        credential: 'testuser',
        theme: 'light',
        jti: 'jwt-id-1',
        exp: Math.floor(Date.now() / 1000) - 10,
      });

      usersRepo.findOne.mockResolvedValue(mockUser);
      refreshTokenRepo.findOne.mockResolvedValue({
        ...mockRefreshToken,
        expiryDate: new Date(Date.now() - 86400000), // 1 day ago — expired
      });

      await expect(service.refreshToken({ token: 'some-token', refreshToken: 'rt-1' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID),
      );
    });

    it('should throw if refresh token not found in DB (H-02 fix)', async () => {
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        email: 'test@example.com',
        credential: 'testuser',
        theme: 'light',
        jti: 'jwt-id-1',
      });

      usersRepo.findOne.mockResolvedValue(mockUser);
      refreshTokenRepo.findOne.mockResolvedValue(null);

      await expect(service.refreshToken({ token: 'some-token', refreshToken: 'nonexistent' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID),
      );
    });

    it('should throw if jwtId does not match refresh token jwtId', async () => {
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        email: 'test@example.com',
        credential: 'testuser',
        theme: 'light',
        jti: 'different-jwt-id',
      });

      usersRepo.findOne.mockResolvedValue(mockUser);
      refreshTokenRepo.findOne.mockResolvedValue(mockRefreshToken); // jwtId = 'jwt-id-1'

      await expect(service.refreshToken({ token: 'some-token', refreshToken: 'rt-1' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID),
      );
    });

    it('should throw TOKEN_HAS_NOT_EXPIRED_YET for non-keepLogin user with fresh token', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 1800; // 30min from now
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        email: 'test@example.com',
        credential: 'testuser',
        theme: 'light',
        jti: 'jwt-id-1',
        exp: futureExp,
      });

      usersRepo.findOne.mockResolvedValue({ ...mockUser, keepLogin: false });
      refreshTokenRepo.findOne.mockResolvedValue(mockRefreshToken);

      await expect(service.refreshToken({ token: 'some-token', refreshToken: 'rt-1' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.TOKEN_HAS_NOT_EXPIRED_YET),
      );
    });

    it('should allow refresh when non-keepLogin token is near expiry (within grace period)', async () => {
      const nearExpiry = Math.floor(Date.now() / 1000) + 30; // only 30s left
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        email: 'test@example.com',
        credential: 'testuser',
        theme: 'light',
        jti: 'jwt-id-1',
        exp: nearExpiry,
      });

      usersRepo.findOne.mockResolvedValue({ ...mockUser, keepLogin: false });
      refreshTokenRepo.findOne.mockResolvedValue(mockRefreshToken);

      const result = await service.refreshToken({ token: 'some-token', refreshToken: 'rt-1' });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(refreshTokenRepo.update).toHaveBeenCalledWith('rt-1', { used: true });
    });

    it('should throw if JWT verify fails entirely', async () => {
      jwtServiceMock.verify.mockImplementation(() => {
        throw new Error('bad token');
      });

      await expect(service.refreshToken({ token: 'bad-token', refreshToken: 'rt-1' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID),
      );
    });

    it('should throw if decoded JWT has no email', async () => {
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        jti: 'jwt-id-1',
      });

      await expect(service.refreshToken({ token: 'some-token', refreshToken: 'rt-1' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID),
      );
    });

    it('should throw if user not found by email', async () => {
      jwtServiceMock.verify.mockReturnValue({
        id: 'user-1',
        email: 'deleted@example.com',
        credential: 'testuser',
        theme: 'light',
        jti: 'jwt-id-1',
      });

      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.refreshToken({ token: 'some-token', refreshToken: 'rt-1' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.INVALID_CREDENTIALS),
      );
    });
  });

  describe('canAccessModule', () => {
    it('should pass when user has sufficient privilege', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'admin' });
      modulesRepo.findOne.mockResolvedValue({ id: '1', name: 'dashboard' });
      privilegesRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        moduleId: 1,
        role: { name: 'admin' },
      });

      await expect(service.canAccessModule('user-1', { role: 'user', module: 'dashboard' })).resolves.toBeUndefined();
    });

    it('should throw if role does not exist', async () => {
      rolesRepo.findOne.mockResolvedValue(null);
      modulesRepo.findOne.mockResolvedValue({ id: '1', name: 'dashboard' });

      await expect(service.canAccessModule('user-1', { role: 'nonexistent', module: 'dashboard' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.ROLE_NOT_FOUND),
      );
    });

    it('should throw if module does not exist', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'admin' });
      modulesRepo.findOne.mockResolvedValue(null);

      await expect(service.canAccessModule('user-1', { role: 'admin', module: 'nonexistent' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.MODULE_NOT_FOUND),
      );
    });

    it('should throw if user lacks required privilege', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'admin' });
      modulesRepo.findOne.mockResolvedValue({ id: '1', name: 'dashboard' });
      privilegesRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        moduleId: 1,
        role: { name: 'user' },
      });

      await expect(service.canAccessModule('user-1', { role: 'admin', module: 'dashboard' })).rejects.toThrow(
        new BadRequestException(ErrorMessages.UNAUTHORIZED_ROLE),
      );
    });
  });
});
