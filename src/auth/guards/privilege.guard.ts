import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoreMinimumPrivileges } from '../../database/entities/core-minimum-privileges.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { hasPrivilege } from '../helpers/privilege.helper';
import { ErrorMessages } from '../../shared/constants';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Dynamic privilege guard — replaces v3's authorize() middleware.
 * Caches core_minimum_privileges at startup (PC-02 performance fix),
 * then checks user's role on that module via core_privileges.
 */
@Injectable()
export class PrivilegeGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(PrivilegeGuard.name);

  /** Startup cache: route::method → minPriv row (PC-02 fix) */
  private minPrivCache = new Map<string, CoreMinimumPrivileges>();
  private cacheLoaded = false;

  constructor(
    @InjectRepository(CoreMinimumPrivileges)
    private readonly minPrivRepo: Repository<CoreMinimumPrivileges>,
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
  ) {}

  async onModuleInit() {
    await this.loadMinPrivCache();
  }

  private async loadMinPrivCache(): Promise<void> {
    const all = await this.minPrivRepo.find({ relations: { role: true } });
    this.minPrivCache.clear();
    for (const mp of all) {
      this.minPrivCache.set(`${mp.request}::${mp.method}`, mp);
    }
    this.cacheLoaded = true;
    this.logger.log(`Loaded ${all.length} minimum privilege rules into cache`);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user?.id) {
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
    }

    const routePath = request.route?.path || request.path;
    const method = request.method;

    try {
      // Lookup from cache instead of DB query (PC-02 performance fix)
      const cacheKey = `${routePath}::${method}`;
      const minPriv = this.minPrivCache.get(cacheKey) ?? null;

      // If route is not registered in minimum_privileges, allow through (v3 behavior)
      if (!minPriv) {
        return true;
      }

      const roleRequired = minPriv.role?.name;
      if (!roleRequired || !minPriv.moduleId) {
        return true;
      }

      // Query user's current role on this module (per-user, cannot cache globally)
      const userPrivilege = await this.privilegesRepo.findOne({
        where: { userId: user.id, moduleId: minPriv.moduleId },
        relations: { role: true },
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
