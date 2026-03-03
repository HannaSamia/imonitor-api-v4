import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserPasswordService } from './user-password.service';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRefreshToken } from '../../database/entities/core-application-refresh-token.entity';
import { PasswordService } from '../../shared/services/password.service';
import { ErrorMessages } from '../../shared/constants';
import { ChangePasswordDto } from './dto';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = 'user-current-1';
const TARGET_USER_ID = 'user-target-2';
const HASHED_PASSWORD = '$2b$10$hashedOldPassword';
const NEW_HASH = '$2b$10$hashedNewPassword';

const mockUserWithHash: Partial<CoreApplicationUsers> = {
  id: CURRENT_USER_ID,
  passwordHash: HASHED_PASSWORD,
};

const mockTargetUser: Partial<CoreApplicationUsers> = {
  id: TARGET_USER_ID,
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
};

const validChangePasswordDto: ChangePasswordDto = {
  password: 'NewPassword1',
  confirmPassword: 'NewPassword1',
  oldPassword: 'OldPassword1',
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('UserPasswordService', () => {
  let service: UserPasswordService;
  let usersRepo: any;
  let refreshTokenRepo: any;
  let passwordService: any;
  let eventEmitter: any;

  beforeEach(async () => {
    usersRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    refreshTokenRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    passwordService = {
      hashPassword: jest.fn().mockResolvedValue(NEW_HASH),
      isPasswordValid: jest.fn(),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPasswordService,
        { provide: getRepositoryToken(CoreApplicationUsers), useValue: usersRepo },
        { provide: getRepositoryToken(CoreApplicationRefreshToken), useValue: refreshTokenRepo },
        { provide: PasswordService, useValue: passwordService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<UserPasswordService>(UserPasswordService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── changePassword ──────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('should change password successfully with valid inputs', async () => {
      usersRepo.findOne.mockResolvedValue(mockUserWithHash);
      passwordService.isPasswordValid.mockResolvedValue(true);

      await service.changePassword(CURRENT_USER_ID, validChangePasswordDto);

      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { id: CURRENT_USER_ID },
        select: { id: true, passwordHash: true },
      });
      expect(passwordService.isPasswordValid).toHaveBeenCalledWith(validChangePasswordDto.oldPassword, HASHED_PASSWORD);
      expect(passwordService.hashPassword).toHaveBeenCalledWith(validChangePasswordDto.password);
      expect(usersRepo.update).toHaveBeenCalledWith(CURRENT_USER_ID, { passwordHash: NEW_HASH });
    });

    it('should throw BadRequestException when new password and confirmPassword do not match', async () => {
      const mismatchedDto: ChangePasswordDto = {
        password: 'NewPassword1',
        confirmPassword: 'DifferentPassword2',
        oldPassword: 'OldPassword1',
      };

      await expect(service.changePassword(CURRENT_USER_ID, mismatchedDto)).rejects.toThrow(
        new BadRequestException(ErrorMessages.PASSWORD_MISMATCH),
      );

      // Guard fires before any DB call
      expect(usersRepo.findOne).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user is not found in the database', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.changePassword(CURRENT_USER_ID, validChangePasswordDto)).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_NOT_FOUND),
      );

      expect(passwordService.isPasswordValid).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user has no passwordHash stored', async () => {
      usersRepo.findOne.mockResolvedValue({ id: CURRENT_USER_ID, passwordHash: null });

      await expect(service.changePassword(CURRENT_USER_ID, validChangePasswordDto)).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_NOT_FOUND),
      );
    });

    it('should throw BadRequestException when old password is incorrect', async () => {
      usersRepo.findOne.mockResolvedValue(mockUserWithHash);
      passwordService.isPasswordValid.mockResolvedValue(false);

      await expect(service.changePassword(CURRENT_USER_ID, validChangePasswordDto)).rejects.toThrow(
        new BadRequestException(ErrorMessages.WRONG_PASSWORD),
      );

      expect(usersRepo.update).not.toHaveBeenCalled();
    });

    it('should invalidate all active refresh tokens for the user after a successful password change', async () => {
      usersRepo.findOne.mockResolvedValue(mockUserWithHash);
      passwordService.isPasswordValid.mockResolvedValue(true);

      await service.changePassword(CURRENT_USER_ID, validChangePasswordDto);

      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { userId: CURRENT_USER_ID, invalidated: false, used: false },
        { invalidated: true },
      );
    });

    it('should update the password hash before invalidating refresh tokens', async () => {
      const callOrder: string[] = [];
      usersRepo.findOne.mockResolvedValue(mockUserWithHash);
      passwordService.isPasswordValid.mockResolvedValue(true);
      usersRepo.update.mockImplementation(async () => {
        callOrder.push('usersRepo.update');
        return { affected: 1 };
      });
      refreshTokenRepo.update.mockImplementation(async () => {
        callOrder.push('refreshTokenRepo.update');
        return { affected: 1 };
      });

      await service.changePassword(CURRENT_USER_ID, validChangePasswordDto);

      expect(callOrder).toEqual(['usersRepo.update', 'refreshTokenRepo.update']);
    });
  });

  // ─── resetPassword ───────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should reset password successfully for a valid target user', async () => {
      usersRepo.findOne.mockResolvedValue(mockTargetUser);

      await service.resetPassword(CURRENT_USER_ID, TARGET_USER_ID);

      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { id: TARGET_USER_ID },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      expect(passwordService.hashPassword).toHaveBeenCalledWith(expect.any(String));
      expect(usersRepo.update).toHaveBeenCalledWith(TARGET_USER_ID, { passwordHash: NEW_HASH });
    });

    it('should throw BadRequestException when the target user is not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.resetPassword(CURRENT_USER_ID, 'nonexistent-id')).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_NOT_FOUND),
      );

      expect(passwordService.hashPassword).not.toHaveBeenCalled();
      expect(usersRepo.update).not.toHaveBeenCalled();
    });

    it('should invalidate all active refresh tokens for the target user after reset', async () => {
      usersRepo.findOne.mockResolvedValue(mockTargetUser);

      await service.resetPassword(CURRENT_USER_ID, TARGET_USER_ID);

      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { userId: TARGET_USER_ID, invalidated: false, used: false },
        { invalidated: true },
      );
    });

    it('should emit user.password.reset event with the correct payload (no plaintext password)', async () => {
      usersRepo.findOne.mockResolvedValue(mockTargetUser);

      await service.resetPassword(CURRENT_USER_ID, TARGET_USER_ID);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.password.reset',
        expect.objectContaining({
          userId: TARGET_USER_ID,
          email: mockTargetUser.email,
          firstName: mockTargetUser.firstName,
          lastName: mockTargetUser.lastName,
        }),
      );
    });

    it('should NOT include plaintext password in the reset event (SC-02 security fix)', async () => {
      usersRepo.findOne.mockResolvedValue(mockTargetUser);
      let capturedPayload: any;
      eventEmitter.emit.mockImplementation((_event: string, payload: any) => {
        capturedPayload = payload;
      });

      await service.resetPassword(CURRENT_USER_ID, TARGET_USER_ID);

      expect(capturedPayload).not.toHaveProperty('newPassword');
    });

    it('should not emit the reset event when the target user does not exist', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.resetPassword(CURRENT_USER_ID, 'ghost-id')).rejects.toThrow(BadRequestException);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
