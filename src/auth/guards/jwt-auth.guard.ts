import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { ErrorMessages } from '../../shared/constants';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectRepository(CoreApplicationUsers)
    private readonly usersRepo: Repository<CoreApplicationUsers>,
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
      // If expired, check keepLogin
      if (error?.name === 'TokenExpiredError') {
        return this.handleExpiredToken(request, token);
      }
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }
  }

  private async handleExpiredToken(request: any, token: string): Promise<boolean> {
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

    // Check keepLogin flag via repository
    const user = await this.usersRepo.findOne({
      where: { id: payload.id },
      select: ['id', 'keepLogin'],
    });

    if (user?.keepLogin) {
      request.user = payload;
      return true;
    }

    throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
  }

  private extractTokenFromHeader(request: any): string | null {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.split(' ')[1] || null;
  }
}
