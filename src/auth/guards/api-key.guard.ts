import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ErrorMessages } from '../../shared/constants';
import { SystemKeys } from '../../shared/constants/system-keys';

/**
 * API Key guard — replaces v3's keyAuthorisation middleware.
 * Reads `access_token` header and compares against core_sys_config.utilityApiKey.
 * Only enforced in production mode.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only enforce in production (matching v3 behavior)
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv !== 'production') {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['access_token'];

    if (!apiKey) {
      throw new UnauthorizedException(ErrorMessages.UNAUTHORIZED);
    }

    try {
      const result = await this.dataSource.query(
        'SELECT confVal FROM core_sys_config WHERE confKey = ?',
        [SystemKeys.utilityApiKey],
      );

      if (!result || result.length === 0) {
        this.logger.error('utilityApiKey not found in core_sys_config');
        throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
      }

      if (apiKey !== result[0].confVal) {
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
