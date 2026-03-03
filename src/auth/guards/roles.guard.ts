import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger, OnModuleInit } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { MODULE_NAME_KEY } from '../decorators/module-name.decorator';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { ErrorMessages } from '../../shared/constants';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';

/**
 * Static role guard — replaces v3's strictAuthorize(roles, module).
 * Used with @Roles(AvailableRoles.ADMIN) + @ModuleName(AvailableModules.SETTINGS)
 * Caches the modules table at startup (PC-03 performance fix).
 */
@Injectable()
export class RolesGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(RolesGuard.name);

  /** Startup cache: module name → module entity (PC-03 fix) */
  private modulesByName = new Map<string, CoreModules>();

  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
    @InjectRepository(CoreModules)
    private readonly modulesRepo: Repository<CoreModules>,
  ) {}

  async onModuleInit() {
    const all = await this.modulesRepo.find();
    for (const m of all) {
      this.modulesByName.set(m.name, m);
    }
    this.logger.log(`Loaded ${all.length} modules into cache`);
  }

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
      // Lookup module from cache instead of DB (PC-03 performance fix)
      const mod = this.modulesByName.get(moduleName);
      if (!mod) {
        throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
      }

      // Get user's privilege on this module
      const privilege = await this.privilegesRepo.findOne({
        where: { userId: user.id, moduleId: parseInt(mod.id, 10) },
        relations: { role: true },
      });

      if (!privilege?.role?.name) {
        throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE);
      }

      // Check if the user's role is in the required roles list
      const roleNames = requiredRoles.map((r) => r as string);
      if (!roleNames.includes(privilege.role.name)) {
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
