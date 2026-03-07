import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { v4 } from 'uuid';
import { CoreDataAnalysis } from '../../database/entities/core-data-analysis.entity';
import { CoreDataAnalysisChart } from '../../database/entities/core-data-analysis-chart.entity';
import { CoreDataAnalysisReport } from '../../database/entities/core-data-analysis-report.entity';
import { CoreSharedDataAnalysis } from '../../database/entities/core-shared-data-analysis.entity';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportCharts } from '../../database/entities/core-report-charts.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ExportHelperService } from '../../shared/services/export-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { DEFAULT_ADMIN_ID } from '../../shared/constants/auth.constants';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { ReportsService } from '../reports/reports.service';
import { REPORT_TABLE_ID } from '../reports/constants';
import { exportReportHTMLScript } from '../reports/utils/export-html-templates';
import { SaveDataAnalysisDto } from './dto/save-data-analysis.dto';
import { EditDataAnalysisDto } from './dto/edit-data-analysis.dto';
import { DataAnalysisChartsDto } from './dto/data-analysis-charts.dto';

export interface DataAnalysisDto {
  name: string;
  ownerId: string;
  charts: DataAnalysisChartsDto[];
  isDefault: boolean | null;
}

export interface ListDataAnalysisDto {
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
export class DataAnalysisService {
  private readonly logger = new Logger(DataAnalysisService.name);

  constructor(
    @InjectRepository(CoreDataAnalysis)
    private readonly dataAnalysisRepo: Repository<CoreDataAnalysis>,
    @InjectRepository(CoreDataAnalysisChart)
    private readonly daChartRepo: Repository<CoreDataAnalysisChart>,
    @InjectRepository(CoreDataAnalysisReport)
    private readonly daReportRepo: Repository<CoreDataAnalysisReport>,
    @InjectRepository(CoreSharedDataAnalysis)
    private readonly sharedDaRepo: Repository<CoreSharedDataAnalysis>,
    @InjectRepository(CoreReport)
    private readonly reportRepo: Repository<CoreReport>,
    @InjectRepository(CoreReportCharts)
    private readonly reportChartsRepo: Repository<CoreReportCharts>,
    private readonly dataSource: DataSource,
    private readonly dateHelper: DateHelperService,
    private readonly exportHelper: ExportHelperService,
    private readonly reportsService: ReportsService,
  ) {}

  // --- CRUD ---

  /**
   * Create a new data analysis with report and chart associations.
   * Validates each report and chart exists.
   */
  async save(dto: SaveDataAnalysisDto, userId: string): Promise<string> {
    const reportIds = new Set<string>();
    const chartIds = new Set<string>();
    const id = v4();

    await this.validateCharts(dto.charts, reportIds, chartIds);
    await this.addDataAnalysisToDb(id, userId, dto.name, dto.charts, reportIds, chartIds);
    return id;
  }

  /**
   * Update a data analysis: replace report and chart associations.
   */
  async update(dto: EditDataAnalysisDto, userId: string): Promise<void> {
    const exists = await this.dataAnalysisExists(dto.id);
    if (!exists) {
      throw new BadRequestException(ErrorMessages.DATA_ANALYSIS_DOES_NOT_EXIST);
    }

    const reportIds = new Set<string>();
    const chartIds = new Set<string>();

    await this.validateCharts(dto.charts, reportIds, chartIds);

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          CoreDataAnalysis,
          { id: dto.id },
          {
            ownerId: userId,
            name: dto.name,
            options: JSON.stringify(dto.charts),
            updatedAt: new Date(),
          },
        );

        // Delete old associations, re-insert new ones
        await manager.delete(CoreDataAnalysisReport, { dataAnalysisId: dto.id });
        await manager.delete(CoreDataAnalysisChart, { dataAnalysisId: dto.id });

