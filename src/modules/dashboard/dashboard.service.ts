import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { v4 } from 'uuid';
import { CoreDashboard } from '../../database/entities/core-dashboard.entity';
import { CoreDashboardWidgetBuilder } from '../../database/entities/core-dashboard-widget-builder.entity';
import { CoreDashboardChart } from '../../database/entities/core-dashboard-chart.entity';
import { CoreDashboardError } from '../../database/entities/core-dashboard-error.entity';
import { CoreSharedDashboard } from '../../database/entities/core-shared-dashboard.entity';
import { CoreWidgetBuilder } from '../../database/entities/core-widget-builder.entity';
import { CoreWidgetBuilderCharts } from '../../database/entities/core-widget-builder-charts.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { DEFAULT_ADMIN_ID } from '../../shared/constants/auth.constants';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { WidgetBuilderService } from '../widget-builder/widget-builder.service';
import { SaveDashboardDto } from './dto/save-dashboard.dto';
import { EditDashboardDto } from './dto/edit-dashboard.dto';
import { DashboardChartsDto } from './dto/dashboard-charts.dto';

export interface DashboardDto {
  name: string;
  ownerId: string;
  charts: DashboardChartsDto[];
  isDefault: boolean | null;
}

export interface ListDashboardDto {
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
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(CoreDashboard)
    private readonly dashboardRepo: Repository<CoreDashboard>,
    @InjectRepository(CoreDashboardWidgetBuilder)
    private readonly dashboardWbRepo: Repository<CoreDashboardWidgetBuilder>,
    @InjectRepository(CoreDashboardChart)
    private readonly dashboardChartRepo: Repository<CoreDashboardChart>,
    @InjectRepository(CoreDashboardError)
    private readonly dashboardErrorRepo: Repository<CoreDashboardError>,
    @InjectRepository(CoreSharedDashboard)
    private readonly sharedDashboardRepo: Repository<CoreSharedDashboard>,
    @InjectRepository(CoreWidgetBuilder)
    private readonly widgetBuilderRepo: Repository<CoreWidgetBuilder>,
    @InjectRepository(CoreWidgetBuilderCharts)
    private readonly wbChartsRepo: Repository<CoreWidgetBuilderCharts>,
    private readonly dataSource: DataSource,
    private readonly dateHelper: DateHelperService,
    private readonly widgetBuilderService: WidgetBuilderService,
  ) {}

  /**
   * Create a new dashboard with widget builder and chart associations.
   * Validates each widget builder and chart exists, checks user privileges.
   */
  async save(dto: SaveDashboardDto, currentUserId: string): Promise<string> {
    const widgetBuilderIds = new Set<string>();
    const chartIds = new Set<string>();
    const id = v4();

    for (const chartObj of dto.charts) {
      if (chartObj.isTitle === true) continue;

      const wb = await this.widgetBuilderRepo.findOne({
        where: { id: chartObj.widgetBuilderId },
        select: { id: true },
      });
      if (!wb) {
        throw new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST);
      }

      await this.checkWidgetBuilderPrivilege(wb.id, currentUserId);
      widgetBuilderIds.add(wb.id);

      const chart = await this.wbChartsRepo.findOne({
        where: { id: chartObj.chartId },
        select: { id: true },
      });
      if (!chart) {
        throw new BadRequestException(ErrorMessages.CHART_NOT_FOUND);
      }
      chartIds.add(chart.id);
    }

    await this.addDashboardToDb(id, currentUserId, dto.name, dto.charts, widgetBuilderIds, chartIds);
    return id;
  }

  /**
   * Update an existing dashboard: replace widget builder/chart associations.
   */
  async update(dto: EditDashboardDto, currentUserId: string): Promise<void> {
    const exists = await this.dashboardExists(dto.id);
    if (!exists) {
      throw new BadRequestException(ErrorMessages.DASHBOARD_DOES_NOT_EXIST);
    }

    const widgetBuilderIds = new Set<string>();
    const chartIds = new Set<string>();

    for (const chartObj of dto.charts) {
      if (chartObj.isTitle === true) continue;

      const wb = await this.widgetBuilderRepo.findOne({
        where: { id: chartObj.widgetBuilderId },
        select: { id: true },
      });
      if (!wb) {
        throw new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST);
      }
      widgetBuilderIds.add(wb.id);

      await this.checkWidgetBuilderPrivilege(wb.id, currentUserId);

      const chart = await this.wbChartsRepo.findOne({
        where: { id: chartObj.chartId },
        select: { id: true },
      });
      if (!chart) {
        throw new BadRequestException(ErrorMessages.CHART_NOT_FOUND);
      }
      chartIds.add(chart.id);
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          CoreDashboard,
          { id: dto.id },
          {
            ownerId: currentUserId,
            name: dto.name,
            options: JSON.stringify(dto.charts),
            updatedAt: new Date(),
          },
        );

        // Delete old associations, re-insert new ones
        await manager.delete(CoreDashboardWidgetBuilder, { dashboardId: dto.id });
        await manager.delete(CoreDashboardChart, { dashboardId: dto.id });

        await this.bulkInsertWbAndCharts(manager, dto.id, widgetBuilderIds, chartIds);
      });
    } catch (_error) {
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    }
  }

  /**
   * List dashboards for user: own + default + shared.
   * Filters by widget builder table privileges.
   */
  async list(currentUserId: string): Promise<ListDashboardDto[]> {
    const listQuery = `
      SELECT
        id, name, ownerId, isFavorite,
        (SELECT userName FROM core_application_users WHERE id = ownerId) AS owner,
        false AS isShared,
        DATE_FORMAT(createdAt, "%Y-%m-%d %H:%i") AS createdAt,
        DATE_FORMAT(updatedAt, "%Y-%m-%d %H:%i") AS updatedAt,
        isDefault
      FROM core_dashboard
      WHERE ownerId = ? OR isDefault = 1

      UNION

      SELECT
        sd.id AS id, d.name AS name, d.ownerId,
        sd.isFavorite,
        (SELECT userName FROM core_application_users WHERE id = d.ownerId) AS owner,
        true AS isShared,
        DATE_FORMAT(sd.createdAt, "%Y-%m-%d %H:%i") AS createdAt,
        DATE_FORMAT(d.updatedAt, "%Y-%m-%d %H:%i") AS updatedAt,
        0 AS isDefault
      FROM core_shared_dashboard sd, core_dashboard d
      WHERE sd.ownerId = ? AND sd.dashboardId = d.id

      ORDER BY \`isDefault\` DESC, isFavorite DESC,
        \`updatedAt\` DESC, \`createdAt\` DESC, name DESC`;

    const dashboards: ListDashboardDto[] = await this.dataSource.query(listQuery, [currentUserId, currentUserId]);

    // Get user's privileged tables
    const privilegedTablesQuery = `
      SELECT GROUP_CONCAT(CONCAT('"', id, '"')) AS privilegedTables
      FROM core_modules_tables
      WHERE mId IN (
        SELECT ModuleId FROM core_privileges
        WHERE UserId = ?
        AND RoleId IN (
          SELECT id FROM core_application_roles
          WHERE name != ?
        )
      )`;

    const privilegedTableResult: Array<{ privilegedTables: string }> = await this.dataSource.query(
      privilegedTablesQuery,
      [currentUserId, AvailableRoles.DEFAULT],
    );

    const privilegedTablesRaw = privilegedTableResult[0]?.privilegedTables;
    const privilegedTables: string[] = privilegedTablesRaw ? JSON.parse('[' + privilegedTablesRaw + ']') : [];

    const response: ListDashboardDto[] = [];

    // Collect non-shared dashboard IDs for batch privilege check
    const nonSharedIds = dashboards.filter((d) => !d.isShared && currentUserId !== DEFAULT_ADMIN_ID).map((d) => d.id);

    // Batch fetch used tables for all non-shared dashboards (fixes N+1)
    const usedTablesMap = new Map<string, string[]>();
    if (nonSharedIds.length > 0) {
      const batchResult: Array<{ dashboardId: string; tableId: string }> = await this.dataSource.query(
        `SELECT dwb.dashboardId, wbut.tableId
         FROM core_dashboard_widget_builder dwb
         INNER JOIN core_widget_builder_used_tables wbut ON dwb.widgetBuilderId = wbut.widgetBuilderId
         WHERE dwb.dashboardId IN (?)`,
        [nonSharedIds],
      );
      for (const row of batchResult) {
        if (!usedTablesMap.has(row.dashboardId)) {
          usedTablesMap.set(row.dashboardId, []);
        }
        usedTablesMap.get(row.dashboardId)!.push(row.tableId);
      }
    }

    let index = dashboards.length;
    while (index--) {
      const dashboard = dashboards[index];

      if (dashboard.isShared || currentUserId === DEFAULT_ADMIN_ID) {
        response.push(dashboard);
        continue;
      }

      const usedTables = usedTablesMap.get(dashboard.id) || [];
      const hasPriv = usedTables.every((tableId) => privilegedTables.includes(tableId));
      if (hasPriv) {
        response.push(dashboard);
      }
    }

    return response.reverse();
  }

  /**
   * Get dashboard by ID (for owner access).
   */
  async getById(id: string): Promise<DashboardDto> {
    const dashboard = await this.dashboardRepo.findOne({
      where: { id },
      select: { name: true, ownerId: true, options: true, isDefault: true },
    });
    if (!dashboard) {
      throw new BadRequestException(ErrorMessages.DASHBOARD_DOES_NOT_EXIST);
    }

    return {
      name: dashboard.name,
      ownerId: dashboard.ownerId,
      charts: dashboard.options ? JSON.parse(dashboard.options) : [],
      isDefault: dashboard.isDefault,
    };
  }

  /**
   * Get any dashboard by ID — checks both own and shared.
   * Used for the /open/:id endpoint (public-style access).
   */
  async getAnyById(dashboardId: string): Promise<DashboardDto> {
    const anyQuery = `
      SELECT id, name, ownerId, options, isDefault
      FROM core_dashboard WHERE id = ?
      UNION
      SELECT sd.id AS id, d.name, d.ownerId, d.options, false AS isDefault
      FROM core_shared_dashboard sd, core_dashboard d
      WHERE sd.id = ? AND sd.dashboardId = d.id`;

    const results = await this.dataSource.query(anyQuery, [dashboardId, dashboardId]);
    if (results.length === 0) {
      throw new BadRequestException(ErrorMessages.DASHBOARD_DOES_NOT_EXIST);
    }

    return {
      name: results[0].name,
      ownerId: results[0].ownerId,
      charts: results[0].options ? JSON.parse(results[0].options) : [],
      isDefault: results[0].isDefault,
    };
  }

  /**
   * Share a dashboard with multiple users.
   */
  async share(dashboardId: string, userIds: string[]): Promise<void> {
    const exists = await this.dashboardExists(dashboardId);
    if (!exists) {
      throw new BadRequestException(ErrorMessages.DASHBOARD_DOES_NOT_EXIST);
    }

    try {
      if (userIds.length > 0) {
        const entities = userIds.map((userId) => ({
          dashboardId,
          ownerId: userId,
          createdAt: new Date(),
        }));
        await this.sharedDashboardRepo.insert(entities);
      }
    } catch (_error) {
      throw new BadRequestException(ErrorMessages.ERROR_SHARE);
    }
  }

  /**
   * Get shared dashboard by its shared ID.
   */
  async getSharedById(sharedId: string): Promise<DashboardDto> {
    const sharedQuery = `
      SELECT sd.id, sd.dashboardId, sd.ownerId, d.name, d.options, d.isDefault
      FROM core_shared_dashboard sd
      LEFT JOIN core_dashboard d ON sd.dashboardId = d.id
      WHERE sd.id = ?`;

    const results = await this.dataSource.query(sharedQuery, [sharedId]);
    if (results.length === 0) {
      throw new NotFoundException(ErrorMessages.SHARED_DAHBOARD_DOES_NOT_EXIST);
    }

    return {
      name: results[0].name,
      ownerId: results[0].ownerId,
      charts: results[0].options ? JSON.parse(results[0].options) : [],
      isDefault: results[0].isDefault,
    };
  }

  /**
   * Duplicate a shared dashboard: creates new dashboard + duplicates widget builders.
   */
  async saveShared(sharedId: string, currentUserId: string): Promise<string> {
    const sharedDashboard = await this.getSharedById(sharedId);

    const widgetBuilderIds = new Set<string>();
    const chartIds = new Set<string>();
    const widgetBuilderCharts = sharedDashboard.charts;
    const id = v4();

    // Group chart objects by widgetBuilderId to avoid duplicating the same WB multiple times
    const wbIndexMapping: Record<string, number[]> = {};
    for (let i = 0; i < widgetBuilderCharts.length; i++) {
      const widget = widgetBuilderCharts[i];
      if (widget.isTitle === true) continue;
      if (!wbIndexMapping[widget.widgetBuilderId]) {
        wbIndexMapping[widget.widgetBuilderId] = [i];
      } else {
        wbIndexMapping[widget.widgetBuilderId].push(i);
      }
    }

    const duplicatedWbIds: string[] = [];

    for (const widgetBuilderId of Object.keys(wbIndexMapping)) {
      const indexes = wbIndexMapping[widgetBuilderId];
      const dupResult = await this.widgetBuilderService.duplicate(widgetBuilderId, currentUserId);
      if (!dupResult) {
        await this.widgetBuilderService.cleanWidgetBuilders(duplicatedWbIds);
        throw new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST);
      }
      const dupWbId = dupResult.widgetBuilderId;
      duplicatedWbIds.push(dupWbId);

      await this.checkWidgetBuilderPrivilege(dupWbId, currentUserId);
      widgetBuilderIds.add(dupWbId);

      for (const idx of indexes) {
        const chartObj = widgetBuilderCharts[idx];
        const dupChartId = dupResult.charts[chartObj.chartId];
        const chart = await this.wbChartsRepo.findOne({
          where: { id: dupChartId },
          select: { id: true },
        });
        if (!chart) {
          await this.widgetBuilderService.cleanWidgetBuilders(duplicatedWbIds);
          throw new BadRequestException(ErrorMessages.CHART_NOT_FOUND);
        }
        chartIds.add(chart.id);

        widgetBuilderCharts[idx].chartId = dupChartId;
        widgetBuilderCharts[idx].widgetBuilderId = dupWbId;
      }
    }

    try {
      await this.addDashboardToDb(
        id,
        currentUserId,
        sharedDashboard.name,
        widgetBuilderCharts,
        widgetBuilderIds,
        chartIds,
      );
    } catch (error) {
      await this.widgetBuilderService.cleanWidgetBuilders(duplicatedWbIds);
      throw new BadRequestException((error as Error).message);
    }

    return id;
  }

  /**
   * Duplicate a default dashboard for the current user.
   */
  async saveDefault(dashboardId: string, currentUserId: string): Promise<string> {
    const dashboard = await this.getById(dashboardId);
    if (!dashboard.isDefault) {
      throw new BadRequestException(ErrorMessages.DASHBOARD_NOT_DEFAULT);
    }

    const widgetBuilderIds = new Set<string>();
    const chartIds = new Set<string>();
    const widgetBuilderCharts = dashboard.charts;
    const id = v4();

    const wbIndexMapping: Record<string, number[]> = {};
    for (let i = 0; i < widgetBuilderCharts.length; i++) {
      const widget = widgetBuilderCharts[i];
      if (widget.isTitle === true) continue;
      if (!wbIndexMapping[widget.widgetBuilderId]) {
        wbIndexMapping[widget.widgetBuilderId] = [i];
      } else {
        wbIndexMapping[widget.widgetBuilderId].push(i);
      }
    }

    const duplicatedWbIds: string[] = [];

    for (const widgetBuilderId of Object.keys(wbIndexMapping)) {
      const indexes = wbIndexMapping[widgetBuilderId];
      const dupResult = await this.widgetBuilderService.duplicate(widgetBuilderId, currentUserId);
      if (!dupResult) {
        await this.widgetBuilderService.cleanWidgetBuilders(duplicatedWbIds);
        throw new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST);
      }
      const dupWbId = dupResult.widgetBuilderId;
      duplicatedWbIds.push(dupWbId);

      await this.checkWidgetBuilderPrivilege(dupWbId, currentUserId);
      widgetBuilderIds.add(dupWbId);

      for (const idx of indexes) {
        const chartObj = widgetBuilderCharts[idx];
        const dupChartId = dupResult.charts[chartObj.chartId];
        const chart = await this.wbChartsRepo.findOne({
          where: { id: dupChartId },
          select: { id: true },
        });
        if (!chart) {
          await this.widgetBuilderService.cleanWidgetBuilders(duplicatedWbIds);
          throw new BadRequestException(ErrorMessages.CHART_NOT_FOUND);
        }
        chartIds.add(chart.id);

        widgetBuilderCharts[idx].chartId = dupChartId;
        widgetBuilderCharts[idx].widgetBuilderId = dupWbId;
      }
    }

    try {
      await this.addDashboardToDb(id, currentUserId, dashboard.name, widgetBuilderCharts, widgetBuilderIds, chartIds);
    } catch (error) {
      await this.widgetBuilderService.cleanWidgetBuilders(duplicatedWbIds);
      throw new BadRequestException((error as Error).message);
    }

    return id;
  }

  /**
   * Toggle favorite status on a dashboard or shared dashboard.
   */
  async favorite(id: string, isShared: boolean): Promise<boolean> {
    if (isShared) {
      const shared = await this.sharedDashboardRepo.findOne({
        where: { id },
        select: { isFavorite: true },
      });
      if (!shared) {
        throw new NotFoundException(ErrorMessages.SHARED_DAHBOARD_DOES_NOT_EXIST);
      }
      const newFav = !shared.isFavorite;
      await this.sharedDashboardRepo.update({ id }, { isFavorite: newFav });
      return newFav;
    }

    const dashboard = await this.dashboardRepo.findOne({
      where: { id },
      select: { isFavorite: true },
    });
    if (!dashboard) {
      throw new NotFoundException(ErrorMessages.DASHBOARD_DOES_NOT_EXIST);
    }
    const newFav = !dashboard.isFavorite;
    await this.dashboardRepo.update({ id }, { isFavorite: newFav });
    return newFav;
  }

  /**
   * Check if user has privilege on all widget builders in a dashboard.
   */
  async hasPrivilege(dashboardId: string, userId: string): Promise<void> {
    const wbs = await this.dashboardWbRepo.find({
      where: { dashboardId },
      select: { widgetBuilderId: true },
    });
    for (const wb of wbs) {
      await this.checkWidgetBuilderPrivilege(wb.widgetBuilderId, userId);
    }
  }

  /**
   * Check if a dashboard ID is a shared dashboard.
   */
  async isSharedDashboard(id: string): Promise<boolean> {
    const exists = await this.sharedDashboardRepo.createQueryBuilder('sd').where('sd.id = :id', { id }).getExists();
    return exists;
  }

  /**
   * Log a dashboard error (fire-and-forget).
   */
  async logError(dashboardId: string, widgetBuilderId: string, chartId: string, errorStack: string): Promise<void> {
    try {
      await this.dashboardErrorRepo.save({
        dashboardId,
        widgetBuilderId,
        chartId,
        errorstack: errorStack,
        errorDate: new Date(),
      });
    } catch (err) {
      this.logger.warn(`Failed to log dashboard error: ${(err as Error).message}`);
    }
  }

  // --------------- Private helpers ---------------

  private async dashboardExists(id: string): Promise<boolean> {
    const result = await this.dashboardRepo.createQueryBuilder('d').where('d.id = :id', { id }).getExists();
    return result;
  }

  private async checkWidgetBuilderPrivilege(widgetBuilderId: string, userId: string): Promise<void> {
    const usedTablesQuery = `
      SELECT GROUP_CONCAT(CONCAT('"', tableId, '"')) AS usedTables
      FROM core_widget_builder_used_tables WHERE widgetBuilderId = ?`;

    const usedTablesResult: Array<{ usedTables: string }> = await this.dataSource.query(usedTablesQuery, [
      widgetBuilderId,
    ]);

    const raw = usedTablesResult[0]?.usedTables;
    if (!raw) return; // no tables used — no restriction

    let usedTables: string[] = JSON.parse('[' + raw + ']');
    usedTables = usedTables.length === 1 && usedTables[0] == null ? [] : usedTables;

    if (usedTables.length === 0) return;

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

    const privilegedResult: Array<{ privilegedTables: string }> = await this.dataSource.query(privilegedTablesQuery, [
      userId,
      AvailableRoles.DEFAULT,
    ]);

    const privRaw = privilegedResult[0]?.privilegedTables;
    const privilegedTables: string[] = privRaw ? JSON.parse('[' + privRaw + ']') : [];

    const hasPriv = usedTables.every((tableId) => privilegedTables.includes(tableId));
    if (!hasPriv) {
      throw new ForbiddenException(ErrorMessages.ACCESS_DENIED);
    }
  }

  private async addDashboardToDb(
    id: string,
    userId: string,
    name: string,
    charts: DashboardChartsDto[],
    widgetBuilderIds: Set<string>,
    chartIds: Set<string>,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(CoreDashboard, {
          id,
          ownerId: userId,
          name,
          createdAt: new Date(),
          options: JSON.stringify(charts),
        });

        await this.bulkInsertWbAndCharts(manager, id, widgetBuilderIds, chartIds);
      });
    } catch (_error) {
      throw new BadRequestException(ErrorMessages.ERROR_SAVE);
    }
  }

  private async bulkInsertWbAndCharts(
    manager: EntityManager,
    dashboardId: string,
    widgetBuilderIds: Set<string>,
    chartIds: Set<string>,
  ): Promise<void> {
    if (widgetBuilderIds.size > 0) {
      const wbEntities = Array.from(widgetBuilderIds).map((wbId) => ({
        dashboardId,
        widgetBuilderId: wbId,
      }));
      await manager.insert(CoreDashboardWidgetBuilder, wbEntities);
    }

    if (chartIds.size > 0) {
      const chartEntities = Array.from(chartIds).map((cId) => ({
        dashboardId,
        chartId: cId,
      }));
      await manager.insert(CoreDashboardChart, chartEntities);
    }
  }
}
