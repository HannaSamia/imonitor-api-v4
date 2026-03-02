import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { ErrorMessages } from '../../shared/constants';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check @Public() decorator — skip auth for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Skip validation in development mode (matching v3 behavior)
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv !== 'production' && nodeEnv !== 'test') {
      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers['authorization'];
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const decoded = jwt.decode(token) as JwtPayload;
          if (decoded) {
            request.user = decoded;
          }
        } catch {
          // In dev mode, allow through even with invalid token
        }
      }
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }

    const jwtKey = this.configService.get<string>('JWT_KEY');
    if (!jwtKey) {
      this.logger.error('JWT_KEY not configured');
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }

    // Decode first to get user ID for keepLogin check
    const decoded = jwt.decode(token) as JwtPayload | null;
    if (!decoded || !decoded.id) {
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }

    // Check keepLogin flag — if true, skip expiration validation
    let ignoreExpiration = false;
    try {
      const result = await this.dataSource.query(
        'SELECT keepLogin FROM core_application_users WHERE id = ?',
        [decoded.id],
      );
      if (result.length > 0 && result[0].keepLogin) {
        ignoreExpiration = true;
      }
    } catch (error: unknown) {
      this.logger.warn(`Failed to check keepLogin for user ${decoded.id}: ${(error as Error).message}`);
    }

    if (ignoreExpiration) {
      // keepLogin users bypass expiry — just attach user and proceed
      request.user = decoded;
      return true;
    }

    // Verify token with expiration check
    try {
      const verified = jwt.verify(token, jwtKey, {
        clockTolerance: 60,
      }) as JwtPayload;
      request.user = verified;
      return true;
    } catch (error) {
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }
  }
}
