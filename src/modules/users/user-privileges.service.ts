import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { UserPrivilegesDto } from './dto';

@Injectable()
export class UserPrivilegesService {
  private readonly logger = new Logger(UserPrivilegesService.name);

  constructor(
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
    @InjectRepository(CoreApplicationRoles)
    private readonly rolesRepo: Repository<CoreApplicationRoles>,
    @InjectRepository(CoreModules)
    private readonly modulesRepo: Repository<CoreModules>,
  ) {}

  // ─── Get User Privileges (recursive tree) ─────────────────────────────

  async getUserPrivileges(userId: string): Promise<UserPrivilegesDto[]> {
    // Bulk load all modules + all user privileges (2 queries total)
    const [allModules, allPrivileges] = await Promise.all([
      this.modulesRepo.find({ order: { priority: 'ASC' } }),
      this.privilegesRepo.find({ where: { userId }, relations: { role: true } }),
    ]);

    const privMap = new Map(allPrivileges.map((p) => [p.moduleId, p.role?.name ?? AvailableRoles.DEFAULT]));
    const modulesByParent = this.groupModulesByParent(allModules);

    return this.buildTreeFromMaps(modulesByParent, privMap, 0);
  }

  // ─── Update User Privileges (batch + transaction) ──────────────────────

  async updateUserPrivileges(userId: string, body: UserPrivilegesDto[]): Promise<void> {
    // Pre-load all roles to avoid N+1 lookups
    const allRoles = await this.rolesRepo.find();
    const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

    const updates = this.collectPrivilegeUpdates(body, roleMap);

    // Group by roleId for batch UPDATE (H-06 fix)
    const groupedByRole = new Map<string, number[]>();
    for (const { moduleId, roleId } of updates) {
      if (!groupedByRole.has(roleId)) groupedByRole.set(roleId, []);
      groupedByRole.get(roleId)!.push(moduleId);
    }

    // Execute in transaction
    await this.privilegesRepo.manager.transaction(async (manager) => {
      for (const [roleId, moduleIds] of groupedByRole) {
        await manager
          .createQueryBuilder()
          .update(CorePrivileges)
          .set({ roleId })
          .where('userId = :userId AND moduleId IN (:...moduleIds)', { userId, moduleIds })
          .execute();
      }
    });
  }

  // ─── Get Side Menu ────────────────────────────────────────────────────

  async getSideMenu(userId: string, theme: string): Promise<UserPrivilegesDto[]> {
    // Bulk load all modules + all user privileges (2 queries total)
    const [allModules, allPrivileges] = await Promise.all([
      this.modulesRepo.find({ order: { priority: 'ASC' } }),
      this.privilegesRepo.find({ where: { userId }, relations: { role: true } }),
    ]);

    const privMap = new Map(allPrivileges.map((p) => [p.moduleId, p.role?.name ?? AvailableRoles.DEFAULT]));
    const modulesByParent = this.groupModulesByParent(allModules);

    return this.buildMenuTreeFromMaps(modulesByParent, privMap, 0, theme);
  }

  // ─── Get User Role On Module ──────────────────────────────────────────

  async getUserRoleOnModule(userId: string, moduleName: string): Promise<string | null> {
    const mod = await this.modulesRepo.findOne({ where: { name: moduleName } });
    if (!mod) {
      return null;
    }

    const privilege = await this.privilegesRepo.findOne({
      where: { userId, moduleId: parseInt(mod.id, 10) },
      relations: { role: true },
    });

    return privilege?.role?.name ?? null;
  }

  // ─── Assign Default Privileges ────────────────────────────────────────

