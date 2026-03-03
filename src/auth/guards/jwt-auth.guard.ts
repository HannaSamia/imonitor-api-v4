import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { ErrorMessages } from '../../shared/constants';

/** Maximum absolute lifetime for keepLogin tokens: 30 days (SC-01 security fix) */
const MAX_KEEP_LOGIN_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
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

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }

    // Always verify signature first
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        clockTolerance: 60,
      });
      request.user = payload;
      return true;
    } catch (error: any) {
      // If expired, check keepLogin from the token payload (no DB query needed — PC-01 fix)
      if (error?.name === 'TokenExpiredError') {
        return this.handleExpiredToken(request, token);
      }
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }
  }

  private handleExpiredToken(request: any, token: string): boolean {
    // Verify signature (ignore expiration) to get the payload safely
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        ignoreExpiration: true,
      });
    } catch {
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }

    if (!payload?.id) {
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }

    // keepLogin is embedded in the JWT payload at token issuance time (PC-01 fix)
    if (!payload.keepLogin) {
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }

    // Enforce maximum absolute lifetime of 30 days (SC-01 security fix)
    if (payload.iat) {
      const tokenAgeSeconds = Math.floor(Date.now() / 1000) - payload.iat;
      if (tokenAgeSeconds > MAX_KEEP_LOGIN_SECONDS) {
        throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
      }
    }

    request.user = payload;
    return true;
  }

  private extractTokenFromHeader(request: any): string | null {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.split(' ')[1] || null;
  }
}
