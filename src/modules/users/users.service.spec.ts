import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserPrivilegesService } from './user-privileges.service';
import { CoreApplicationUsers, UserTheme } from '../../database/entities/core-application-users.entity';
import { PasswordService } from '../../shared/services/password.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants';

function createMockQueryBuilder(result: any) {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(result),
    getExists: jest.fn().mockResolvedValue(false),
  };
  return qb;
}

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: any;
  let passwordService: any;
  let dateHelper: any;
  let userPrivilegesService: any;

  beforeEach(async () => {
    usersRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      manager: {
        transaction: jest.fn().mockImplementation(async (cb) => {
          const mockManager = {
            create: jest.fn().mockImplementation((_entity, data) => data),
            save: jest.fn().mockResolvedValue({}),
          };
          return cb(mockManager);
        }),
      },
    };
    passwordService = {
      hashPassword: jest.fn().mockResolvedValue('$2b$10$hashed'),
      isPasswordValid: jest.fn(),
    };
    dateHelper = {
      currentDate: jest.fn().mockReturnValue(new Date('2026-03-02T12:00:00Z')),
    };
    userPrivilegesService = {
      assignDefaultPrivileges: jest.fn().mockResolvedValue(undefined),
      getUserPrivileges: jest.fn(),
      updateUserPrivileges: jest.fn(),
      getSideMenu: jest.fn(),
      getUserRoleOnModule: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(CoreApplicationUsers), useValue: usersRepo },
        { provide: PasswordService, useValue: passwordService },
        { provide: DateHelperService, useValue: dateHelper },
        { provide: UserPrivilegesService, useValue: userPrivilegesService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('register', () => {
    const createUserDto = {
      firstName: 'John',
      lastName: 'Doe',
      userName: 'johndoe',
      email: 'john@example.com',
      password: 'password123',
      phoneNumber: '1234567890',
      allowMultipleSessions: true,
      keepLogin: false,
    };

    it('should register a new user successfully', async () => {
      const qb = createMockQueryBuilder(null);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.register(createUserDto, 'admin-1');

      expect(result).toHaveProperty('id');
      expect(result.firstName).toBe('John');
      expect(result.email).toBe('john@example.com');
      expect(usersRepo.manager.transaction).toHaveBeenCalled();
      expect(userPrivilegesService.assignDefaultPrivileges).toHaveBeenCalled();
    });

    it('should throw if user already exists', async () => {
      const qb = createMockQueryBuilder({ id: 'existing-user' });
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.register(createUserDto, 'admin-1')).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_ALREADY_EXISTS),
      );
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        userName: 'johndoe',
        email: 'john@example.com',
        phoneNumber: '123',
        theme: 'light',
      });

      const result = await service.getUserById('user-1');

      expect(result.id).toBe('user-1');
      expect(result.firstName).toBe('John');
    });

    it('should throw if user not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.getUserById('nonexistent')).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_NOT_FOUND),
      );
    });
  });

  describe('getAll', () => {
    it('should return all users', async () => {
      const users = [
        {
          id: 'u1',
          firstName: 'A',
          lastName: 'B',
          userName: 'ab',
          email: 'a@b.com',
          phoneNumber: '1',
          isLocked: false,
          keepLogin: false,
          allowMultipleSessions: true,
        },
        {
          id: 'u2',
          firstName: 'C',
          lastName: 'D',
          userName: 'cd',
          email: 'c@d.com',
          phoneNumber: '2',
          isLocked: true,
          keepLogin: true,
          allowMultipleSessions: false,
        },
      ];
      const qb = createMockQueryBuilder(users);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].options?.isLocked).toBe(false);
      expect(result[1].options?.isLocked).toBe(true);
    });

    it('should exclude current user when requested', async () => {
      const qb = createMockQueryBuilder([]);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAll(true, 'current-user-id');

      expect(qb.andWhere).toHaveBeenCalledWith('u.id <> :currentUserId', { currentUserId: 'current-user-id' });
    });
  });

  describe('delete', () => {
    it('should soft delete user with audit trail', async () => {
      await service.delete('admin-1', 'user-1');

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', {
        isDeleted: true,
        deletedBy: 'admin-1',
        deletedOn: expect.any(Date),
        modifiedBy: 'admin-1',
        modifiedOn: expect.any(Date),
      });
    });
  });

  describe('lock/unlock', () => {
    it('should lock a user', async () => {
      await service.lock('admin-1', 'user-1');

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', {
        isLocked: true,
        modifiedBy: 'admin-1',
        modifiedOn: expect.any(Date),
      });
    });

    it('should unlock a user', async () => {
      await service.unlock('admin-1', 'user-1');

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', {
        isLocked: false,
        modifiedBy: 'admin-1',
        modifiedOn: expect.any(Date),
      });
    });
  });

  describe('themeUpdate', () => {
    it('should update user theme', async () => {
      await service.themeUpdate('user-1', UserTheme.DARK);

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', { theme: UserTheme.DARK });
    });
  });

  // ─── selfUpdate ─────────────────────────────────────────────────────

  describe('selfUpdate', () => {
    const editSelfDto = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      phoneNumber: '5551234',
    };

    it('should update own profile when email is unique', async () => {
      const qb = createMockQueryBuilder(null);
      qb.getExists.mockResolvedValue(false);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await service.selfUpdate('user-1', editSelfDto);

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', {
        firstName: 'Jane',
        lastName: 'Smith',
        phoneNumber: '5551234',
        email: 'jane@example.com',
        modifiedOn: expect.any(Date),
      });
    });

    it('should throw if email already taken by another user', async () => {
      const qb = createMockQueryBuilder(null);
      qb.getExists.mockResolvedValue(true);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.selfUpdate('user-1', editSelfDto)).rejects.toThrow(
        new BadRequestException(ErrorMessages.EMAIL_ALREADY_EXISTS),
      );
    });
  });

  // ─── update (admin) ─────────────────────────────────────────────────

  describe('update', () => {
    const updateDto = {
      id: 'user-2',
      firstName: 'Updated',
      lastName: 'User',
      email: 'updated@example.com',
      phoneNumber: '5559999',
      allowMultipleSessions: true,
      keepLogin: false,
    };

    it('should update another user when email is unique', async () => {
      const qb = createMockQueryBuilder(null);
      qb.getExists.mockResolvedValue(false);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await service.update('user-2', 'admin-1', updateDto);

      expect(usersRepo.update).toHaveBeenCalledWith('user-2', {
        firstName: 'Updated',
        lastName: 'User',
        phoneNumber: '5559999',
        email: 'updated@example.com',
        allowMultipleSessions: true,
        keepLogin: false,
        modifiedBy: 'admin-1',
        modifiedOn: expect.any(Date),
      });
    });

    it('should throw if email already taken by another user', async () => {
      const qb = createMockQueryBuilder(null);
      qb.getExists.mockResolvedValue(true);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.update('user-2', 'admin-1', updateDto)).rejects.toThrow(
        new BadRequestException(ErrorMessages.EMAIL_ALREADY_EXISTS),
      );
    });
  });

  // ─── getEmails ──────────────────────────────────────────────────────

  describe('getEmails', () => {
    it('should return list of emails for active users', async () => {
      usersRepo.find.mockResolvedValue([
        { email: 'a@test.com' },
        { email: 'b@test.com' },
        { email: null },
        { email: '' },
      ]);

      const result = await service.getEmails();

      expect(result).toEqual(['a@test.com', 'b@test.com']);
    });

    it('should return empty array when no users', async () => {
      usersRepo.find.mockResolvedValue([]);

      const result = await service.getEmails();

      expect(result).toEqual([]);
    });

    it('should query with correct params', async () => {
      usersRepo.find.mockResolvedValue([]);

      await service.getEmails();

      expect(usersRepo.find).toHaveBeenCalledWith({
        where: { isDeleted: false },
        select: { email: true },
        order: { firstName: 'ASC' },
      });
    });
  });
});