  async assignDefaultPrivileges(userId: string, manager?: EntityManager): Promise<void> {
    const em = manager ?? this.privilegesRepo.manager;
    const defaultRole = await em.findOne(CoreApplicationRoles, { where: { name: AvailableRoles.DEFAULT } });
    if (!defaultRole) return;

    const allModules = await em.find(CoreModules, {});
    const privileges = allModules.map((mod) =>
      em.create(CorePrivileges, {
        id: uuidv4(),
        userId,
        roleId: defaultRole.id,
        moduleId: parseInt(mod.id, 10),
      }),
    );

    if (privileges.length > 0) {
      await em.save(privileges);
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private groupModulesByParent(modules: CoreModules[]): Map<number, CoreModules[]> {
    const map = new Map<number, CoreModules[]>();
    for (const mod of modules) {
      const pId = mod.pId ?? 0;
      if (!map.has(pId)) map.set(pId, []);
      map.get(pId)!.push(mod);
    }
    return map;
  }

  private buildTreeFromMaps(
    modulesByParent: Map<number, CoreModules[]>,
    privMap: Map<number, string>,
    parentId: number,
  ): UserPrivilegesDto[] {
    const modules = modulesByParent.get(parentId) ?? [];
    return modules.map((mod) => {
      const moduleId = parseInt(mod.id, 10);
      const roleName = privMap.get(moduleId) ?? AvailableRoles.DEFAULT;
      const { isUser, isSuperUser, isAdmin } = this.mapRoleFlags(roleName);

      const childModules = modulesByParent.get(moduleId);
      const children = childModules ? this.buildTreeFromMaps(modulesByParent, privMap, moduleId) : undefined;

      return {
        id: moduleId,
        pId: mod.pId ?? 0,
        name: mod.name,
        isMenuItem: mod.isMenuItem,
        priority: mod.priority,
        nestedLevel: mod.nestedLevel ?? 0,
        icon: mod.icon ?? undefined,
        color: mod.lightColor ?? undefined,
        font: mod.font ?? undefined,
        path: mod.path ?? undefined,
        roleName,
        isUser,
        isSuperUser,
        isAdmin,
        toggle: roleName,
        children,
      };
    });
  }

  private buildMenuTreeFromMaps(
    modulesByParent: Map<number, CoreModules[]>,
    privMap: Map<number, string>,
    parentId: number,
    theme: string,
  ): UserPrivilegesDto[] {
    const modules = modulesByParent.get(parentId) ?? [];
    const result: UserPrivilegesDto[] = [];

    for (const mod of modules) {
      const moduleId = parseInt(mod.id, 10);
      const roleName = privMap.get(moduleId) ?? AvailableRoles.DEFAULT;

      if (!mod.isMenuItem) continue;
      if (roleName === AvailableRoles.DEFAULT && !mod.isDefault) continue;

      const { isUser, isSuperUser, isAdmin } = this.mapRoleFlags(roleName);
      const childModules = modulesByParent.get(moduleId);
      const children = childModules ? this.buildMenuTreeFromMaps(modulesByParent, privMap, moduleId, theme) : undefined;
      const color = theme === 'dark' ? (mod.darkColor ?? undefined) : (mod.lightColor ?? undefined);

      result.push({
        id: moduleId,
        pId: mod.pId ?? 0,
        name: mod.name,
        isMenuItem: mod.isMenuItem,
        priority: mod.priority,
        nestedLevel: mod.nestedLevel ?? 0,
        icon: mod.icon ?? undefined,
        color,
        font: mod.font ?? undefined,
        path: mod.path ?? undefined,
        roleName,
        isUser,
        isSuperUser,
        isAdmin,
        toggle: roleName,
        children: children?.length ? children : undefined,
      });
    }

    return result;
  }

  private collectPrivilegeUpdates(
    nodes: UserPrivilegesDto[],
    roleMap: Map<string, string>,
  ): { moduleId: number; roleId: string }[] {
    const updates: { moduleId: number; roleId: string }[] = [];
    for (const node of nodes) {
      const roleId = roleMap.get(node.roleName);
      if (roleId) {
        updates.push({ moduleId: node.id, roleId });
      }
      if (node.children?.length) {
        updates.push(...this.collectPrivilegeUpdates(node.children, roleMap));
      }
    }
    return updates;
  }

  private mapRoleFlags(roleName: string): { isUser: boolean; isSuperUser: boolean; isAdmin: boolean } {
    return {
      isUser:
        roleName === AvailableRoles.USER ||
        roleName === AvailableRoles.SUPER_USER ||
        roleName === AvailableRoles.ADMIN ||
        roleName === AvailableRoles.SUPER_ADMIN,
      isSuperUser:
        roleName === AvailableRoles.SUPER_USER ||
        roleName === AvailableRoles.ADMIN ||
        roleName === AvailableRoles.SUPER_ADMIN,
      isAdmin: roleName === AvailableRoles.ADMIN || roleName === AvailableRoles.SUPER_ADMIN,
    };
  }
}
