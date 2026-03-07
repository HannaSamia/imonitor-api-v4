import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 } from 'uuid';
import { CoreRotatingDashboard } from '../../database/entities/core-rotating-dashboard.entity';
import { CoreSharedRotatingDashboard } from '../../database/entities/core-shared-rotating-dashboard.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { DEFAULT_ADMIN_ID } from '../../shared/constants/auth.constants';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { DashboardService } from '../dashboard/dashboard.service';
import { SaveRotatingDashboardDto } from './dto/save-rotating-dashboard.dto';
import { UpdateRotatingDashboardDto } from './dto/update-rotating-dashboard.dto';

export interface RotatingDashboardDto {
  id: string;
  name: string;
  minutes: number;
  dashboardIds: string[];
  ownerId: string;
  isFavorite: boolean;
  isDefault?: boolean;
}

export interface ListRotatingDashboardDto {
  id: string;
  name: string;
  ownerId: string;
  isFavorite: boolean;
  owner: string;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
}

@Injectable()
export class RotatingDashboardService {
  private readonly logger = new Logger(RotatingDashboardService.name);

  constructor(
    @InjectRepository(CoreRotatingDashboard)
    private readonly rotatingDashboardRepo: Repository<CoreRotatingDashboard>,
    @InjectRepository(CoreSharedRotatingDashboard)
    private readonly sharedRotatingDashboardRepo: Repository<CoreSharedRotatingDashboard>,
    private readonly dataSource: DataSource,
    private readonly dateHelper: DateHelperService,
    private readonly dashboardService: DashboardService,
  ) {}

  /**
   * Get rotating dashboard by ID.
   */
  async getById(id: string): Promise<RotatingDashboardDto> {
    const exists = await this.rotatingDashboardExists(id);
    if (!exists) {
      throw new BadRequestException(ErrorMessages.ROTATING_DASHBOARD_DOES_NOT_EXIST);
    }

    const rd = await this.rotatingDashboardRepo.findOne({
      where: { id },
      select: { id: true, name: true, minutes: true, dashboardIds: true, ownerId: true, isFavorite: true },
    });

    return {
      id: rd!.id,
      name: rd!.name,
      minutes: rd!.minutes,
      dashboardIds: JSON.parse(rd!.dashboardIds),
      ownerId: rd!.ownerId,
      isFavorite: rd!.isFavorite,
    };
  }

  /**
   * Create a new rotating dashboard.
   * Validates user privilege on each nested dashboard.
   */
  async save(dto: SaveRotatingDashboardDto, currentUserId: string): Promise<string> {
    const dashboardIds = [...new Set(dto.dashboardIds)];

    for (const dashboardId of dashboardIds) {
      const isShared = await this.dashboardService.isSharedDashboard(dashboardId);
      if (!isShared) {
        await this.dashboardService.hasPrivilege(dashboardId, currentUserId);
      }
    }

    const id = v4();
    await this.rotatingDashboardRepo.save({
      id,
      name: dto.name,
      dashboardIds: JSON.stringify(dashboardIds),
      createdAt: new Date(),
      ownerId: currentUserId,
      minutes: dto.minutes,
    });

    return id;
  }

