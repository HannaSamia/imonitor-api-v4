import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hasPrivilege } from '../helpers/privilege.helper';
import { ErrorMessages } from '../../shared/constants';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Dynamic privilege guard — replaces v3's authorize() middleware.
 * Queries core_minimum_privileges by route path + HTTP method,
 * then checks user's role on that module via core_privileges.
 */
@Injectable()
export class PrivilegeGuard implements CanActivate {
  private readonly logger = new Logger(PrivilegeGuard.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user?.id) {
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
    }

    const routePath = request.route?.path || request.path;
    const method = request.method;

    try {
      // Query 1: Find minimum role required for this route + method
      const minimumRoleRequired = await this.dataSource.query(
        `SELECT moduleId,
          (SELECT name FROM core_application_roles WHERE id = mp.roleRequired) AS roleRequired
         FROM core_minimum_privileges AS mp
         WHERE request = ? AND method = ?`,
        [routePath, method],
      );

      // If route is not registered in minimum_privileges, allow through (v3 behavior)
      if (!minimumRoleRequired || minimumRoleRequired.length === 0) {
        return true;
      }

      const { moduleId, roleRequired } = minimumRoleRequired[0];

      // Query 2: Get user's current role on this module
      const userRoleResult = await this.dataSource.query(
        `SELECT r.name AS currentRole
         FROM core_application_roles AS r
         WHERE r.id = (
           SELECT p.RoleId FROM core_privileges AS p
           WHERE p.ModuleId = ? AND p.UserId = ?
         )`,
        [moduleId, user.id],
      );

      if (!userRoleResult || userRoleResult.length === 0) {
        throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE);
      }

      const currentRole = userRoleResult[0].currentRole;

      if (!hasPrivilege(currentRole, roleRequired)) {
        throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE);
      }

      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.error(`PrivilegeGuard error: ${(error as Error).message}`);
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
    }
  }
}
