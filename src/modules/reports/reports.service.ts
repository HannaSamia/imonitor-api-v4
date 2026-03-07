import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 } from 'uuid';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportCharts } from '../../database/entities/core-report-charts.entity';
import { CoreReportModule } from '../../database/entities/core-report-module.entity';
import { CoreReportUsedTable } from '../../database/entities/core-report-used-table.entity';
import { CoreSharedReport } from '../../database/entities/core-shared-report.entity';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { DEFAULT_ADMIN_ID } from '../../shared/constants/auth.constants';
import { ExportHelperService } from '../../shared/services/export-helper.service';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { FETCH_CHART_DB_FUNCTION, REPORT_TABLE_CHART_DEFAULT_VALUE, REPORT_TABLE_ID } from './constants';
import { ChartStatus, ChartTypes } from './enums';
import { QueryBuilderService } from './services/query-builder.service';
import { generatePie as generatePieChart } from './charts/pie.chart';
import { generateDoughnut as generateDoughnutChart } from './charts/doughnut.chart';
import { generateTrend as generateTrendChart } from './charts/trend.chart';
import { generateVerticalBar as generateVerticalBarChart } from './charts/vertical-bar.chart';
import { generateHorizontalBar as generateHorizontalBarChart } from './charts/horizontal-bar.chart';
import { generateProgress as generateProgressChart } from './charts/progress.chart';
import { generateExplodedProgress as generateExplodedProgressChart } from './charts/exploded-progress.chart';
import { deepCopy, emptyReportChartByType } from './charts/chart-helpers';
import { exportReportHTMLScript } from './utils/export-html-templates';
import {
  SaveReportDto,
  EditReportDto,
  RenameReportDto,
  ChangeReportOwnerDto,
  ShareReportDto,
  GenerateReportDto,
  GenerateChartByTypeDto,
  ReportResponseDto,
  ListReportDto,
  ExecuteQueryResultDto,
  SideTablesDto,
  IChartData,
  IPrivilegeTableField,
  PrivilegedTableDto,
} from './dto';

/** Module table type filter value matching v3 ModuleTableTypes.STATISTICS */
const TABLE_TYPE_STATISTICS = 'statistics';

/** Ref table key matching v3 REF_TABLE_KEY */
const REF_TABLE_KEY = 'refTable';

/**
 * Safely parse a JSON string, returning null if input is null/undefined or malformed.
 */