  /**
   * List rotating dashboards: own + default + shared.
   * Filters by widget builder table privileges per nested dashboard.
   */
  async list(currentUserId: string): Promise<ListRotatingDashboardDto[]> {
    const listQuery = `
      SELECT
        id, name, ownerId, isFavorite,
        (SELECT userName FROM core_application_users WHERE id = ownerId) AS owner,
        dashboardIds,
        false AS isShared,
        DATE_FORMAT(createdAt, "%Y-%m-%d %H:%i") AS createdAt,
        DATE_FORMAT(updatedAt, "%Y-%m-%d %H:%i") AS updatedAt,
        isDefault
      FROM core_rotating_dashboard
      WHERE ownerId = ? OR isDefault = 1

      UNION

      SELECT
        srd.id AS id, rd.name AS name, rd.ownerId,
        srd.isFavorite,
        (SELECT userName FROM core_application_users WHERE id = rd.ownerId) AS owner,
        rd.dashboardIds,
        true AS isShared,
        DATE_FORMAT(srd.createdAt, "%Y-%m-%d %H:%i") AS createdAt,
        DATE_FORMAT(rd.updatedAt, "%Y-%m-%d %H:%i") AS updatedAt,
        0 AS isDefault
      FROM core_shared_rotating_dashboard srd, core_rotating_dashboard rd
      WHERE srd.ownerId = ? AND srd.rotatingDashboardId = rd.id

      ORDER BY isDefault, isFavorite, updatedAt DESC, createdAt DESC, name DESC`;

    const rotatingDashboards = await this.dataSource.query(listQuery, [currentUserId, currentUserId]);

    // Get user's privileged tables
    const privilegedTablesQuery = `
      SELECT GROUP_CONCAT(CONCAT('"', id, '"')) AS privilegedTables
      FROM core_modules_tables
      WHERE mId IN (
        SELECT ModuleId FROM core_privileges
        WHERE UserId = ?
        AND RoleId IN (
          SELECT id FROM core_application_roles WHERE name != ?
        )
      )`;

    const privilegedTableResult: Array<{ privilegedTables: string }> = await this.dataSource.query(
      privilegedTablesQuery,
      [currentUserId, AvailableRoles.DEFAULT],
    );

    const privilegedTablesRaw = privilegedTableResult[0]?.privilegedTables;
    const privilegedTables: string[] = privilegedTablesRaw ? JSON.parse('[' + privilegedTablesRaw + ']') : [];

    const response: ListRotatingDashboardDto[] = [];

    // Collect all unique dashboardIds from non-shared rotating dashboards for batch query
    const allDashboardIds = new Set<string>();
    for (const rd of rotatingDashboards) {
      if (rd.isShared !== true && currentUserId !== DEFAULT_ADMIN_ID) {
        const dashboardIds: string[] = JSON.parse(rd.dashboardIds as string);
        for (const did of dashboardIds) {
          allDashboardIds.add(did);
        }
      }
    }

    // Batch fetch used tables for all dashboards (fixes N+1)
    const dashUsedTablesMap = new Map<string, string[]>();
    if (allDashboardIds.size > 0) {
      const batchResult: Array<{ dashboardId: string; tableId: string }> = await this.dataSource.query(
        `SELECT dwb.dashboardId, wbut.tableId
         FROM core_dashboard_widget_builder dwb
         INNER JOIN core_widget_builder_used_tables wbut ON dwb.widgetBuilderId = wbut.widgetBuilderId
         WHERE dwb.dashboardId IN (?)`,
        [Array.from(allDashboardIds)],
      );
      for (const row of batchResult) {
        if (!dashUsedTablesMap.has(row.dashboardId)) {
          dashUsedTablesMap.set(row.dashboardId, []);
        }
        dashUsedTablesMap.get(row.dashboardId)!.push(row.tableId);
      }
    }

    let index = rotatingDashboards.length;
    while (index--) {
      const rd = rotatingDashboards[index];
      const dashboardIds: string[] = JSON.parse(rd.dashboardIds as string);
      let canBeAdded = true;

      if (rd.isShared !== true && currentUserId !== DEFAULT_ADMIN_ID) {
        for (const dashboardId of dashboardIds) {
          const usedTables = dashUsedTablesMap.get(dashboardId) || [];
          const hasPriv = usedTables.every((tableId) => privilegedTables.includes(tableId));
          if (!hasPriv) {
            canBeAdded = false;
            break;
          }
        }
      }

      if (canBeAdded) {
        const { dashboardIds: _, ...rest } = rd;
        response.push(rest);
      }
    }

    return response;
  }

  /**
   * Share a rotating dashboard with users.
   * Validates no shared dashboards in the rotation.
   */
  async share(rotatingDashboardId: string, userIds: string[]): Promise<void> {
    const rd = await this.getById(rotatingDashboardId);

    for (const dashboardId of rd.dashboardIds) {
      const isShared = await this.dashboardService.isSharedDashboard(dashboardId);
      if (isShared) {
        throw new BadRequestException(ErrorMessages.CANNOT_SHARE_ROTATING_CONTAINING_SHARED);
      }
    }

    try {
      if (userIds.length > 0) {
        const entities = userIds.map((userId) => ({
          rotatingDashboardId,
          ownerId: userId,
          createdAt: new Date(),
        }));
        await this.sharedRotatingDashboardRepo.insert(entities);
      }
    } catch (_error) {
      throw new BadRequestException(ErrorMessages.ERROR_SHARE);
    }
  }

