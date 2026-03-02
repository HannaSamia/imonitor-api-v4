import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { MODULE_NAME_KEY } from '../decorators/module-name.decorator';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { ErrorMessages } from '../../shared/constants';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Static role guard — replaces v3's strictAuthorize(roles, module).
 * Used with @Roles(AvailableRoles.ADMIN) + @ModuleName(AvailableModules.SETTINGS)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AvailableRoles[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no @Roles() decorator, allow through
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const moduleName = this.reflector.getAllAndOverride<string>(MODULE_NAME_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!moduleName) {
      this.logger.warn('RolesGuard: @ModuleName() decorator missing alongside @Roles()');
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user?.id) {
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
    }

    try {
      const roleNames = requiredRoles.map((r) => r as string);
      const placeholders = roleNames.map(() => '?').join(',');

      const result = await this.dataSource.query(
        `SELECT EXISTS(
          SELECT 1 FROM core_privileges AS p
          WHERE p.ModuleId = (SELECT id FROM core_modules WHERE name = ?)
            AND p.UserId = ?
            AND p.RoleId IN (SELECT id FROM core_application_roles AS r WHERE r.name IN (${placeholders}))
        ) AS isAuthorized`,
        [moduleName, user.id, ...roleNames],
      );

      const isAuthorized = result[0]?.isAuthorized === 1 || result[0]?.isAuthorized === '1';
      if (!isAuthorized) {
        throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE);
      }

      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.error(`RolesGuard error: ${(error as Error).message}`);
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
    }
  }
}
