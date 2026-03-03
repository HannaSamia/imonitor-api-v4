import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CoreApplicationRefreshToken } from '../../database/entities/core-application-refresh-token.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PasswordService } from '../../shared/services/password.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants';
import { SystemKeys } from '../../shared/constants/system-keys';
import { hasPrivilege } from '../../auth/helpers/privilege.helper';
import { LoginDto, RefreshTokenDto, CanAccessModuleDto } from './dto';

export interface AuthenticationResult {
  token: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(CoreApplicationUsers)
    private readonly usersRepo: Repository<CoreApplicationUsers>,
    @InjectRepository(CoreApplicationRoles)
    private readonly rolesRepo: Repository<CoreApplicationRoles>,
    @InjectRepository(CoreApplicationRefreshToken)
    private readonly refreshTokenRepo: Repository<CoreApplicationRefreshToken>,
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
    @InjectRepository(CoreModules)
    private readonly modulesRepo: Repository<CoreModules>,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly dateHelper: DateHelperService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  // ─── Login ───────────────────────────────────────────────────────────

  async login(body: LoginDto): Promise<AuthenticationResult> {
    const { credential, password } = body;

    // Find user by userName or email
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.isLocked', 'u.email', 'u.userName', 'u.passwordHash', 'u.allowMultipleSessions', 'u.theme'])
      .where('(u.userName = :credential OR u.email = :credential) AND u.isDeleted = :deleted', {
        credential,
        deleted: false,
      })
      .getOne();

    if (!user) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    if (user.isLocked) {
      throw new BadRequestException(ErrorMessages.ACCOUNT_LOCKED);
    }

    if (!user.passwordHash) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    const passwordValid = await this.passwordService.isPasswordValid(password, user.passwordHash);
    if (!passwordValid) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    // Check multiple sessions
    if (!user.allowMultipleSessions) {
      const activeTokenExists = await this.refreshTokenRepo
        .createQueryBuilder('rt')
        .where('rt.userId = :userId AND rt.invalidated = :inv AND rt.used = :used', {
          userId: user.id,
          inv: false,
          used: false,
        })
        .getExists();

      if (activeTokenExists) {
        throw new BadRequestException(ErrorMessages.ONLY_ONE_SESSION_ALLOWED);
      }
    }

    if (!user.email || !user.userName) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    // Update lastLogin
    await this.usersRepo.update(user.id, { lastLogin: this.dateHelper.currentDate() });

    // Generate tokens (embed keepLogin in JWT for guard use — PC-01 fix)
    return this.generateTokenAndRefreshToken(user.id, user.email, user.userName, user.theme ?? 'light', false);
  }

  // ─── Logout ──────────────────────────────────────────────────────────

  async logout(token: string, userId: string): Promise<void> {
    // Validate token (ignore expiration for logout)
    let decoded: JwtPayload;
    try {
      decoded = this.jwtService.verify<JwtPayload>(token, { ignoreExpiration: true });
    } catch {
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }

    if (!decoded.jti) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Find refresh token by jwtId
    const refreshToken = await this.refreshTokenRepo.findOne({ where: { jwtId: decoded.jti } });
    if (!refreshToken) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Only invalidate if not already used/invalidated
    if (!refreshToken.used && !refreshToken.invalidated) {
      await this.refreshTokenRepo.update(refreshToken.id, { invalidated: true });
    }

    // Update lastLogout
    await this.usersRepo.update(userId, { lastLogout: this.dateHelper.currentDate() });
  }

  // ─── Refresh Token ───────────────────────────────────────────────────

