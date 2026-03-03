import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CoreApplicationUsers, UserTheme } from '../../database/entities/core-application-users.entity';
import { PasswordService } from '../../shared/services/password.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants';
import { UserPrivilegesService } from './user-privileges.service';
import { CreateUserDto, UpdateUserDto, EditSelfDto, UserResponseDto } from './dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(CoreApplicationUsers)
    private readonly usersRepo: Repository<CoreApplicationUsers>,
    private readonly passwordService: PasswordService,
    private readonly dateHelper: DateHelperService,
    private readonly userPrivilegesService: UserPrivilegesService,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────

  async register(body: CreateUserDto, currentUserId: string): Promise<UserResponseDto> {
    const { firstName, lastName, userName, email, password, phoneNumber, allowMultipleSessions, keepLogin } = body;

    // Check user doesn't already exist (by userName, email, or phoneNumber)
    const existingUser = await this.usersRepo
      .createQueryBuilder('u')
      .where(
        '(u.userName = :userName OR u.email = :email OR u.phoneNumber = :phoneNumber) AND u.isDeleted = :deleted',
        {
          userName,
          email,
          phoneNumber,
          deleted: false,
        },
      )
      .getOne();

    if (existingUser) {
      throw new BadRequestException(ErrorMessages.USER_ALREADY_EXISTS);
    }

    // Hash password
    const passwordHash = await this.passwordService.hashPassword(password);

    // Create user + assign privileges in a transaction (H-07 fix)
    const userId = uuidv4();
    const now = this.dateHelper.currentDate();

    await this.usersRepo.manager.transaction(async (manager) => {
      const user = manager.create(CoreApplicationUsers, {
        id: userId,
        firstName,
        lastName,
        userName,
        email,
        passwordHash,
        phoneNumber,
        isLocked: false,
        keepLogin,
        allowMultipleSessions,
        isDeleted: false,
        createdBy: currentUserId,
        createdOn: now,
      });
      await manager.save(user);

      // Assign default N/A privileges for all modules
      await this.userPrivilegesService.assignDefaultPrivileges(userId, manager);
    });

    return {
      id: userId,
      firstName,
      lastName,
      userName,
      email,
      phoneNumber,
    };
  }

  // ─── Get User By ID ──────────────────────────────────────────────────

  async getUserById(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepo.findOne({
      where: { id, isDeleted: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        userName: true,
        theme: true,
      },
    });

    if (!user) {
      throw new BadRequestException(ErrorMessages.USER_NOT_FOUND);
    }

    return {
      id: user.id,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      userName: user.userName ?? '',
      email: user.email ?? '',
      phoneNumber: user.phoneNumber ?? '',
    };
  }

  // ─── Get All Users ────────────────────────────────────────────────────

  async getAll(excludeCurrentUser?: boolean, currentUserId?: string): Promise<UserResponseDto[]> {
    const qb = this.usersRepo
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.firstName',
        'u.lastName',
        'u.email',
        'u.phoneNumber',
        'u.userName',
        'u.isLocked',
        'u.keepLogin',
        'u.allowMultipleSessions',
      ])
      .where('u.isDeleted = :deleted', { deleted: false });

    if (excludeCurrentUser && currentUserId) {
      qb.andWhere('u.id <> :currentUserId', { currentUserId });
    }

    qb.orderBy('u.firstName', 'ASC');

    const users = await qb.getMany();

    return users.map((u) => ({
      id: u.id,
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      userName: u.userName ?? '',
      email: u.email ?? '',
      phoneNumber: u.phoneNumber ?? '',
      options: {
        isLocked: u.isLocked,
        keepLogin: u.keepLogin,
        allowMultipleSessions: u.allowMultipleSessions,
      },
    }));
  }

  // ─── Get Emails ───────────────────────────────────────────────────────

  async getEmails(): Promise<string[]> {
    const users = await this.usersRepo.find({
      where: { isDeleted: false },
      select: { email: true },
      order: { firstName: 'ASC' },
    });

    return users.map((u) => u.email).filter((e): e is string => !!e);
  }

  // ─── Self Update ──────────────────────────────────────────────────────

  async selfUpdate(userId: string, body: EditSelfDto): Promise<void> {
    const { firstName, lastName, email, phoneNumber } = body;

    // Check email uniqueness excluding self
    const emailExists = await this.usersRepo
      .createQueryBuilder('u')
      .where('u.email = :email AND u.id <> :userId AND u.isDeleted = :deleted', {
        email,
        userId,
        deleted: false,
      })
      .getExists();

    if (emailExists) {
      throw new BadRequestException(ErrorMessages.EMAIL_ALREADY_EXISTS);
    }

    await this.usersRepo.update(userId, {
      firstName,
      lastName,
      phoneNumber,
      email,
      modifiedOn: this.dateHelper.currentDate(),
    });
  }

  // ─── Update (admin updates another user) ──────────────────────────────

  async update(userId: string, currentUserId: string, body: UpdateUserDto): Promise<void> {
    const { firstName, lastName, email, phoneNumber, allowMultipleSessions, keepLogin } = body;

    // Check email uniqueness excluding target user
    const emailExists = await this.usersRepo
      .createQueryBuilder('u')
      .where('u.email = :email AND u.id <> :userId AND u.isDeleted = :deleted', {
        email,
        userId,
        deleted: false,
      })
      .getExists();

    if (emailExists) {
      throw new BadRequestException(ErrorMessages.EMAIL_ALREADY_EXISTS);
    }

    await this.usersRepo.update(userId, {
      firstName,
      lastName,
      phoneNumber,
      email,
      allowMultipleSessions,
      keepLogin,
      modifiedBy: currentUserId,
      modifiedOn: this.dateHelper.currentDate(),
    });
  }

  // ─── Delete (soft) ────────────────────────────────────────────────────

  async delete(currentUserId: string, targetUserId: string): Promise<void> {
    const now = this.dateHelper.currentDate();
    await this.usersRepo.update(targetUserId, {
      isDeleted: true,
      deletedBy: currentUserId,
      deletedOn: now,
      modifiedBy: currentUserId,
      modifiedOn: now,
    });
  }

  // ─── Lock / Unlock ────────────────────────────────────────────────────

  async lock(currentUserId: string, targetUserId: string): Promise<void> {
    await this.usersRepo.update(targetUserId, {
      isLocked: true,
      modifiedBy: currentUserId,
      modifiedOn: this.dateHelper.currentDate(),
    });
  }

  async unlock(currentUserId: string, targetUserId: string): Promise<void> {
    await this.usersRepo.update(targetUserId, {
      isLocked: false,
      modifiedBy: currentUserId,
      modifiedOn: this.dateHelper.currentDate(),
    });
  }

  // ─── Theme Update ─────────────────────────────────────────────────────

  async themeUpdate(userId: string, theme: UserTheme): Promise<void> {
    await this.usersRepo.update(userId, { theme });
  }
}
