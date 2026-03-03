import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoreMinimumPrivileges } from '../../database/entities/core-minimum-privileges.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
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
    @InjectRepository(CoreMinimumPrivileges)
    private readonly minPrivRepo: Repository<CoreMinimumPrivileges>,
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
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
      const minPriv = await this.minPrivRepo.findOne({
        where: { request: routePath, method },
        relations: ['role'],
      });

      // If route is not registered in minimum_privileges, allow through (v3 behavior)
      if (!minPriv) {
        return true;
      }

      const roleRequired = minPriv.role?.name;
      if (!roleRequired || !minPriv.moduleId) {
        return true;
      }

      // Query 2: Get user's current role on this module
      const userPrivilege = await this.privilegesRepo.findOne({
        where: { userId: user.id, moduleId: minPriv.moduleId },
        relations: ['role'],
      });

      if (!userPrivilege?.role?.name) {
        throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE);
      }

      if (!hasPrivilege(userPrivilege.role.name, roleRequired)) {
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