  async refreshToken(body: RefreshTokenDto): Promise<AuthenticationResult> {
    const { token, refreshToken: refreshTokenId } = body;

    // Verify JWT signature (ignore expiration — this is a refresh flow)
    let decoded: JwtPayload;
    try {
      decoded = this.jwtService.verify<JwtPayload>(token, { ignoreExpiration: true });
    } catch {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    if (!decoded.email) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Fetch user
    const user = await this.usersRepo.findOne({
      where: { email: decoded.email },
      select: { id: true, email: true, userName: true, allowMultipleSessions: true, theme: true, keepLogin: true },
    });

    if (!user || !user.email || !user.userName) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    // ALWAYS validate the refresh token (H-02 fix)
    const storedRefreshToken = await this.refreshTokenRepo.findOne({
      where: { id: refreshTokenId },
    });
    if (!storedRefreshToken) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Validate jwtId link
    if (!decoded.jti || storedRefreshToken.jwtId !== decoded.jti) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Check not expired
    if (new Date() > storedRefreshToken.expiryDate) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Check not used or invalidated
    if (storedRefreshToken.used || storedRefreshToken.invalidated) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // keepLogin users bypass the "token hasn't expired yet" check
    // Non-keepLogin users must wait until token is near expiry
    if (!user.keepLogin) {
      if (decoded.exp) {
        const now = Math.floor(Date.now() / 1000);
        const gracePeriod = decoded.exp - 60; // 1 minute before expiry
        if (now < gracePeriod) {
          throw new BadRequestException(ErrorMessages.TOKEN_HAS_NOT_EXPIRED_YET);
        }
      }
    }

    // Mark old refresh token as used
    await this.refreshTokenRepo.update(storedRefreshToken.id, { used: true });

    // Generate new pair (embed keepLogin in JWT for guard use — PC-01 fix)
    return this.generateTokenAndRefreshToken(user.id, user.email, user.userName, user.theme ?? 'light', user.keepLogin);
  }

  // ─── Can Access Module ───────────────────────────────────────────────

  async canAccessModule(userId: string, body: CanAccessModuleDto): Promise<void> {
    const { role, module } = body;

    // Parallel: role + module lookups are independent (M-09 fix)
    const [roleExists, moduleExists] = await Promise.all([
      this.rolesRepo.findOne({ where: { name: role } }),
      this.modulesRepo.findOne({ where: { name: module } }),
    ]);

    if (!roleExists) {
      throw new BadRequestException(ErrorMessages.ROLE_NOT_FOUND);
    }
    if (!moduleExists) {
      throw new BadRequestException(ErrorMessages.MODULE_NOT_FOUND);
    }

    // Get user's role on this module
    const privilege = await this.privilegesRepo.findOne({
      where: { userId, moduleId: parseInt(moduleExists.id, 10) },
      relations: { role: true },
    });

    const userRole = privilege?.role?.name;
    if (!userRole || !hasPrivilege(userRole, role)) {
      throw new BadRequestException(ErrorMessages.UNAUTHORIZED_ROLE);
    }
  }

  // ─── Token Generation ────────────────────────────────────────────────

  async generateTokenAndRefreshToken(
    userId: string,
    email: string,
    userName: string,
    theme: string,
    keepLogin?: boolean,
  ): Promise<AuthenticationResult> {
    const jwtId = uuidv4();

    // Batch fetch both config values in a single query (PH-03 performance fix)
    const configValues = await this.systemConfigService.getConfigValues([
      SystemKeys.tokenExpiryInMinutes,
      SystemKeys.rtokenExpiryInMinutes,
    ]);
    const expiresInSeconds = configValues[SystemKeys.tokenExpiryInMinutes]
      ? parseInt(configValues[SystemKeys.tokenExpiryInMinutes], 10) * 60
      : 1800; // 30 min default
    const rtExpiryMins = configValues[SystemKeys.rtokenExpiryInMinutes]
      ? parseInt(configValues[SystemKeys.rtokenExpiryInMinutes], 10)
      : 10080; // 7 days default

    const payload: JwtPayload = {
      id: userId,
      email,
      credential: userName,
      theme,
      keepLogin: keepLogin ?? false,
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: expiresInSeconds,
      subject: userId,
      jwtid: jwtId,
    });

    const refreshTokenId = uuidv4();
    const now = this.dateHelper.currentDate();
    const expiryDate = this.dateHelper.addDurationToDate({ minutes: rtExpiryMins }, now);

    const refreshTokenEntity = this.refreshTokenRepo.create({
      id: refreshTokenId,
      jwtId,
      userId,
      used: false,
      invalidated: false,
      expiryDate,
      createdOn: now,
    });
    await this.refreshTokenRepo.save(refreshTokenEntity);

    return { token, refreshToken: refreshTokenId };
  }
}
