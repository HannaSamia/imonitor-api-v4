import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { v4 } from 'uuid';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportCharts } from '../../database/entities/core-report-charts.entity';
import { CoreSharedQbeReport } from '../../database/entities/core-shared-qbe-report.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { FETCH_CHART_DB_FUNCTION } from '../reports/constants';
import { ChartStatus } from '../reports/enums';
import {
  IChartData,
  IReportOptions,
  IFieldsArrayEntry,
  ICustomOperationColumn,
} from '../reports/dto/report-interfaces';
import { DateFormats } from '../reports/services/query-builder.service';
import {
  generatePie as generatePieChart,
  generateDoughnut as generateDoughnutChart,
  generateTrend as generateTrendChart,
  generateVerticalBar as generateVerticalBarChart,
  generateHorizontalBar as generateHorizontalBarChart,
  generateProgress as generateProgressChart,
  generateExplodedProgress as generateExplodedProgressChart,
} from '../reports/charts';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import {
  SaveQbeDto,
  UpdateQbeDto,
  ProcessQbeDto,
  QbeResponseDto,
  QbeRunDto,
  QbeAutoCompleteTablesDto,
  QbeAutoCompleteField,
  GenerateQbeChartDto,
} from './dto';
import { QbeQueryService, QbeErrorMessages } from './services/qbe-query.service';

/** Module table type filter value matching v3 ModuleTableTypes.STATISTICS */
const TABLE_TYPE_STATISTICS = 'STATISTICS';

/** Ref table key matching v3 REF_TABLE_KEY */
const REF_TABLE_KEY = 'REF_TABLE';

/**
 * Safely parse a JSON string, returning null if input is null/undefined or malformed.
 */
function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

@Injectable()
export class QbeService {
  private readonly logger = new Logger(QbeService.name);

  /** Core DB name for chart hotkey transforms */
  private readonly coreDbName: string;