function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  private readonly coreDbName: string;

  constructor(
    @InjectRepository(CoreReport)
    private readonly reportRepo: Repository<CoreReport>,
    @InjectRepository(CoreReportCharts)
    private readonly chartRepo: Repository<CoreReportCharts>,
    @InjectRepository(CoreReportModule)
    private readonly reportModuleRepo: Repository<CoreReportModule>,
    @InjectRepository(CoreReportUsedTable)
    private readonly reportUsedTableRepo: Repository<CoreReportUsedTable>,
    @InjectRepository(CoreSharedReport)
    private readonly sharedReportRepo: Repository<CoreSharedReport>,
    @InjectRepository(CoreModulesTables)
    private readonly modulesTablesRepo: Repository<CoreModulesTables>,
    @InjectRepository(CoreTablesField)
    private readonly tablesFieldRepo: Repository<CoreTablesField>,
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
    @InjectRepository(CoreApplicationUsers)
    private readonly usersRepo: Repository<CoreApplicationUsers>,
    private readonly dataSource: DataSource,
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly dateHelper: DateHelperService,
    private readonly queryBuilder: QueryBuilderService,
    private readonly exportHelper: ExportHelperService,
    private readonly configService: ConfigService,
  ) {
    this.coreDbName = this.configService.get<string>('coreDbName', '`iMonitorV3_1`');
  }

  // --- CRUD ---

  /**
   * Get statistics tables the user has privilege on (non-default role),
   * including the ref table and per-table fields.
   * Mirrors v3 privilegedStatisticTables().
   */
  async privilegedStatisticTables(userId: string): Promise<SideTablesDto> {
    // Query tables the user has access to via privileges (non-default role)
    const tablesQuery = `
      SELECT
        mt.id,
        mt.displayName,
        (SELECT name FROM core_application_roles WHERE id =
          (SELECT RoleId FROM core_privileges WHERE UserId = ? AND
            ModuleId = (SELECT mId FROM core_modules_tables WHERE id = mt.id))) AS role
      FROM core_modules_tables mt
      WHERE mId IN (
        SELECT ModuleId FROM core_privileges
        WHERE UserId = ?
        AND RoleId <> (SELECT Id FROM core_application_roles WHERE name = ?)
      )
      AND tableType = ?
      AND tableName <> ?
      ORDER BY displayName
    `;

    const sideTables: Array<{ id: string; displayName: string; role: string }> = await this.dataSource.query(
      tablesQuery,
      [userId, userId, AvailableRoles.DEFAULT, TABLE_TYPE_STATISTICS, REF_TABLE_KEY],
    );

    if (sideTables.length === 0) {
      throw new BadRequestException(ErrorMessages.NO_PRIVILEGED_TABLES);
    }

    // Fetch fields for each table in parallel
    const fieldsPromises = sideTables.map((table, index) => this.fetchTableFields(table.id, table.role, index));
    const fulfilledResults = await Promise.all(fieldsPromises);

    const statisticTables: PrivilegedTableDto[] = sideTables.map((table) => ({
      id: table.id,
      displayName: table.displayName,
      role: table.role,
      fields: [],
    }));

    for (const res of fulfilledResults) {
      statisticTables[res.index].fields = res.fields;
    }

    // Fetch the ref table separately
    const refTable = await this.fetchRefTable(userId);

    return {
      refTable,
      tables: statisticTables,
    };
  }

  /**
   * List all reports for the current user: own reports, default reports, and shared reports.
   * Filters out reports where user lacks privilege on used tables.
   * Mirrors v3 list().
   */
  async list(userId: string): Promise<ListReportDto[]> {
    const selectQuery = `
      SELECT
        id,
        name,
        isFavorite,
        false AS isShared,
        DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') AS createdAt,
        DATE_FORMAT(updatedAt, '%Y-%m-%d %H:%i') AS updatedAt,
        isDefault,
        ownerId,
        isQbe,
        (SELECT userName FROM core_application_users WHERE id = ownerId) AS owner
      FROM core_report
      WHERE ownerId = ? OR isDefault = 1

      UNION

      SELECT
        sr.id AS id,
        r.name AS name,
        sr.isFavorite AS isFavorite,
        true AS isShared,
        DATE_FORMAT(sr.createdAt, '%Y-%m-%d %H:%i') AS createdAt,
        DATE_FORMAT(r.updatedAt, '%Y-%m-%d %H:%i') AS updatedAt,
        0 AS isDefault,
        r.ownerId,
        r.isQbe,
        (SELECT userName FROM core_application_users WHERE id = r.ownerId) AS owner
      FROM core_shared_report sr, core_report r
      WHERE sr.ownerId = ? AND sr.reportId = r.id
      ORDER BY \`isDefault\` DESC, isFavorite DESC, updatedAt DESC, createdAt DESC, name DESC
    `;

    const reports: ListReportDto[] = await this.dataSource.query(selectQuery, [userId, userId]);

    // Get user's privileged tables
    const privilegedTablesQuery = `
      SELECT GROUP_CONCAT(CONCAT('"', id, '"')) AS privilegedTables
      FROM core_modules_tables
      WHERE mId IN (
        SELECT ModuleId FROM core_privileges
        WHERE UserId = ?
        AND RoleId IN (
          SELECT id FROM core_application_roles
          WHERE name = ? OR name = ? OR name = ? OR name = ?
        )
      )
    `;

    const privilegedTableResult: Array<{ privilegedTables: string }> = await this.dataSource.query(
      privilegedTablesQuery,
      [userId, AvailableRoles.USER, AvailableRoles.SUPER_USER, AvailableRoles.ADMIN, AvailableRoles.SUPER_ADMIN],
    );

    const privilegedTablesRaw = privilegedTableResult[0]?.privilegedTables;
    const privilegedTables: string[] = privilegedTablesRaw ? JSON.parse('[' + privilegedTablesRaw + ']') : [];

    // Filter reports where user does NOT have privilege on all used tables
    let reportsIndex = reports.length;
    while (reportsIndex--) {
      const report = reports[reportsIndex];

      if (report.isShared || userId === DEFAULT_ADMIN_ID) {
        continue;
      }

      const usedTablesQuery = `
        SELECT GROUP_CONCAT(CONCAT('"', tableId, '"')) AS usedTables
        FROM core_report_used_table
        WHERE reportId = ?
      `;

      const usedTablesResult: Array<{ usedTables: string }> = await this.dataSource.query(usedTablesQuery, [report.id]);

      const usedTablesRaw = usedTablesResult[0]?.usedTables;
      let usedTables: string[] = usedTablesRaw ? JSON.parse('[' + usedTablesRaw + ']') : [];
      usedTables = usedTables.length === 1 && usedTables[0] == null ? [] : usedTables;

      const hasPriv = usedTables.every((tableId) => privilegedTables.includes(tableId));

      if (!hasPriv) {
        reports.splice(reportsIndex, 1);
      }
    }

    return reports;
  }

  /**
   * Get a single report by ID with parsed JSON columns and loaded charts.
   * Mirrors v3 getReportById().
   */
  async getReportById(reportId: string, userId: string, checkAccess = true): Promise<ReportResponseDto> {
    const dbReport = await this.reportRepo.findOne({ where: { id: reportId } });

    if (!dbReport) {
      throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST);
    }

    if (userId !== dbReport.ownerId && !dbReport.isDefault && checkAccess) {
      throw new BadRequestException(ErrorMessages.ACCESS_DENIED);
    }

    const report: ReportResponseDto = {
      id: dbReport.id,
      name: dbReport.name,
      ownerId: dbReport.ownerId,
      timeFilter: dbReport.timeFilter,
      isFavorite: !!dbReport.isFavorite,
      isDefault: !!dbReport.isDefault,
      createdAt: dbReport.createdAt as unknown as string,
      updatedAt: dbReport.updatedAt as unknown as string,
      fromDate: dbReport.fromDate as unknown as string,
      toDate: dbReport.toDate as unknown as string,
      limit: dbReport.limit as number,
      tables: safeJsonParse(dbReport.tables) || [],
      globalFilter: safeJsonParse(dbReport.globalFilter) || {},
      orderBy: safeJsonParse(dbReport.orderBy) || [],
      control: safeJsonParse(dbReport.control) || [],
      operation: safeJsonParse(dbReport.operation) || [],
      compare: safeJsonParse(dbReport.compare) || [],
      options: safeJsonParse(dbReport.options) || { threshold: {}, isFooterAggregation: false, globalFieldIndex: 0 },
      globalOrderIndex: dbReport.globalOrderIndex || 0,
      isQbe: !!dbReport.isQbe,
      charts: [],
    };

    // Load charts using JSON_INSERT DB function to merge metadata into data column
    const reportChartsQuery = `
      SELECT ${FETCH_CHART_DB_FUNCTION} AS data
      FROM core_report_charts WHERE reportId = ? ORDER BY orderIndex
    `;
    const reportChartsResult: Array<{ data: string }> = await this.dataSource.query(reportChartsQuery, [report.id]);

    for (const chartResult of reportChartsResult) {
      const chart = JSON.parse(chartResult.data) as IChartData;
      report.charts.push(chart);
    }

    return report;
  }

  /**
   * Get a shared report by its shared entry ID. Loads the original report data
   * and its charts via the original report's reportId.
   * Mirrors v3 getSharedReportById().
   */
  async getSharedReportById(sharedReportId: string, userId: string): Promise<ReportResponseDto> {
    const selectQuery = `
      SELECT
        sr.id,
        sr.reportId,
        sr.isFavorite,
        sr.ownerId,
        r.name,
        FALSE AS isDefault,
        r.createdAt,
        r.updatedAt,
        r.fromDate,
        r.toDate,
        r.\`limit\`,
        r.tables,
        r.globalFilter,
        r.timeFilter,
        r.options,
        r.orderBy,
        r.control,
        r.operation,
        r.compare,
        r.globalOrderIndex,
        r.isQbe
      FROM core_shared_report sr
      LEFT JOIN core_report r ON sr.reportId = r.id
      WHERE sr.id = ? AND sr.ownerId = ?
    `;

    const sharedReportResult: Array<Record<string, unknown>> = await this.dataSource.query(selectQuery, [
      sharedReportId,
      userId,
    ]);

    if (sharedReportResult.length <= 0) {
      throw new BadRequestException(ErrorMessages.SHARED_REPORT_DOES_NOT_EXIST);
    }

    const sr = sharedReportResult[0];

    const report: ReportResponseDto = {
      id: sr.id as string,
      name: sr.name as string,
      ownerId: sr.ownerId as string,
      timeFilter: sr.timeFilter as string,
      isFavorite: !!sr.isFavorite,
      isDefault: !!sr.isDefault,
      createdAt: sr.createdAt as string,
      updatedAt: sr.updatedAt as string,
      fromDate: sr.fromDate as string,
      toDate: sr.toDate as string,
      limit: sr.limit as number,
      tables: safeJsonParse(sr.tables as string) || [],
      globalFilter: safeJsonParse(sr.globalFilter as string) || {},
      orderBy: safeJsonParse(sr.orderBy as string) || [],
      control: safeJsonParse(sr.control as string) || [],
      operation: safeJsonParse(sr.operation as string) || [],
      compare: safeJsonParse(sr.compare as string) || [],
      options: safeJsonParse(sr.options as string) || {
        threshold: {},
        isFooterAggregation: false,
        globalFieldIndex: 0,
      },
      globalOrderIndex: (sr.globalOrderIndex as number) || 0,
      isQbe: !!sr.isQbe,
      charts: [],
    };

    // Load charts from the ORIGINAL report (not the shared entry)
    const reportChartsQuery = `
      SELECT ${FETCH_CHART_DB_FUNCTION} AS data
      FROM core_report_charts WHERE reportId = ? ORDER BY orderIndex
    `;
    const reportChartsResult: Array<{ data: string }> = await this.dataSource.query(reportChartsQuery, [
      sr.reportId as string,
    ]);

    for (const chartResult of reportChartsResult) {
      const chart = JSON.parse(chartResult.data) as IChartData;
      report.charts.push(chart);
    }

    return report;
  }

  /**
   * Save a new report with its charts, modules, and used tables.
   * Uses a transaction (QueryRunner) for atomicity.
   * Mirrors v3 save().
   */
  async save(dto: SaveReportDto, userId: string): Promise<string> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const id = v4();
    const reportModules = new Set<string>();
    const reportTables: Array<[string, string, string]> = [];

    try {
      // Look up moduleId for each table
      for (const table of dto.tables) {
        const moduleTable = await queryRunner.manager.findOne(CoreModulesTables, {
          where: { id: table.id },
          select: { mId: true },
        });
        if (moduleTable) {
          reportModules.add(String(moduleTable.mId));
          reportTables.push([id, table.id, table.displayName]);
        }
      }

      // Insert the report
      await queryRunner.manager.insert(CoreReport, {
        id,
        name: dto.name,
        fromDate: dto.fromDate as unknown as Date,
        toDate: dto.toDate as unknown as Date,
        timeFilter: dto.timeFilter as CoreReport['timeFilter'],
        limit: dto.limit,
        tables: JSON.stringify(dto.tables),
        control: JSON.stringify(dto.control),
        compare: JSON.stringify(dto.compare),
        operation: JSON.stringify(dto.operation),
        globalFilter: JSON.stringify(dto.globalFilter),
        orderBy: JSON.stringify(dto.orderBy),
        options: JSON.stringify(dto.options),
        ownerId: userId,
        globalOrderIndex: dto.globalOrderIndex,
        createdAt: this.dateHelper.formatDate() as unknown as Date,
      });

      // Insert charts
      if (dto.charts && dto.charts.length > 0) {
        const chartInserts = dto.charts.map((chart) => {
          const dataObject = { ...chart };
          delete (dataObject as Record<string, unknown>).id;
          delete (dataObject as Record<string, unknown>).name;
          delete (dataObject as Record<string, unknown>).type;
          delete (dataObject as Record<string, unknown>).orderIndex;
          return {
            id: chart.id || v4(),
            name: chart.name,
            type: chart.type,
            orderIndex: chart.orderIndex,
            data: JSON.stringify(dataObject),
            createdAt: this.dateHelper.formatDate() as unknown as Date,
            createdBy: userId,
            reportId: id,
          };
        });
        await queryRunner.manager.insert(CoreReportCharts, chartInserts);
      }

      // Insert report-module associations
      if (reportModules.size > 0) {
        const moduleInserts = Array.from(reportModules).map((moduleId) => ({
          reportId: id,
          moduleId,
        }));
        await queryRunner.manager.insert(CoreReportModule, moduleInserts);
      }

      // Insert used tables
      if (reportTables.length > 0) {
        const usedTableInserts = reportTables.map(([reportId, tableId, tableName]) => ({
          reportId,
          tableId,
          tableName,
        }));
        await queryRunner.manager.insert(CoreReportUsedTable, usedTableInserts);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error saving report', error);
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_REPORT);
    } finally {
      await queryRunner.release();
    }

    return id;
  }

  /**
   * Update an existing report: update report fields, re-insert modules/used-tables,
   * and process chart changes by status (created/edited/deleted).
   * Mirrors v3 update().
   */
  async update(dto: EditReportDto, userId: string): Promise<void> {
    const id = dto.id;
    const reportModules = new Set<string>();
    const reportTables: Array<[string, string, string]> = [];

    // Look up moduleId for each table (read-only, outside transaction)
    for (const table of dto.tables) {
      const moduleTable = await this.modulesTablesRepo.findOne({
        where: { id: table.id },
        select: { mId: true },
      });
      if (moduleTable) {
        reportModules.add(String(moduleTable.mId));
        reportTables.push([id, table.id, table.displayName]);
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update the report
      await queryRunner.manager.update(
        CoreReport,
        { id },
        {
          name: dto.name,
          fromDate: dto.fromDate as unknown as Date,
          toDate: dto.toDate as unknown as Date,
          timeFilter: dto.timeFilter as CoreReport['timeFilter'],
          limit: dto.limit,
          tables: JSON.stringify(dto.tables),
          control: JSON.stringify(dto.control),
          compare: JSON.stringify(dto.compare),
          operation: JSON.stringify(dto.operation),
          globalFilter: JSON.stringify(dto.globalFilter),
          orderBy: JSON.stringify(dto.orderBy),
          options: JSON.stringify(dto.options),
          globalOrderIndex: dto.globalOrderIndex,
          updatedAt: this.dateHelper.formatDate() as unknown as Date,
        },
      );

      // Delete and re-insert report modules and used tables
      await queryRunner.manager.delete(CoreReportModule, { reportId: id });
      await queryRunner.manager.delete(CoreReportUsedTable, { reportId: id });

      if (reportModules.size > 0) {
        const moduleInserts = Array.from(reportModules).map((moduleId) => ({
          reportId: id,
          moduleId,
        }));
        await queryRunner.manager.insert(CoreReportModule, moduleInserts);
      }

      if (reportTables.length > 0) {
        const usedTableInserts = reportTables.map(([rId, tableId, tableName]) => ({
          reportId: rId,
          tableId,
          tableName,
        }));
        await queryRunner.manager.insert(CoreReportUsedTable, usedTableInserts);
      }

      // Process charts by status
      const chartsStatus = { ...dto.chartsStatus };

      for (const chart of dto.charts) {
        const dataObject = { ...chart };
        delete (dataObject as Record<string, unknown>).id;
        delete (dataObject as Record<string, unknown>).name;
        delete (dataObject as Record<string, unknown>).type;
        const dataString = JSON.stringify(dataObject);

        if (chartsStatus[chart.id] !== undefined) {
          if (chartsStatus[chart.id] === ChartStatus.EDITED) {
            const isUsed = await this.isDefaultChart(chart.id);
            if (isUsed) {
              throw new BadRequestException(ErrorMessages.CHART_ERROR_DEFAULT);
            }
            await queryRunner.manager.update(
              CoreReportCharts,
              { id: chart.id },
              {
                name: chart.name,
                type: chart.type,
                orderIndex: chart.orderIndex,
                data: dataString,
              },
            );
          } else if (chartsStatus[chart.id] === ChartStatus.DELETED) {
            const isUsed = await this.isDefaultChart(chart.id);
            if (isUsed) {
              throw new BadRequestException(ErrorMessages.CHART_ERROR_DEFAULT);
            }
            await queryRunner.manager.delete(CoreReportCharts, { id: chart.id });
          } else if (chartsStatus[chart.id] === ChartStatus.CREATED) {
            await queryRunner.manager.insert(CoreReportCharts, {
              id: chart.id,
              name: chart.name,
              type: chart.type,
              orderIndex: chart.orderIndex,
              data: dataString,
              createdAt: this.dateHelper.formatDate() as unknown as Date,
              createdBy: userId,
              reportId: id,
            });
          }
          delete chartsStatus[chart.id];
        }
      }

      // Handle any remaining deleted charts not in the charts array
      for (const chartId of Object.keys(chartsStatus)) {
        if (chartsStatus[chartId] === ChartStatus.DELETED) {
          await queryRunner.manager.delete(CoreReportCharts, { id: chartId });
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error updating report', error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Rename a report. Validates the report exists and user has admin role on report modules.
   * Mirrors v3 changeReportName().
   */
  async rename(dto: RenameReportDto, userId: string): Promise<string> {
    // Check user has admin role on all report modules
    const reportModules = await this.reportModuleRepo.find({
      where: { reportId: dto.reportId },
      select: { moduleId: true },
    });

    if (reportModules.length > 0) {
      await this.validateUserIsAdminOnModules(userId, reportModules);
    } else {
      throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_HAVE_MODULES);
    }

    // Update the report name
    try {
      await this.reportRepo.update({ id: dto.reportId }, { name: dto.name });
    } catch (error) {
      this.logger.error('Error renaming report', error);
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    }

    return ErrorMessages.REPORT_NAME_UPDATED;
  }

  /**
   * Toggle the isFavorite status on a report or shared report.
   * Mirrors v3 favorite().
   */
  async favorite(reportId: string, isShared: boolean): Promise<boolean> {
    if (isShared) {
      const sharedReport = await this.sharedReportRepo.findOne({
        where: { id: reportId },
        select: { isFavorite: true },
      });
      const newValue = !sharedReport?.isFavorite;
      await this.sharedReportRepo.update({ id: reportId }, { isFavorite: newValue });
      return newValue;
    } else {
      const report = await this.reportRepo.findOne({
        where: { id: reportId },
        select: { isFavorite: true },
      });
      const newValue = !report?.isFavorite;
      await this.reportRepo.update({ id: reportId }, { isFavorite: newValue });
      return newValue;
    }
  }

  /**
   * Transfer report ownership to a new user.
   * Validates report exists, new owner exists, user is admin on modules,
   * and report is not already owned by new owner.
   * Mirrors v3 changeReportOwner().
   */
  async changeReportOwner(dto: ChangeReportOwnerDto, userId: string): Promise<string> {
    // Check new owner exists
    const userExists = await this.usersRepo.findOne({
      where: { id: dto.newOwnerId },
      select: { id: true },
    });
    if (!userExists) {
      throw new BadRequestException(ErrorMessages.USER_NOT_FOUND);
    }

    // Check report exists
    const report = await this.reportRepo.findOne({
      where: { id: dto.reportId },
      select: { ownerId: true },
    });
    if (!report) {
      throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST);
    }

    // Check user has admin role on all report modules
    const reportModules = await this.reportModuleRepo.find({
      where: { reportId: dto.reportId },
      select: { moduleId: true },
    });

    if (reportModules.length > 0) {
      await this.validateUserIsAdminOnModules(userId, reportModules);
    } else {
      throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_HAVE_MODULES);
    }

    // Check report not already owned by new owner
    if (report.ownerId === dto.newOwnerId) {
      throw new BadRequestException(ErrorMessages.USER_ALREADY_OWNS_REPORT);
    }

    // Update report owner
    try {
      await this.reportRepo.update({ id: dto.reportId }, { ownerId: dto.newOwnerId });
    } catch (error) {
      this.logger.error('Error updating report owner', error);
      throw new BadRequestException(ErrorMessages.INTERNAL_ERROR);
    }

    // Delete related data analysis entries
    try {
      await this.dataSource.query(
        `DELETE FROM core_data_analysis WHERE id IN (
          SELECT dataAnalysisId FROM core_data_analysis_report WHERE reportId = ?
        )`,
        [dto.reportId],
      );
    } catch {
      this.logger.warn('Error deleting related data analysis for report owner change');
    }

    return ErrorMessages.REPORT_OWNER_UPDATED;
  }

  /**
   * Delete a report after validation: exists, user is admin on modules,
   * not used in data analysis. Deletes modules, used tables, then report.
   * Mirrors v3 deleteReport().
   */
  async deleteReport(userId: string, reportId: string): Promise<string> {
    // Check report exists
    const reportExists = await this.reportRepo.findOne({
      where: { id: reportId },
      select: { id: true },
    });
    if (!reportExists) {
      throw new NotFoundException(ErrorMessages.REPORT_DOES_NOT_EXIST);
    }

    // Check user has admin role on all report modules
    const reportModules = await this.reportModuleRepo.find({
      where: { reportId },
      select: { moduleId: true },
    });

    if (reportModules.length > 0) {
      await this.validateUserIsAdminOnModules(userId, reportModules);
    } else {
      throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_HAVE_MODULES);
    }

    // Check report is not used in data analysis
    const dataAnalysisResult: Array<{ dataAnalysisNames: string }> = await this.dataSource.query(
      `SELECT GROUP_CONCAT(CONCAT('"', \`name\`, '"')) AS dataAnalysisNames
         FROM core_data_analysis_report AS da_reports
         LEFT JOIN core_data_analysis ON id = da_reports.dataAnalysisId
         WHERE reportId = ?`,
      [reportId],
    );

    if (dataAnalysisResult.length > 0 && dataAnalysisResult[0].dataAnalysisNames != null) {
      throw new BadRequestException(
        ErrorMessages.REPORT_IS_BEING_USED_IN_DATA_ANALYSIS + dataAnalysisResult[0].dataAnalysisNames,
      );
    }

    // Delete: report modules -> used tables -> report (CASCADE handles charts/shared)
    try {
      await this.reportModuleRepo.delete({ reportId });
      await this.reportUsedTableRepo.delete({ reportId });
      await this.reportRepo.delete({ id: reportId });
    } catch (error) {
      this.logger.error('Error deleting report', error);
      throw new BadRequestException(ErrorMessages.ERROR_DELETE);
    }

    return ErrorMessages.REPORT_SUCCESSFULLY_DELETED;
  }

  /**
   * Share a report with multiple users by inserting rows into core_shared_report.
   * Mirrors v3 share().
   */
  async share(reportId: string, dto: ShareReportDto): Promise<void> {
    // Validate report exists
    const reportExists = await this.reportRepo.findOne({
      where: { id: reportId },
      select: { id: true },
    });
    if (!reportExists) {
      throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST);
    }

    try {
      const sharedInserts = dto.userIds.map((userId) => ({
        reportId,
        ownerId: userId,
        createdAt: this.dateHelper.formatDate() as unknown as Date,
      }));
      await this.sharedReportRepo.insert(sharedInserts);
    } catch (error) {
      this.logger.error('Error sharing report', error);
      throw new BadRequestException(ErrorMessages.ERROR_SHARE);
    }
  }

  /**
   * Save a shared report as the user's own copy.
   * Validates user has privilege on all used table modules.
   * Creates a new report with new UUID, copies charts, modules, and used tables.
   * Mirrors v3 saveSharedReport().
   */
  async saveSharedReport(sharedReportId: string, userId: string): Promise<string> {
    const sharedReport = await this.getSharedReportById(sharedReportId, userId);

    if (!sharedReport) {
      throw new BadRequestException(ErrorMessages.SHARED_REPORT_DOES_NOT_EXIST);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const id = v4();
    const reportModules = new Set<string>();
    const reportTables: Array<[string, string, string]> = [];

    try {
      // Validate user has privilege on each table's module
      for (const table of sharedReport.tables) {
        const moduleTable = await queryRunner.manager.findOne(CoreModulesTables, {
          where: { id: table.id },
          select: { mId: true },
        });

        if (moduleTable) {
          // Check user's role on this module
          const roleResult: Array<{ name: string }> = await queryRunner.query(
            `SELECT name FROM core_application_roles WHERE id =
              (SELECT RoleId FROM core_privileges WHERE ModuleId = ? AND UserId = ?)`,
            [moduleTable.mId, userId],
          );

          if (roleResult.length > 0 && roleResult[0].name === AvailableRoles.DEFAULT) {
            throw new BadRequestException(ErrorMessages.USER_NOT_PRIVILEGED_TO_SAVE);
          }

          reportModules.add(String(moduleTable.mId));
          reportTables.push([id, table.id, table.displayName]);
        }
      }

      // Create the new report
      await queryRunner.manager.insert(CoreReport, {
        id,
        name: sharedReport.name,
        fromDate: sharedReport.fromDate as unknown as Date,
        toDate: sharedReport.toDate as unknown as Date,
        timeFilter: sharedReport.timeFilter as CoreReport['timeFilter'],
        limit: sharedReport.limit,
        tables: JSON.stringify(sharedReport.tables),
        control: JSON.stringify(sharedReport.control),
        compare: JSON.stringify(sharedReport.compare),
        operation: JSON.stringify(sharedReport.operation),
        globalFilter: JSON.stringify(sharedReport.globalFilter),
        orderBy: JSON.stringify(sharedReport.orderBy),
        options: JSON.stringify(sharedReport.options),
        ownerId: userId,
        createdAt: this.dateHelper.formatDate() as unknown as Date,
      });

      // Copy charts with new IDs (no id in insert — let DB generate)
      if (sharedReport.charts && sharedReport.charts.length > 0) {
        const chartInserts = sharedReport.charts.map((chart) => {
          const dataObject = { ...chart };
          delete (dataObject as Record<string, unknown>).id;
          delete (dataObject as Record<string, unknown>).name;
          delete (dataObject as Record<string, unknown>).type;
          return {
            name: chart.name,
            type: chart.type,
            orderIndex: chart.orderIndex,
            data: JSON.stringify(dataObject),
            createdAt: this.dateHelper.formatDate() as unknown as Date,
            createdBy: userId,
            reportId: id,
          };
        });
        await queryRunner.manager.insert(CoreReportCharts, chartInserts);
      }

      // Insert report-module associations
      if (reportModules.size > 0) {
        const moduleInserts = Array.from(reportModules).map((moduleId) => ({
          reportId: id,
          moduleId,
        }));
        await queryRunner.manager.insert(CoreReportModule, moduleInserts);
      }

      // Insert used tables
      if (reportTables.length > 0) {
        const usedTableInserts = reportTables.map(([reportId, tableId, tableName]) => ({
          reportId,
          tableId,
          tableName,
        }));
        await queryRunner.manager.insert(CoreReportUsedTable, usedTableInserts);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error saving shared report', error);
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_REPORT);
    } finally {
      await queryRunner.release();
    }

    return id;
  }

  /**
   * Close a chart tab by deleting the chart from core_report_charts.
   * Mirrors v3 closeTab() but performs the actual deletion.
   */
  async closeTab(reportId: string, chartId: string): Promise<void> {
    // Validate report exists
    const reportExists = await this.reportRepo.findOne({
      where: { id: reportId },
      select: { id: true },
    });
    if (!reportExists) {
      throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST);
    }

    // Delete the chart
    await this.chartRepo.delete({ id: chartId, reportId });
  }

  // --- Chart Generation ---

  /**
   * Execute the report's dynamic SQL and return tabular data (headers + rows).
   * Mirrors v3 executeQuery().
   */
  async executeQuery(dto: GenerateReportDto): Promise<ExecuteQueryResultDto> {
    const generateResult = await this.queryBuilder.generateQuery(dto);

    if (generateResult?.query) {
      try {
        const queryResult = await this.legacyDataDb.query<Record<string, unknown>>(generateResult.query);
        return { header: generateResult.header, body: queryResult };
      } catch (error) {
        this.logger.error('executeQuery failed', error);
        throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
      }
    }

    return { header: [], body: [] };
  }

  /**
   * Generate the SQL string for a report without executing it.
   * Mirrors v3 generatedQuery().
   */
  async generatedQuery(dto: GenerateReportDto): Promise<string> {
    const generateResult = await this.queryBuilder.generateQuery(dto);
    return generateResult?.query ?? '';
  }

  /**
   * Build the chart generate result by running the query builder and combining
   * with the original DTO's tables/operation arrays.
   * Mirrors v3 returnGenerateReportResult().
   */
  private async buildChartGenerateResult(dto: GenerateReportDto) {
    const qbResult = await this.queryBuilder.generateQuery(dto);
    return {
      query: qbResult.query,
      fieldsArray: qbResult.fieldsArray,
      tables: dto.tables,
      operation: dto.operation,
    };
  }

  async generatePie(dto: GenerateReportDto, chart: IChartData): Promise<IChartData> {
    const generateResult = await this.buildChartGenerateResult(dto);
    const dateObject = { fromDate: dto.fromDate, toDate: dto.toDate };
    return generatePieChart(generateResult, chart, dateObject, this.legacyDataDb, this.dateHelper, this.coreDbName);
  }

  async generateDoughnut(dto: GenerateReportDto, chart: IChartData): Promise<IChartData> {
    const generateResult = await this.buildChartGenerateResult(dto);
    const dateObject = { fromDate: dto.fromDate, toDate: dto.toDate };
    return generateDoughnutChart(
      generateResult,
      chart,
      dateObject,
      this.legacyDataDb,
      this.dateHelper,
      this.coreDbName,
    );
  }

  async generateTrend(dto: GenerateReportDto, chart: IChartData): Promise<IChartData> {
    const generateResult = await this.buildChartGenerateResult(dto);
    const dateObject = { fromDate: dto.fromDate, toDate: dto.toDate };
    return generateTrendChart(
      generateResult,
      chart,
      dateObject,
      dto.compare,
      this.legacyDataDb,
      this.dateHelper,
      this.coreDbName,
    );
  }

  async generateVerticalBar(dto: GenerateReportDto, chart: IChartData): Promise<IChartData> {
    const generateResult = await this.buildChartGenerateResult(dto);
    const dateObject = { fromDate: dto.fromDate, toDate: dto.toDate };
    return generateVerticalBarChart(
      generateResult,
      chart,
      dateObject,
      dto.compare,
      this.legacyDataDb,
      this.dateHelper,
      this.coreDbName,
    );
  }

  async generateHorizontalBar(dto: GenerateReportDto, chart: IChartData): Promise<IChartData> {
    const generateResult = await this.buildChartGenerateResult(dto);
    const dateObject = { fromDate: dto.fromDate, toDate: dto.toDate };
    return generateHorizontalBarChart(
      generateResult,
      chart,
      dateObject,
      dto.compare,
      this.legacyDataDb,
      this.dateHelper,
      this.coreDbName,
    );
  }

  async generateProgress(dto: GenerateReportDto, chart: IChartData): Promise<IChartData> {
    const generateResult = await this.buildChartGenerateResult(dto);
    const dateObject = { fromDate: dto.fromDate, toDate: dto.toDate };
    const result = await generateProgressChart(
      generateResult,
      chart,
      dateObject,
      this.legacyDataDb,
      this.dateHelper,
      this.coreDbName,
    );
    return result.chart;
  }

  async generateExplodedProgress(dto: GenerateReportDto, chart: IChartData): Promise<IChartData> {
    const generateResult = await this.buildChartGenerateResult(dto);
    const dateObject = { fromDate: dto.fromDate, toDate: dto.toDate };
    const result = await generateExplodedProgressChart(
      generateResult,
      chart,
      dateObject,
      this.legacyDataDb,
      this.dateHelper,
      this.coreDbName,
    );
    return result.chart;
  }

  /**
   * Generate a chart by its type — loads the report config and chart data from DB,
   * then dispatches to the appropriate chart generator.
   * Mirrors v3 generateChartByType().
   */
  async generateChartByType(dto: GenerateChartByTypeDto, userId: string): Promise<IChartData> {
    // Load report config from DB
    const dbReport = await this.reportRepo.findOne({
      where: { id: dto.reportId },
      select: {
        id: true,
        fromDate: true,
        toDate: true,
        timeFilter: true,
        limit: true,
        orderBy: true,
        globalFilter: true,
        tables: true,
        compare: true,
        operation: true,
        control: true,
        options: true,
        isQbe: true,
      },
    });

    if (!dbReport) {
      throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST);
    }

    // Build the generate object from stored report config
    const generateObject: GenerateReportDto = {
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      timeFilter: dto.interval,
      limit: dbReport.limit ?? undefined,
      tables: safeJsonParse<GenerateReportDto['tables']>(dbReport.tables as unknown as string) ?? [],
      control: safeJsonParse<GenerateReportDto['control']>(dbReport.control as unknown as string) ?? [],
      compare: safeJsonParse<GenerateReportDto['compare']>(dbReport.compare as unknown as string) ?? [],
      operation: safeJsonParse<GenerateReportDto['operation']>(dbReport.operation as unknown as string) ?? [],
      globalFilter: safeJsonParse<GenerateReportDto['globalFilter']>(dbReport.globalFilter as unknown as string) ?? {
        condition: 'AND',
        rules: [],
      },
      orderBy: safeJsonParse<GenerateReportDto['orderBy']>(dbReport.orderBy as unknown as string) ?? [],
    };

    const reportOptions = safeJsonParse<Record<string, unknown>>(dbReport.options as unknown as string);

    // Table chart (chartId === '0') — return tabular data
    if (dto.chartId === REPORT_TABLE_ID) {
      const table = await this.executeQuery(generateObject);
      const tableChart = deepCopy(REPORT_TABLE_CHART_DEFAULT_VALUE) as IChartData;
      (tableChart as Record<string, unknown>)['lib'] = {
        body: table.body,
        header: table.header,
        options: reportOptions,
      };
      return tableChart;
    }

    // Fetch chart config from DB using JSON_INSERT to enrich with metadata
    // SDQ: requires manual verification
    const chartRows = await this.legacyDataDb.query<{ data: string }>(
      `SELECT ${FETCH_CHART_DB_FUNCTION} as data FROM ${this.coreDbName}.core_report_charts WHERE reportId = ? AND id = ?`,
      [dto.reportId, dto.chartId],
    );

    if (!chartRows?.length) {
      throw new BadRequestException(ErrorMessages.CHART_ERROR_DEFAULT);
    }

    let chart: IChartData = JSON.parse(chartRows[0].data);

    // Dispatch to the correct chart generator by type
    switch (chart.type) {
      case ChartTypes.PIE:
        chart = await this.generatePie(generateObject, chart);
        break;
      case ChartTypes.DOUGHNUT:
        chart = await this.generateDoughnut(generateObject, chart);
        break;
      case ChartTypes.TREND:
        chart = await this.generateTrend(generateObject, chart);
        break;
      case ChartTypes.VERTICAL_BAR:
        chart = await this.generateVerticalBar(generateObject, chart);
        break;
      case ChartTypes.HORIZONTAL_BAR:
        chart = await this.generateHorizontalBar(generateObject, chart);
        break;
      case ChartTypes.PROGRESS:
        chart = await this.generateProgress(generateObject, chart);
        break;
      case ChartTypes.EXPLODED_PROGRESS:
        chart = await this.generateExplodedProgress(generateObject, chart);
        break;
      default:
        this.logger.warn(`Unknown chart type: ${chart.type}`);
    }

    return chart;
  }

  // --- Export ---

  /**
   * Fetch report + run tabular query for export.
   * Mirrors v3 fetchExportReport().
   */
  private async fetchExportReport(
    reportId: string,
    _status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ) {
    const report = await this.getReportById(reportId, userId);
    const generateObject: GenerateReportDto = {
      fromDate,
      toDate,
      timeFilter: interval,
      limit: report.limit ?? undefined,
      tables: report.tables ?? [],
      control: report.control ?? [],
      compare: report.compare ?? [],
      operation: report.operation ?? [],
      globalFilter: report.globalFilter ?? { condition: 'AND', rules: [] },
      orderBy: report.orderBy ?? [],
    };
    const tabular = await this.executeQuery(generateObject);
    return { report, tabular, generateObject };
  }

  async exportCSV(
    reportId: string,
    status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ): Promise<string> {
    const { tabular } = await this.fetchExportReport(reportId, status, fromDate, toDate, interval, userId);
    const csvHeader = tabular.header.filter((h) => !h.hidden).map((h) => ({ id: h.text, title: h.text }));
    return this.exportHelper.exportTableCSV(csvHeader, tabular.body);
  }

  async exportJSON(
    reportId: string,
    status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ): Promise<string> {
    const { tabular } = await this.fetchExportReport(reportId, status, fromDate, toDate, interval, userId);
    return this.exportHelper.exportJSON(JSON.stringify(tabular));
  }

  async exportHTML(
    reportId: string,
    status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
    enableLocalCdn = false,
    isPdf = false,
  ): Promise<string> {
    const { report, tabular, generateObject } = await this.fetchExportReport(
      reportId,
      status,
      fromDate,
      toDate,
      interval,
      userId,
    );

    // Generate charts in parallel
    const chartResults = await Promise.all(
      (report.charts ?? []).map(async (chart) => {
        try {
          const generated = await this.generateChartByType(
            { reportId, chartId: chart.id, fromDate, toDate, interval },
            userId,
          );
          return JSON.stringify(generated);
        } catch {
          return '{}';
        }
      }),
    );

    const cdns = this.exportHelper.getExportCdns(enableLocalCdn);
    const htmlContent = exportReportHTMLScript(cdns, chartResults, tabular, report, isPdf);
    return this.exportHelper.exportHtml(htmlContent);
  }

  async exportPDF(
    reportId: string,
    status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ): Promise<string> {
    const htmlPath = await this.exportHTML(reportId, status, fromDate, toDate, interval, userId, true, true);
    try {
      const pdfPath = await this.exportHelper.exportPDF(htmlPath);
      await this.exportHelper.cleanupFile(htmlPath);
      return pdfPath;
    } catch (error) {
      await this.exportHelper.cleanupFile(htmlPath);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  async exportPNG(
    reportId: string,
    status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ): Promise<string> {
    const htmlPath = await this.exportHTML(reportId, status, fromDate, toDate, interval, userId, true);
    try {
      const pngPath = await this.exportHelper.exportPNG(htmlPath);
      await this.exportHelper.cleanupFile(htmlPath);
      return pngPath;
    } catch (error) {
      await this.exportHelper.cleanupFile(htmlPath);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  async exportJPEG(
    reportId: string,
    status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ): Promise<string> {
    const htmlPath = await this.exportHTML(reportId, status, fromDate, toDate, interval, userId, true);
    try {
      const jpegPath = await this.exportHelper.exportJPEG(htmlPath);
      await this.exportHelper.cleanupFile(htmlPath);
      return jpegPath;
    } catch (error) {
      await this.exportHelper.cleanupFile(htmlPath);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  async exportExcel(
    reportId: string,
    status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ): Promise<string> {
    const { tabular } = await this.fetchExportReport(reportId, status, fromDate, toDate, interval, userId);
    const visibleHeaders = tabular.header.filter((h) => !h.hidden);
    return this.exportHelper.exportTabularToExcel([
      {
        name: 'Report',
        header: visibleHeaders.map((h) => ({ text: h.text, datafield: h.datafield || h.text })),
        body: tabular.body,
      },
    ]);
  }

  // --- Per-tab exports ---

  async exportTabHTML(
    reportId: string,
    status: string,
    chartId: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ): Promise<string> {
    const chart = await this.generateChartByType({ reportId, chartId, fromDate, toDate, interval }, userId);
    const cdns = this.exportHelper.getExportCdns(true);
    const htmlContent = exportReportHTMLScript(cdns, [JSON.stringify(chart)], { header: [], body: [] }, {}, false);
    return this.exportHelper.exportHtml(htmlContent);
  }

  async exportTabPDF(
    reportId: string,
    status: string,
    chartId: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ): Promise<string> {
    const htmlPath = await this.exportTabHTML(reportId, status, chartId, fromDate, toDate, interval, userId);
    try {
      const pdfPath = await this.exportHelper.exportPDF(htmlPath);
      await this.exportHelper.cleanupFile(htmlPath);
      return pdfPath;
    } catch (error) {
      await this.exportHelper.cleanupFile(htmlPath);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  async exportTabPNG(
    reportId: string,
    status: string,
    chartId: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ): Promise<string> {
    const htmlPath = await this.exportTabHTML(reportId, status, chartId, fromDate, toDate, interval, userId);
    try {
      const pngPath = await this.exportHelper.exportPNG(htmlPath);
      await this.exportHelper.cleanupFile(htmlPath);
      return pngPath;
    } catch (error) {
      await this.exportHelper.cleanupFile(htmlPath);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  async exportTabJPEG(
    reportId: string,
    status: string,
    chartId: string,
    fromDate: string,
    toDate: string,
    interval: string,
    userId: string,
  ): Promise<string> {
    const htmlPath = await this.exportTabHTML(reportId, status, chartId, fromDate, toDate, interval, userId);
    try {
      const jpegPath = await this.exportHelper.exportJPEG(htmlPath);
      await this.exportHelper.cleanupFile(htmlPath);
      return jpegPath;
    } catch (error) {
      await this.exportHelper.cleanupFile(htmlPath);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  // --- Private Helpers ---

  /**
   * Fetch fields for a given table. Admin/superuser/superadmin roles see all fields
   * including encrypted ones; other roles exclude encrypted fields.
   * Uses sha2(columnName, 256) as 'node' to match v3 returnHashedSrring().
   */
  private async fetchTableFields(
    tableId: string,
    role: string,
    index: number,
  ): Promise<{ fields: IPrivilegeTableField[]; index: number }> {
    const isPrivilegedRole =
      role === AvailableRoles.ADMIN || role === AvailableRoles.SUPER_USER || role === AvailableRoles.SUPER_ADMIN;

    const whereClause = isPrivilegedRole ? 'WHERE tId = ?' : 'WHERE tId = ? AND isEncrypted <> 1';

    const fieldsQuery = `
      SELECT id, sha2(columnName, 256) AS node, columnDisplayName, type, operation
      FROM core_tables_field ${whereClause}
    `;

    const fields: IPrivilegeTableField[] = await this.dataSource.query(fieldsQuery, [tableId]);

    return { fields, index };
  }

  /**
   * Fetch the ref table and its fields for the given user.
   * Mirrors v3 fetchRefTable().
   */
  private async fetchRefTable(userId: string): Promise<PrivilegedTableDto> {
    const refTableQuery = `
      SELECT
        mt.id,
        mt.displayName,
        (SELECT Name FROM core_application_roles WHERE Id =
          (SELECT RoleId FROM core_privileges WHERE UserId = ? AND
            ModuleId = (SELECT mId FROM core_modules_tables WHERE Id = mt.id))) AS role
      FROM core_modules_tables mt
      WHERE tableType = ? AND tableName = ?
    `;

    const refTableResult: Array<{ id: string; displayName: string; role: string }> = await this.dataSource.query(
      refTableQuery,
      [userId, TABLE_TYPE_STATISTICS, REF_TABLE_KEY],
    );

    const refTableData: PrivilegedTableDto = {
      ...refTableResult[0],
      fields: [],
    };

    refTableData.fields = (await this.fetchTableFields(refTableData.id, refTableData.role || '', 0)).fields;

    return refTableData;
  }

  /**
   * Check if a chart is used in a default data analysis (isDefault = 1).
   * Mirrors v3 isDefaultChart() for DATA_ANALYSIS type.
   */
  private async isDefaultChart(chartId: string): Promise<boolean> {
    const result: Array<{ recordExists: number }> = await this.dataSource.query(
      `SELECT EXISTS(
        SELECT id FROM core_data_analysis
        LEFT JOIN core_data_analysis_chart ON id = dataAnalysisId
        WHERE chartId = ? AND isDefault = 1
      ) AS recordExists`,
      [chartId],
    );

    return result[0]?.recordExists > 0;
  }

  /**
   * Validate that the given user has admin role on every module in the list.
   * Throws UNAUTHORIZED_ROLE if any module check fails.
   */
  private async validateUserIsAdminOnModules(
    userId: string,
    reportModules: Array<{ moduleId: string }>,
  ): Promise<void> {
    for (const mod of reportModules) {
      const isAdminResult: Array<Record<string, unknown>> = await this.dataSource.query(
        `SELECT 1 FROM core_application_roles WHERE name = ? AND id =
          (SELECT RoleId FROM core_privileges WHERE UserId = ? AND ModuleId = ?)`,
        [AvailableRoles.ADMIN, userId, mod.moduleId],
      );

      if (isAdminResult.length <= 0) {
        throw new BadRequestException(ErrorMessages.UNAUTHORIZED_ROLE);
      }
    }
  }

  // --- Duplication (used by DataAnalysis saveShared/saveDefault) ---

  /**
   * Duplicate a report: creates full copy with new UUID, copies charts with new IDs,
   * copies module associations and used tables. Returns mapping of old→new chart IDs.
   * Mirrors v3 duplicate() in report.service.ts.
   */
  async duplicate(
    reportId: string,
    userId: string,
  ): Promise<{ reportId: string; charts: Record<string, string> } | null> {
    const original = await this.reportRepo.findOne({ where: { id: reportId } });
    if (!original) return null;

    const id = v4();
    const result: { reportId: string; charts: Record<string, string> } = {
      reportId: id,
      charts: {},
    };

    if (original.isQbe) {
      // QBE report — simple copy without modules/used tables
      await this.reportRepo.save({
        id,
        name: original.name,
        timeFilter: original.timeFilter,
        fromDate: original.fromDate,
        toDate: original.toDate,
        options: original.options,
        ownerId: userId,
        isQbe: 1,
        globalOrderIndex: original.globalOrderIndex,
        createdAt: new Date(),
        sql: original.sql,
      });
    } else {
      // Regular report — copy report + modules + used tables
      const reportModules = await this.reportModuleRepo.find({
        where: { reportId },
        select: { moduleId: true },
      });

      const reportUsedTables = await this.reportUsedTableRepo.find({
        where: { reportId },
        select: { tableId: true, tableName: true },
      });

      // Check user privilege on each module
      for (const mod of reportModules) {
        const roleResult: Array<{ name: string }> = await this.dataSource.query(
          `SELECT name FROM core_application_roles WHERE id =
            (SELECT RoleId FROM core_privileges WHERE ModuleId = ? AND UserId = ?)`,
          [mod.moduleId, userId],
        );

        if (roleResult.length === 0 || roleResult[0].name === AvailableRoles.DEFAULT) {
          throw new BadRequestException(ErrorMessages.USER_NOT_PRIVILEGED_TO_SAVE);
        }
      }

      await this.reportRepo.save({
        id,
        name: original.name,
        fromDate: original.fromDate,
        toDate: original.toDate,
        timeFilter: original.timeFilter,
        limit: original.limit,
        tables: original.tables,
        control: original.control,
        compare: original.compare,
        operation: original.operation,
        globalFilter: original.globalFilter,
        orderBy: original.orderBy,
        options: original.options,
        ownerId: userId,
        createdAt: new Date(),
      });

      // Copy module associations
      if (reportModules.length > 0) {
        const moduleValues = reportModules.map((m) => [id, m.moduleId]);
        await this.dataSource.query('INSERT INTO core_report_module (reportId, moduleId) VALUES ?', [moduleValues]);
      }

      // Copy used tables
      if (reportUsedTables.length > 0) {
        const tableValues = reportUsedTables.map((t) => [id, t.tableId, t.tableName]);
        await this.dataSource.query('INSERT INTO core_report_used_table (reportId, tableId, tableName) VALUES ?', [
          tableValues,
        ]);
      }
    }

    // Copy charts with new IDs
    try {
      const originalCharts = await this.chartRepo.find({
        where: { reportId },
        order: { orderIndex: 'ASC' },
      });

      if (originalCharts.length > 0) {
        const chartValues: unknown[][] = [];
        for (const chart of originalCharts) {
          const chartId = v4();
          result.charts[chart.id] = chartId;

          const chartData: IChartData = JSON.parse(chart.data);
          const emptied = emptyReportChartByType(deepCopy(chartData));
          delete (emptied as Record<string, unknown>).id;
          delete (emptied as Record<string, unknown>).name;
          delete (emptied as Record<string, unknown>).type;
          const dataString = JSON.stringify(emptied);

          chartValues.push([chartId, chart.name, chart.type, chart.orderIndex, dataString, new Date(), userId, id]);
        }

        await this.dataSource.query(
          'INSERT INTO core_report_charts (id, name, type, orderIndex, data, createdAt, createdBy, reportId) VALUES ?',
          [chartValues],
        );
      }

      return result;
    } catch (error) {
      // Rollback: remove the created report (cascade removes charts)
      await this.reportRepo.delete({ id });
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_REPORT);
    }
  }

  /**
   * Delete reports by IDs (rollback utility for failed duplication).
   * Mirrors v3 cleanReports().
   */
  async cleanReports(ids: string[]): Promise<void> {
    for (const id of ids) {
      try {
        await this.reportRepo.delete({ id });
      } catch (error) {
        this.logger.warn(`Failed to clean report ${id}: ${(error as Error).message}`);
      }
    }
  }
}
