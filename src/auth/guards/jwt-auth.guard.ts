import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Skeleton JWT Auth Guard.
 * Full implementation (token verification, user lookup) will be added in Phase 2.
 * Currently extracts the token from the Authorization header for validation readiness.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Token not provided');
    }

    // TODO: Phase 2 — Verify JWT using configService.get('JWT_KEY')
    // TODO: Phase 2 — Attach decoded user to request object
    // For now, allow all requests with a Bearer token through
    this.logger.debug('JWT guard: token extracted (validation deferred to Phase 2)');
    return true;
  }
}
