import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRefreshToken } from '../../database/entities/core-application-refresh-token.entity';
import { PasswordService } from '../../shared/services/password.service';
import { ErrorMessages } from '../../shared/constants';
import { ChangePasswordDto } from './dto';

@Injectable()
export class UserPasswordService {
  private readonly logger = new Logger(UserPasswordService.name);

  constructor(
    @InjectRepository(CoreApplicationUsers)
    private readonly usersRepo: Repository<CoreApplicationUsers>,
    @InjectRepository(CoreApplicationRefreshToken)
    private readonly refreshTokenRepo: Repository<CoreApplicationRefreshToken>,
    private readonly passwordService: PasswordService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Change Password (own) ────────────────────────────────────────────

  async changePassword(currentUserId: string, body: ChangePasswordDto): Promise<void> {
    const { password, confirmPassword, oldPassword } = body;

    // Validate passwords match
    if (password !== confirmPassword) {
      throw new BadRequestException(ErrorMessages.PASSWORD_MISMATCH);
    }

    // Fetch current password hash
    const user = await this.usersRepo.findOne({
      where: { id: currentUserId },
      select: { id: true, passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      throw new BadRequestException(ErrorMessages.USER_NOT_FOUND);
    }

    // Verify old password
    const oldValid = await this.passwordService.isPasswordValid(oldPassword, user.passwordHash);
    if (!oldValid) {
      throw new BadRequestException(ErrorMessages.WRONG_PASSWORD);
    }

    // Hash new password and update
    const newHash = await this.passwordService.hashPassword(password);
    await this.usersRepo.update(currentUserId, { passwordHash: newHash });

    // Invalidate all active refresh tokens (H-14 security fix)
    await this.refreshTokenRepo.update(
      { userId: currentUserId, invalidated: false, used: false },
      { invalidated: true },
    );
  }

  // ─── Reset Password (admin resets another user) ───────────────────────

  async resetPassword(currentUserId: string, targetUserId: string): Promise<void> {
    // Fetch target user info for email
    const user = await this.usersRepo.findOne({
      where: { id: targetUserId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!user) {
      throw new BadRequestException(ErrorMessages.USER_NOT_FOUND);
    }

    // Generate cryptographically strong random password
    const randomPassword = randomBytes(9).toString('base64url');
    const hashedPassword = await this.passwordService.hashPassword(randomPassword);

    await this.usersRepo.update(targetUserId, { passwordHash: hashedPassword });

    // Invalidate all active refresh tokens (H-14 security fix)
    await this.refreshTokenRepo.update(
      { userId: targetUserId, invalidated: false, used: false },
      { invalidated: true },
    );

    // Emit event for email notification (SC-02 fix: no plaintext password in event)
    // The email service should send a password-reset link instead of the raw password.
    this.eventEmitter.emit('user.password.reset', {
      userId: targetUserId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }
}
