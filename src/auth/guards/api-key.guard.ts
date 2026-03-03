import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { ErrorMessages } from '../../shared/constants';
import { SystemKeys } from '../../shared/constants/system-keys';
import { SystemConfigService } from '../../shared/services/system-config.service';

/**
 * API Key guard — replaces v3's keyAuthorisation middleware.
 * Reads `access_token` header and compares against core_sys_config.utilityApiKey.
 * Always enforced regardless of environment.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly systemConfigService: SystemConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['access_token'];

    if (!apiKey) {
      throw new UnauthorizedException(ErrorMessages.UNAUTHORIZED);
    }

    try {
      const storedKey = await this.systemConfigService.getConfigValue(SystemKeys.utilityApiKey);
      if (!storedKey) {
        this.logger.error('utilityApiKey not found in core_sys_config');
        throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
      }

      if (apiKey !== storedKey) {
        throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
      }

      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error(`ApiKeyGuard error: ${(error as Error).message}`);
      throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
    }
  }
}