  constructor(
    @InjectRepository(CoreReport)
    private readonly reportRepo: Repository<CoreReport>,
    @InjectRepository(CoreReportCharts)
    private readonly chartRepo: Repository<CoreReportCharts>,
    @InjectRepository(CoreSharedQbeReport)
    private readonly sharedQbeRepo: Repository<CoreSharedQbeReport>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly dateHelper: DateHelperService,
    private readonly qbeQueryService: QbeQueryService,
  ) {
    this.coreDbName = this.configService.get<string>('DB_NAME') || '';
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * Save a new QBE report with its charts.
   * Validates SQL safety, stores in core_report with isQbe = true.
   * Mirrors v3 qbe.service.ts save().
   */
  async save(dto: SaveQbeDto, userId: string): Promise<string> {
    // Validate SQL safety before saving
    this.qbeQueryService.checkQbeSafety(dto.sql);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const id = v4();

    try {
      // Insert the report with isQbe = true
      await queryRunner.manager.insert(CoreReport, {
        id,
        name: dto.name,
        timeFilter: dto.timeFilter as CoreReport['timeFilter'],
        fromDate: dto.fromDate as unknown as Date,
        toDate: dto.toDate as unknown as Date,
        options: JSON.stringify(dto.options || {}),
        ownerId: userId,
        isQbe: 1,
        globalOrderIndex: dto.globalOrderIndex,
        sql: dto.sql,
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

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error saving QBE', error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_REPORT);
    } finally {
      await queryRunner.release();
    }

    return id;
  }

  /**
   * Update an existing QBE report and process chart changes by status.
   * Mirrors v3 qbe.service.ts update().
   */
  async update(id: string, dto: UpdateQbeDto, userId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update the report (owner-scoped)
      await queryRunner.manager.update(
        CoreReport,
        { id, ownerId: userId },
        {
          name: dto.name,
          timeFilter: dto.timeFilter as CoreReport['timeFilter'],
          fromDate: dto.fromDate as unknown as Date,
          toDate: dto.toDate as unknown as Date,
          options: JSON.stringify(dto.options || {}),
          globalOrderIndex: dto.globalOrderIndex,
          sql: dto.sql,
          updatedAt: this.dateHelper.formatDate() as unknown as Date,
        },
      );

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

      // Handle remaining deleted charts not in the charts array
      for (const chartId of Object.keys(chartsStatus)) {
        if (chartsStatus[chartId] === ChartStatus.DELETED) {
          await queryRunner.manager.delete(CoreReportCharts, { id: chartId });
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error updating QBE', error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get a QBE report by ID with parsed JSON columns and loaded charts.
   * Mirrors v3 qbe.service.ts getById().
   */
  async getById(id: string, userId: string): Promise<QbeResponseDto> {
    const dbReport = await this.reportRepo.findOne({
      where: { id, ownerId: userId },
    });

    if (!dbReport) {
      throw new BadRequestException(QbeErrorMessages.QBE_NOT_FOUND);
    }

    const report: QbeResponseDto = {
      id: dbReport.id,
      ownerId: dbReport.ownerId,
      isFavorite: !!dbReport.isFavorite,
      isDefault: !!dbReport.isDefault,
      createdAt: dbReport.createdAt as unknown as string,
      updatedAt: dbReport.updatedAt as unknown as string,
      name: dbReport.name,
      timeFilter: dbReport.timeFilter,
      fromDate: dbReport.fromDate as unknown as string,
      toDate: dbReport.toDate as unknown as string,
      globalOrderIndex: dbReport.globalOrderIndex || 0,
      options: safeJsonParse<IReportOptions>(dbReport.options) || {
        threshold: {},
        isFooterAggregation: false,
        globalFieldIndex: 0,
      },
      charts: [],
      sql: dbReport.sql || '',
    };

    // Load charts using JSON_INSERT DB function
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
   * Get a shared QBE report by shared entry ID.
   * Joins core_shared_qbe_report with core_report.
   * Mirrors v3 qbe.service.ts getSharedById().
   */
  async getSharedById(sharedId: string, userId: string): Promise<QbeResponseDto> {
    const selectQuery = `
      SELECT
        shared.id,
        shared.reportId,
        shared.isFavorite,
        shared.ownerId,
        normal.name,
        FALSE AS isDefault,
        normal.createdAt,
        normal.updatedAt,
        normal.fromDate,
        normal.toDate,
        normal.timeFilter,
        normal.options,
        normal.globalOrderIndex,
        normal.sql
      FROM core_shared_qbe_report shared
      LEFT JOIN core_report normal ON shared.reportId = normal.id
      WHERE shared.id = ? AND shared.ownerId = ?
    `;

    const sharedResult: Array<Record<string, unknown>> = await this.dataSource.query(selectQuery, [sharedId, userId]);

    if (sharedResult.length <= 0) {
      throw new BadRequestException(QbeErrorMessages.SHARED_QBE_NOT_FOUND);
    }

    const sr = sharedResult[0];

    const report: QbeResponseDto = {
      id: sr.id as string,
      ownerId: sr.ownerId as string,
      isFavorite: !!sr.isFavorite,
      isDefault: !!sr.isDefault,
      createdAt: sr.createdAt as string,
      updatedAt: sr.updatedAt as string,
      name: sr.name as string,
      timeFilter: sr.timeFilter as string,
      fromDate: sr.fromDate as string,
      toDate: sr.toDate as string,
      globalOrderIndex: (sr.globalOrderIndex as number) || 0,
      options: safeJsonParse<IReportOptions>(sr.options as string) || {
        threshold: {},
        isFooterAggregation: false,
        globalFieldIndex: 0,
      },
      charts: [],
      sql: (sr.sql as string) || '',
    };

    // Load charts from the ORIGINAL report
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
   * Save a shared QBE as the current user's own report.
   * Clones the report and its charts with new IDs.
   * Mirrors v3 qbe.service.ts saveShare().
   */
  async saveSharedQbe(sharedId: string, userId: string): Promise<string> {
    const sharedQbe = await this.getSharedById(sharedId, userId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const id = v4();

    try {
      // Create new report entry for current user
      await queryRunner.manager.insert(CoreReport, {
        id,
        name: sharedQbe.name,
        timeFilter: sharedQbe.timeFilter as CoreReport['timeFilter'],
        fromDate: this.dateHelper.formatDate(
          DateFormats.ReportFormatMinutes,
          this.dateHelper.parseISO(sharedQbe.fromDate),
        ) as unknown as Date,
        toDate: this.dateHelper.formatDate(
          DateFormats.ReportFormatMinutes,
          this.dateHelper.parseISO(sharedQbe.toDate),
        ) as unknown as Date,
        options: JSON.stringify(sharedQbe.options || {}),
        ownerId: userId,
        isQbe: 1,
        globalOrderIndex: sharedQbe.globalOrderIndex,
        sql: sharedQbe.sql,
        createdAt: this.dateHelper.formatDate() as unknown as Date,
      });

      // Clone charts with new auto-generated IDs
      if (sharedQbe.charts && sharedQbe.charts.length > 0) {
        const chartInserts = sharedQbe.charts.map((chart) => {
          const dataObject = { ...chart };
          delete (dataObject as Record<string, unknown>).id;
          delete (dataObject as Record<string, unknown>).name;
          delete (dataObject as Record<string, unknown>).type;
          delete (dataObject as Record<string, unknown>).orderIndex;
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

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error saving shared QBE', error);
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_REPORT);
    } finally {
      await queryRunner.release();
    }

    return id;
  }

  // ---------------------------------------------------------------------------
  // Query Execution
  // ---------------------------------------------------------------------------

  /**
   * Validate and execute a QBE query.
   * Delegates to QbeQueryService.processQuery(), strips processedQuery from result.
   * Mirrors v3 qbe.service.ts generateQbe().
   */
  async generateQbe(dto: ProcessQbeDto, userId: string): Promise<QbeRunDto> {
    const result = await this.qbeQueryService.processQuery(
      dto.sql,
      dto.timeFilter,
      dto.fromDate,
      dto.toDate,
      userId,
      dto.isShared,
    );

    // v3 strips processedQuery before returning to client
    delete result.processedQuery;

    return result;
  }

  // ---------------------------------------------------------------------------
  // Tables (QBE Autocomplete)
  // ---------------------------------------------------------------------------

  /**
   * Get accessible statistic tables for QBE autocomplete.
   * Returns tables with their column metadata for SQL editor autocomplete.
   * Mirrors v3 qbe.service.ts privilegedStatisticTables().
   */
  async privilegedStatisticTables(userId: string): Promise<QbeAutoCompleteTablesDto[]> {
    // Query tables the user has access to via privileges (non-default role)
    const tablesQuery = `
      SELECT
        mt.id,
        mt.tableName AS name,
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

    const sideTables: Array<{ id: string; name: string; role: string }> = await this.dataSource.query(tablesQuery, [
      userId,
      userId,
      AvailableRoles.DEFAULT,
      TABLE_TYPE_STATISTICS,
      REF_TABLE_KEY,
    ]);

    // Fetch fields for each table in parallel
    const fieldsPromises = sideTables.map((table, index) => this.fetchTableFields(table.id, table.role, index));
    const fulfilledResults = await Promise.all(fieldsPromises);

    const statisticTables: QbeAutoCompleteTablesDto[] = sideTables.map((table) => ({
      id: table.id,
      name: table.name,
      columns: [],
    }));

    for (const res of fulfilledResults) {
      statisticTables[res.index].columns = res.fields;
    }

    // Fetch the ref table separately and prepend it
    const refTable = await this.fetchRefTable(userId);

    return [refTable, ...statisticTables];
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch column metadata for a table. Filters encrypted fields for non-admin roles.
   */
  private async fetchTableFields(
    tableId: string,
    role: string,
    index: number,
  ): Promise<{ fields: QbeAutoCompleteField[]; index: number }> {
    const isPrivilegedRole =
      role === AvailableRoles.ADMIN || role === AvailableRoles.SUPER_USER || role === AvailableRoles.SUPER_ADMIN;

    const whereClause = isPrivilegedRole ? 'WHERE tId = ?' : 'WHERE tId = ? AND isEncrypted <> 1';

    const fieldsQuery = `
      SELECT id, columnName AS name, type
      FROM core_tables_field ${whereClause}
    `;

    const fields: QbeAutoCompleteField[] = await this.dataSource.query(fieldsQuery, [tableId]);

    return { fields, index };
  }

  /**
   * Fetch the ref table and its columns for QBE autocomplete.
   */
  private async fetchRefTable(userId: string): Promise<QbeAutoCompleteTablesDto> {
    const refTableQuery = `
      SELECT
        mt.id,
        mt.tableName AS name,
        (SELECT Name FROM core_application_roles WHERE Id =
          (SELECT RoleId FROM core_privileges WHERE UserId = ? AND
            ModuleId = (SELECT mId FROM core_modules_tables WHERE Id = mt.id))) AS role
      FROM core_modules_tables mt
      WHERE tableType = ? AND tableName = ?
    `;

    const refTableResult: Array<{ id: string; name: string; role: string }> = await this.dataSource.query(
      refTableQuery,
      [userId, TABLE_TYPE_STATISTICS, REF_TABLE_KEY],
    );

    const refTableData: QbeAutoCompleteTablesDto = {
      id: refTableResult[0]?.id || '',
      name: refTableResult[0]?.name || '',
      columns: [],
    };

    if (refTableData.id) {
      refTableData.columns = (await this.fetchTableFields(refTableData.id, refTableResult[0]?.role || '', 0)).fields;
    }

    return refTableData;
  }

  // ---------------------------------------------------------------------------
  // Chart Generation
  // ---------------------------------------------------------------------------

  /**
   * Build chart generate result from QBE query execution.
   * Mirrors v3 returnGenerateReportResult() when isQbe=true:
   * executes the QBE SQL, maps fields to IFieldsArrayEntry[], returns
   * { query: processedQuery, fieldsArray, tables: [], operation: [] }.
   */
  private async buildQbeGenerateResult(
    dto: ProcessQbeDto,
    userId: string,
  ): Promise<{
    query: string;
    fieldsArray: IFieldsArrayEntry[];
    tables: unknown[];
    operation: ICustomOperationColumn[];
  }> {
    const qbeResult = await this.qbeQueryService.processQuery(
      dto.sql,
      dto.timeFilter,
      dto.fromDate,
      dto.toDate,
      userId,
      dto.isShared,
    );

    // Map QBE fields to IFieldsArrayEntry format (isCustomColumn=true, like v3 QBE)
    const fieldsArray: IFieldsArrayEntry[] = qbeResult.fields.map((val, index) => ({
      draggedId: val.draggedId,
      columnDisplayName: val.columnDisplayName,
      type: val.type,
      operation: val.operation || 'sum',
      isCustomColumn: true,
      customColumnType: 'QBE',
      builtString: '',
      tableIndex: index,
    }));

    return {
      query: qbeResult.processedQuery || '',
      fieldsArray,
      tables: [],
      operation: [],
    };
  }

  /**
   * Generate a chart from QBE data by type.
   * Dispatches to the shared chart generators from Reports module.
   * Mirrors v3 QBE controller chart endpoints.
   */
  async generateChart(chartType: string, dto: GenerateQbeChartDto, userId: string): Promise<IChartData> {
    const generateResult = await this.buildQbeGenerateResult(dto.tabular, userId);
    const chart = dto.chart;
    const dateObject = { fromDate: dto.tabular.fromDate, toDate: dto.tabular.toDate };

    switch (chartType) {
      case 'pie':
        return generatePieChart(generateResult, chart, dateObject, this.legacyDataDb, this.dateHelper, this.coreDbName);
      case 'doughnut':
        return generateDoughnutChart(
          generateResult,
          chart,
          dateObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );
      case 'trend':
        return generateTrendChart(
          generateResult,
          chart,
          dateObject,
          [], // QBE has no compare columns
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );
      case 'vertical_bar':
        return generateVerticalBarChart(
          generateResult,
          chart,
          dateObject,
          [], // QBE has no compare columns
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );
      case 'horizontal_bar':
        return generateHorizontalBarChart(
          generateResult,
          chart,
          dateObject,
          [], // QBE has no compare columns
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );
      case 'progress': {
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
      case 'exploded_progress': {
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
      default:
        this.logger.warn(`Unknown QBE chart type: ${chartType}`);
        return chart;
    }
  }
}