  /**
   * Get shared rotating dashboard by its shared ID.
   */
  async getSharedById(sharedId: string): Promise<RotatingDashboardDto> {
    const sharedQuery = `
      SELECT srd.id, srd.rotatingDashboardId, srd.ownerId,
        rd.name, rd.isDefault, rd.dashboardIds, rd.minutes
      FROM core_shared_rotating_dashboard srd
      LEFT JOIN core_rotating_dashboard rd ON srd.rotatingDashboardId = rd.id
      WHERE srd.id = ?`;

    const results = await this.dataSource.query(sharedQuery, [sharedId]);
    if (results.length === 0) {
      throw new BadRequestException(ErrorMessages.ROTATING_DASHBOARD_DOES_NOT_EXIST);
    }

    return {
      id: results[0].id,
      name: results[0].name,
      isDefault: results[0].isDefault,
      minutes: results[0].minutes,
      ownerId: results[0].ownerId,
      dashboardIds: JSON.parse(results[0].dashboardIds),
      isFavorite: false,
    };
  }

  /**
   * Toggle favorite status on a rotating dashboard or shared rotating dashboard.
   */
  async favorite(id: string, isShared: boolean): Promise<boolean> {
    if (isShared) {
      const shared = await this.sharedRotatingDashboardRepo.findOne({
        where: { id },
        select: { isFavorite: true },
      });
      if (!shared) {
        throw new NotFoundException(ErrorMessages.ROTATING_DASHBOARD_DOES_NOT_EXIST);
      }
      const newFav = !shared.isFavorite;
      await this.sharedRotatingDashboardRepo.update({ id }, { isFavorite: newFav });
      return newFav;
    }

    const rd = await this.rotatingDashboardRepo.findOne({
      where: { id },
      select: { isFavorite: true },
    });
    if (!rd) {
      throw new NotFoundException(ErrorMessages.ROTATING_DASHBOARD_DOES_NOT_EXIST);
    }
    const newFav = !rd.isFavorite;
    await this.rotatingDashboardRepo.update({ id }, { isFavorite: newFav });
    return newFav;
  }

  /**
   * Save a shared rotating dashboard as a new one.
   * Duplicates each nested dashboard via DashboardService.
   */
  async saveShared(sharedId: string, currentUserId: string): Promise<string> {
    const rd = await this.getSharedById(sharedId);

    const newDashboardIds: string[] = [];

    for (const dashboardId of rd.dashboardIds) {
      const isShared = await this.dashboardService.isSharedDashboard(dashboardId);
      if (!isShared) {
        await this.dashboardService.hasPrivilege(dashboardId, currentUserId);
      }
      const dashboardData = await this.dashboardService.getAnyById(dashboardId);
      const newDashId = await this.dashboardService.save(
        { name: dashboardData.name, charts: dashboardData.charts },
        currentUserId,
      );
      newDashboardIds.push(newDashId);
    }

    const id = v4();
    await this.rotatingDashboardRepo.save({
      id,
      name: rd.name,
      dashboardIds: JSON.stringify(newDashboardIds),
      createdAt: new Date(),
      ownerId: currentUserId,
      minutes: rd.minutes,
    });

    return id;
  }

  /**
   * Update an existing rotating dashboard.
   */
  async update(dto: UpdateRotatingDashboardDto, currentUserId: string): Promise<void> {
    const exists = await this.rotatingDashboardExists(dto.id);
    if (!exists) {
      throw new BadRequestException(ErrorMessages.ROTATING_DASHBOARD_DOES_NOT_EXIST);
    }

    await this.rotatingDashboardRepo.update(
      { id: dto.id },
      {
        name: dto.name,
        minutes: dto.minutes,
        dashboardIds: JSON.stringify(dto.dashboardIds),
        ownerId: currentUserId,
        updatedAt: new Date(),
      },
    );
  }

  /**
   * Delete a rotating dashboard. Only the owner can delete.
   */
  async delete(rotatingDashboardId: string, currentUserId: string): Promise<string> {
    const rd = await this.getById(rotatingDashboardId);

    if (currentUserId !== rd.ownerId) {
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
    }

    await this.rotatingDashboardRepo.delete({ id: rotatingDashboardId });
    return ErrorMessages.ROTATING_DASHBOARD_SUCCESSFULLY_DELETED;
  }

  // --------------- Private helpers ---------------

  private async rotatingDashboardExists(id: string): Promise<boolean> {
    return this.rotatingDashboardRepo.createQueryBuilder('rd').where('rd.id = :id', { id }).getExists();
  }
}