        await this.bulkInsertReportsAndCharts(manager, dto.id, reportIds, chartIds);
      });
    } catch (_error) {
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    }
  }

  /**
   * List data analyses: own + default + shared.
   * Filters by report used tables privileges.
   */
  async list(currentUserId: string): Promise<ListDataAnalysisDto[]> {
    const listQuery = `
      SELECT
        id, name, ownerId, isFavorite,
        (SELECT userName FROM core_application_users WHERE id = ownerId) AS owner,
        false AS isShared,
        DATE_FORMAT(createdAt, "%Y-%m-%d %H:%i") AS createdAt,
        DATE_FORMAT(updatedAt, "%Y-%m-%d %H:%i") AS updatedAt,
        isDefault
      FROM core_data_analysis
      WHERE ownerId = ? OR isDefault = 1

      UNION

      SELECT
        sda.id AS id, da.name AS name, da.ownerId,
        sda.isFavorite,
        (SELECT userName FROM core_application_users WHERE id = da.ownerId) AS owner,
        true AS isShared,
        DATE_FORMAT(sda.createdAt, "%Y-%m-%d %H:%i") AS createdAt,
        DATE_FORMAT(da.updatedAt, "%Y-%m-%d %H:%i") AS updatedAt,
        0 AS isDefault
      FROM core_shared_data_analysis sda, core_data_analysis da
      WHERE sda.ownerId = ? AND sda.dataAnalysisId = da.id

      ORDER BY \`isDefault\` DESC, isFavorite DESC,
        \`updatedAt\` DESC, \`createdAt\` DESC, name DESC`;

    const dataAnalyses: ListDataAnalysisDto[] = await this.dataSource.query(listQuery, [currentUserId, currentUserId]);

    // Get user's privileged tables (via report used tables, not WB used tables)
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

    const response: ListDataAnalysisDto[] = [];

    // Collect non-shared DA IDs for batch privilege check
    const nonSharedIds = dataAnalyses
      .filter((da) => !da.isShared && currentUserId !== DEFAULT_ADMIN_ID)
      .map((da) => da.id);

    // Batch fetch used tables for all non-shared data analyses (fixes N+1)
    const usedTablesMap = new Map<string, string[]>();
    if (nonSharedIds.length > 0) {
      const batchResult: Array<{ dataAnalysisId: string; tableId: string }> = await this.dataSource.query(
        `SELECT dar.dataAnalysisId, rut.tableId
         FROM core_data_analysis_report dar
         INNER JOIN core_report_used_table rut ON dar.reportId = rut.reportId
         WHERE dar.dataAnalysisId IN (?)`,
        [nonSharedIds],
      );
      for (const row of batchResult) {
        if (!usedTablesMap.has(row.dataAnalysisId)) {
          usedTablesMap.set(row.dataAnalysisId, []);
        }
        usedTablesMap.get(row.dataAnalysisId)!.push(row.tableId);
      }
    }

    let index = dataAnalyses.length;
    while (index--) {
      const da = dataAnalyses[index];

      if (da.isShared || currentUserId === DEFAULT_ADMIN_ID) {
        response.push(da);
        continue;
      }

      const usedTables = usedTablesMap.get(da.id) || [];
      const hasPriv = usedTables.every((tableId) => privilegedTables.includes(tableId));
      if (hasPriv) {
        response.push(da);
      }
    }

    return response.reverse();
  }

  /**
   * Get data analysis by ID.
   */
  async getById(id: string): Promise<DataAnalysisDto> {
    const da = await this.dataAnalysisRepo.findOne({
      where: { id },
      select: { name: true, ownerId: true, options: true, isDefault: true },
    });
    if (!da) {
      throw new BadRequestException(ErrorMessages.DATA_ANALYSIS_DOES_NOT_EXIST);
    }

    return {
      name: da.name,
      ownerId: da.ownerId,
      charts: da.options ? JSON.parse(da.options) : [],
      isDefault: da.isDefault,
    };
  }

  /**
   * Share data analysis with users.
   */
  async share(dataAnalysisId: string, userIds: string[]): Promise<void> {
    const exists = await this.dataAnalysisExists(dataAnalysisId);
    if (!exists) {
      throw new BadRequestException(ErrorMessages.DATA_ANALYSIS_DOES_NOT_EXIST);
    }

    try {
      if (userIds.length > 0) {
        const entities = userIds.map((userId) => ({
          dataAnalysisId,
          ownerId: userId,
          createdAt: new Date(),
        }));
        await this.sharedDaRepo.insert(entities);
      }
    } catch (_error) {
      throw new BadRequestException(ErrorMessages.ERROR_SHARE);
    }
  }

  /**
   * Get shared data analysis by its shared ID.
   */
  async getSharedById(sharedId: string): Promise<DataAnalysisDto> {
    const sharedQuery = `
      SELECT sda.id, sda.dataAnalysisId, sda.ownerId, da.name, da.options, da.isDefault
      FROM core_shared_data_analysis sda
      LEFT JOIN core_data_analysis da ON sda.dataAnalysisId = da.id
      WHERE sda.id = ?`;

    const results = await this.dataSource.query(sharedQuery, [sharedId]);
    if (results.length === 0) {
      throw new BadRequestException(ErrorMessages.SHARED_DATA_ANALYSIS_DOES_NOT_EXIST);
    }

    return {
      name: results[0].name,
      ownerId: results[0].ownerId,
      charts: results[0].options ? JSON.parse(results[0].options) : [],
      isDefault: results[0].isDefault,
    };
  }

  /**
   * Toggle favorite status on data analysis or shared data analysis.
   */
  async favorite(id: string, isShared: boolean): Promise<boolean> {
    if (isShared) {
      const shared = await this.sharedDaRepo.findOne({ where: { id }, select: { isFavorite: true } });
      if (!shared) {
        throw new NotFoundException(ErrorMessages.SHARED_DATA_ANALYSIS_DOES_NOT_EXIST);
      }
      const newFav = !shared.isFavorite;
      await this.sharedDaRepo.update({ id }, { isFavorite: newFav });
      return newFav;
    }

    const da = await this.dataAnalysisRepo.findOne({ where: { id }, select: { isFavorite: true } });
    if (!da) {
      throw new NotFoundException(ErrorMessages.DATA_ANALYSIS_DOES_NOT_EXIST);
    }
    const newFav = !da.isFavorite;
    await this.dataAnalysisRepo.update({ id }, { isFavorite: newFav });
    return newFav;
  }

  // --- Duplication (saveShared / saveDefault) ---

  /**
   * Duplicate a shared data analysis: creates new DA + duplicates reports.
   * Mirrors v3 saveShared().
   */
  async saveShared(sharedId: string, currentUserId: string): Promise<string> {
    const sharedDa = await this.getSharedById(sharedId);

    const reportIds = new Set<string>();
    const chartIds = new Set<string>();
    const daCharts = sharedDa.charts;
    const id = v4();
    const duplicatedReportIds: string[] = [];

    // Group charts by reportId to avoid duplicating the same report multiple times
    const reportIndexMapping: Record<string, number[]> = {};
    for (let i = 0; i < daCharts.length; i++) {
      const widget = daCharts[i];
      if (widget.isTitle === true) continue;
      if (!reportIndexMapping[widget.reportId]) {
        reportIndexMapping[widget.reportId] = [i];
      } else {
        reportIndexMapping[widget.reportId].push(i);
      }
    }

    for (const reportId of Object.keys(reportIndexMapping)) {
      const indexes = reportIndexMapping[reportId];
      const dupResult = await this.reportsService.duplicate(reportId, currentUserId);
      if (!dupResult) {
        await this.reportsService.cleanReports(duplicatedReportIds);
        throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST);
      }
      const dupReportId = dupResult.reportId;
      duplicatedReportIds.push(dupReportId);

      reportIds.add(dupReportId);

      for (const idx of indexes) {
        const chartObj = daCharts[idx];

        if (chartObj.chartId !== REPORT_TABLE_ID) {
          if (!dupResult.charts[chartObj.chartId]) {
            await this.reportsService.cleanReports(duplicatedReportIds);
            throw new BadRequestException(ErrorMessages.DUPLICATE_CHART_ERROR);
          }
          const dupChartId = dupResult.charts[chartObj.chartId];
          chartIds.add(dupChartId);
          daCharts[idx].reportId = dupReportId;
          daCharts[idx].chartId = dupChartId;
        }
      }
    }

    // Check privilege on original DA's used tables
    await this.checkUsedTablesPrivilege(sharedId, currentUserId, duplicatedReportIds, true);

    try {
      await this.addDataAnalysisToDb(id, currentUserId, sharedDa.name, daCharts, reportIds, chartIds);
    } catch (error) {
      await this.reportsService.cleanReports(duplicatedReportIds);
      throw new BadRequestException((error as Error).message);
    }

    return id;
  }

  /**
   * Duplicate a default data analysis for the current user.
   * Mirrors v3 saveDefault().
   */
  async saveDefault(dataAnalysisId: string, currentUserId: string): Promise<string> {
    const da = await this.getById(dataAnalysisId);
    if (!da.isDefault) {
      throw new BadRequestException(ErrorMessages.DATA_ANALYSIS_NOT_DEFAULT);
    }

    const reportIds = new Set<string>();
    const chartIds = new Set<string>();
    const daCharts = da.charts;
    const id = v4();
    const duplicatedReportIds: string[] = [];

    const reportIndexMapping: Record<string, number[]> = {};
    for (let i = 0; i < daCharts.length; i++) {
      const widget = daCharts[i];
      if (widget.isTitle === true) continue;
      if (!reportIndexMapping[widget.reportId]) {
        reportIndexMapping[widget.reportId] = [i];
      } else {
        reportIndexMapping[widget.reportId].push(i);
      }
    }

    for (const reportId of Object.keys(reportIndexMapping)) {
      const indexes = reportIndexMapping[reportId];
      const dupResult = await this.reportsService.duplicate(reportId, currentUserId);
      if (!dupResult) {
        await this.reportsService.cleanReports(duplicatedReportIds);
        throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST);
      }
      const dupReportId = dupResult.reportId;
      duplicatedReportIds.push(dupReportId);

      reportIds.add(dupReportId);

      for (const idx of indexes) {
        const chartObj = daCharts[idx];

        if (chartObj.chartId !== REPORT_TABLE_ID) {
          if (!dupResult.charts[chartObj.chartId]) {
            await this.reportsService.cleanReports(duplicatedReportIds);
            throw new BadRequestException(ErrorMessages.DUPLICATE_CHART_ERROR);
          }
          const dupChartId = dupResult.charts[chartObj.chartId];
          chartIds.add(dupChartId);
          daCharts[idx].reportId = dupReportId;
          daCharts[idx].chartId = dupChartId;
        }
      }
    }

    // Check privilege on original DA's used tables
    await this.checkUsedTablesPrivilege(dataAnalysisId, currentUserId, duplicatedReportIds, false);

    try {
      await this.addDataAnalysisToDb(id, currentUserId, da.name, daCharts, reportIds, chartIds);
    } catch (error) {
      await this.reportsService.cleanReports(duplicatedReportIds);
      throw new BadRequestException((error as Error).message);
    }

    return id;
  }

  // --- Exports ---

  /**
   * Export data analysis as HTML.
   * Generates each chart via ReportsService, renders to HTML page.
   */
  async exportHtml(
    dataAnalysisId: string,
    status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    currentUserId: string,
    isPdf = false,
  ): Promise<string> {
    const da = await this.getDataAnalysisByStatus(dataAnalysisId, status);
    const charts: string[] = [];

    for (const chart of da.charts) {
      if (chart.isTitle === true) continue;
      const generated = await this.reportsService.generateChartByType(
        { reportId: chart.reportId, chartId: chart.chartId, fromDate, toDate, interval },
        currentUserId,
      );
      charts.push(JSON.stringify(generated));
    }

    const cdns = this.exportHelper.getExportCdns(isPdf);
    const htmlContent = exportReportHTMLScript(cdns, charts, { header: [], body: [] }, {}, isPdf);
    return this.exportHelper.exportHtml(htmlContent);
  }

  /**
   * Export data analysis as PDF (generates HTML first, then converts).
   */
  async exportPdf(
    dataAnalysisId: string,
    status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    currentUserId: string,
  ): Promise<string> {
    const htmlPath = await this.exportHtml(dataAnalysisId, status, fromDate, toDate, interval, currentUserId, true);

    try {
      const pdfPath = await this.exportHelper.exportPDF(htmlPath);
      await this.exportHelper.cleanupFile(htmlPath);
      return pdfPath;
    } catch (_error) {
      await this.exportHelper.cleanupFile(htmlPath);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  /**
   * Export data analysis as Excel.
   * Generates each chart, collects tabular results, creates Excel.
   */
  async exportExcel(
    dataAnalysisId: string,
    status: string,
    fromDate: string,
    toDate: string,
    interval: string,
    currentUserId: string,
  ): Promise<string> {
    const da = await this.getDataAnalysisByStatus(dataAnalysisId, status);
    const tabs: Array<{
      name: string;
      header: Array<{ text: string; datafield: string }>;
      body: Record<string, unknown>[];
    }> = [];

    const promises: Promise<unknown>[] = [];
    for (const chart of da.charts) {
      if (chart.isTitle === true) continue;
      promises.push(
        this.reportsService.generateChartByType(
          { reportId: chart.reportId, chartId: chart.chartId, fromDate, toDate, interval },
          currentUserId,
        ),
      );
    }

    const results = (await Promise.all(promises)) as Array<{
      name: string;
      type: string;
      header?: Array<{ text: string; datafield: string }>;
      body?: Record<string, unknown>[];
    }>;
    for (const result of results) {
      let name = result.name.replace(/[:\[\]*?/\\]/g, '-');
      if (tabs.some((tab) => tab.name === name)) {
        const count = tabs.filter((tab) => tab.name === name || tab.name.includes(`${name}_`)).length;
        name = `${name}_${count + 1}`;
      }

      tabs.push({
        name,
        header: result.header || [],
        body: result.body || [],
      });
    }

    return this.exportHelper.exportTabularToExcel(tabs);
  }

  // --------------- Private helpers ---------------

  private async dataAnalysisExists(id: string): Promise<boolean> {
    return this.dataAnalysisRepo.createQueryBuilder('da').where('da.id = :id', { id }).getExists();
  }

  private async validateCharts(
    charts: DataAnalysisChartsDto[],
    reportIds: Set<string>,
    chartIds: Set<string>,
  ): Promise<void> {
    for (const chartObj of charts) {
      if (chartObj.isTitle === true) continue;

      const report = await this.reportRepo.findOne({
        where: { id: chartObj.reportId },
        select: { id: true },
      });
      if (!report) {
        throw new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST);
      }
      reportIds.add(report.id);

      if (chartObj.chartId !== REPORT_TABLE_ID) {
        const chart = await this.reportChartsRepo.findOne({
          where: { id: chartObj.chartId },
          select: { id: true },
        });
        if (!chart) {
          throw new BadRequestException(ErrorMessages.CHART_NOT_FOUND);
        }
        chartIds.add(chart.id);
      }
    }
  }

  private async addDataAnalysisToDb(
    id: string,
    userId: string,
    name: string,
    charts: DataAnalysisChartsDto[],
    reportIds: Set<string>,
    chartIds: Set<string>,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(CoreDataAnalysis, {
          id,
          name,
          ownerId: userId,
          createdAt: new Date(),
          options: JSON.stringify(charts),
        });

        await this.bulkInsertReportsAndCharts(manager, id, reportIds, chartIds);
      });
    } catch (_error) {
      throw new BadRequestException(ErrorMessages.ERROR_SAVE);
    }
  }

  private async bulkInsertReportsAndCharts(
    manager: EntityManager,
    dataAnalysisId: string,
    reportIds: Set<string>,
    chartIds: Set<string>,
  ): Promise<void> {
    if (reportIds.size > 0) {
      const reportEntities = Array.from(reportIds).map((rId) => ({
        dataAnalysisId,
        reportId: rId,
      }));
      await manager.insert(CoreDataAnalysisReport, reportEntities);
    }

    if (chartIds.size > 0) {
      const chartEntities = Array.from(chartIds).map((cId) => ({
        dataAnalysisId,
        chartId: cId,
      }));
      await manager.insert(CoreDataAnalysisChart, chartEntities);
    }
  }

  private async getDataAnalysisByStatus(id: string, status: string): Promise<DataAnalysisDto> {
    if (status === 'shared') {
      return this.getSharedById(id);
    } else if (status === 'saved') {
      return this.getById(id);
    }
    throw new BadRequestException(ErrorMessages.INVALID_DATA_ANALYSIS_STATUS);
  }

  private async checkUsedTablesPrivilege(
    sourceId: string,
    userId: string,
    duplicatedReportIds: string[],
    isShared: boolean,
  ): Promise<void> {
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

    // Get the original DA's ID (for shared, lookup via shared table; for direct, use sourceId)
    let originalDaId = sourceId;
    if (isShared) {
      const sharedRecord = await this.sharedDaRepo.findOne({
        where: { id: sourceId },
        select: { dataAnalysisId: true },
      });
      if (sharedRecord) {
        originalDaId = sharedRecord.dataAnalysisId;
      }
    }

    const usedTablesQuery = `
      SELECT GROUP_CONCAT(CONCAT('"', tableId, '"')) AS usedTables
      FROM core_report_used_table
      WHERE reportId IN (
        SELECT reportId FROM core_data_analysis_report WHERE dataAnalysisId = ?
      )`;

    const usedTablesResult: Array<{ usedTables: string }> = await this.dataSource.query(usedTablesQuery, [
      originalDaId,
    ]);

    let usedTables: string[] = usedTablesResult[0]?.usedTables
      ? JSON.parse('[' + usedTablesResult[0].usedTables + ']')
      : [];
    usedTables = usedTables.length === 1 && usedTables[0] == null ? [] : usedTables;

    const hasPriv = usedTables.every((tableId) => privilegedTables.includes(tableId));
    if (!hasPriv) {
      await this.reportsService.cleanReports(duplicatedReportIds);
      throw new BadRequestException(ErrorMessages.USER_NOT_PRIVILEGED_TO_SAVE);
    }
  }
}
