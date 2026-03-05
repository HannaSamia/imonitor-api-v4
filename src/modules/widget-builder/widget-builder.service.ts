import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 } from 'uuid';
import { CoreWidgetBuilder } from '../../database/entities/core-widget-builder.entity';
import { CoreWidgetBuilderCharts } from '../../database/entities/core-widget-builder-charts.entity';
import { CoreWidgetBuilderModule } from '../../database/entities/core-widget-builder-module.entity';
import { CoreWidgetBuilderUsedTables } from '../../database/entities/core-widget-builder-used-tables.entity';
import { CoreSharedWidgetBuilder } from '../../database/entities/core-shared-widget-builder.entity';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { FETCH_WIDGETCHART_DB_FUNCTION, FETCH_CHART_DB_FUNCTION } from '../reports/constants';
import { ChartTypes, ChartStatus } from '../reports/enums';
import { IChartData, ITabularHeader } from '../reports/dto/report-interfaces';
import { QueryBuilderService, GenerateResultDto } from '../reports/services/query-builder.service';
import { GenerateReportDto } from '../reports/dto/generate-report.dto';
import { generatePie } from '../reports/charts/pie.chart';
import { generateDoughnut } from '../reports/charts/doughnut.chart';
import { generateVerticalBar } from '../reports/charts/vertical-bar.chart';
import { generateHorizontalBar } from '../reports/charts/horizontal-bar.chart';
import { generateProgress } from '../reports/charts/progress.chart';
import { generateExplodedProgress } from '../reports/charts/exploded-progress.chart';
import { isEmptyString } from '../../shared/helpers/common.helper';
import {
  SaveWidgetBuilderDto,
  EditWidgetBuilderDto,
  RenameWidgetBuilderDto,
  ChangeWbOwnerDto,
  ShareWidgetBuilderDto,
} from './dto';
import { GenerateWidgetBuilderDto } from './dto/generate-widget-builder.dto';
import {
  WidgetBuilderResponseDto,
  ListWidgetBuildersDto,
  WidgetBuilderAccessDto,
  SideTablesDto,
} from './dto/widget-builder-response.dto';
import { WidgetBuilderQueryService } from './services/widget-builder-query.service';
import { GenerateChartByTypeDto } from './dto/generate-chart-by-type.dto';
import {
  generateWidgetCounter,
  generateWidgetExplodedCounter,
  generateWidgetPercentage,
  generateWidgetExplodedPercentage,
  generateWidgetSoloBar,
  generateWidgetTopBar,
  generateWidgetTabular,
  generateWidgetTopLeastTable,
  generateWidgetCumulativeTable,
  generateWidgetTrend,
  generateWidgetCompareTrend,
} from './charts';

/** Module table type filter matching v3 ModuleTableTypes.STATISTICS */
const TABLE_TYPE_STATISTICS = 'statistics';

/** Ref table key matching v3 REF_TABLE_KEY */
const REF_TABLE_KEY = 'refTable';

/** Default admin userId matching v3 DEFAULT_ADMIN_ID */
const DEFAULT_ADMIN_ID = '0';

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
export class WidgetBuilderService {
  private readonly logger = new Logger(WidgetBuilderService.name);

  private readonly coreDbName: string;

  constructor(
    @InjectRepository(CoreWidgetBuilder)
    private readonly widgetBuilderRepo: Repository<CoreWidgetBuilder>,
    @InjectRepository(CoreWidgetBuilderCharts)
    private readonly chartsRepo: Repository<CoreWidgetBuilderCharts>,
    @InjectRepository(CoreWidgetBuilderModule)
    private readonly wbModuleRepo: Repository<CoreWidgetBuilderModule>,
    @InjectRepository(CoreWidgetBuilderUsedTables)
    private readonly usedTablesRepo: Repository<CoreWidgetBuilderUsedTables>,
    @InjectRepository(CoreSharedWidgetBuilder)
    private readonly sharedWbRepo: Repository<CoreSharedWidgetBuilder>,
    @InjectRepository(CoreModulesTables)
    private readonly modulesTablesRepo: Repository<CoreModulesTables>,
    @InjectRepository(CoreTablesField)
    private readonly tablesFieldRepo: Repository<CoreTablesField>,
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
    @InjectRepository(CoreApplicationUsers)
    private readonly usersRepo: Repository<CoreApplicationUsers>,
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly dateHelper: DateHelperService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly wbQueryService: WidgetBuilderQueryService,
    private readonly queryBuilderService: QueryBuilderService,
  ) {
    this.coreDbName = this.configService.get<string>('coreDbName', '`iMonitorV3_1`');
  }

  // --- Privileged Tables ---

  /**
   * Get statistics tables the user has privilege on (admin or superuser role),
   * including the ref table and per-table fields.
   * Mirrors v3 privilegedStatisticTables() for widget builders.
   */
  async privilegedStatisticTables(userId: string): Promise<SideTablesDto> {
    const tablesQuery = `
      SELECT
        mt.id,
        mt.displayName,
        (SELECT name FROM core_application_roles WHERE id =
          (SELECT RoleId FROM core_privileges WHERE UserId = ? AND
            ModuleId = mt.id)) AS role
      FROM core_modules_tables mt
      WHERE mId IN (
        SELECT ModuleId FROM core_privileges
        WHERE UserId = ?
        AND RoleId IN (
          SELECT Id FROM core_application_roles
          WHERE name = ? OR name = ?
        )
      )
      AND tableType = ?
      AND tableName <> ?
      ORDER BY displayName
    `;

    const sideTables: Array<{ id: string; displayName: string; role: string }> = await this.dataSource.query(
      tablesQuery,
      [userId, userId, AvailableRoles.ADMIN, AvailableRoles.SUPER_USER, TABLE_TYPE_STATISTICS, REF_TABLE_KEY],
    );

    if (sideTables.length === 0) {
      throw new BadRequestException(ErrorMessages.NO_PRIVILEGED_TABLES);
    }

    const fieldsPromises = sideTables.map((table, index) => this.fetchTableFields(table.id, table.role, index));
    const fulfilledResults = await Promise.all(fieldsPromises);

    const statisticTables = sideTables.map((table) => ({
      id: table.id,
      displayName: table.displayName,
      role: table.role,
      fields: [] as Array<{ id: string; node: string; columnDisplayName: string; type: string; operation: string }>,
    }));

    for (const res of fulfilledResults) {
      statisticTables[res.index].fields = res.fields;
    }

    const refTable = await this.fetchRefTable(userId);

    return {
      tables: [refTable, ...statisticTables],
    };
  }

  // --- Query Execution ---

  /**
   * Execute a widget builder tabular query.
   * Builds the SQL via WidgetBuilderQueryService, executes it against iMonitorData,
   * and returns header + body rows. Mirrors v3 executeQuery().
   */
  async executeQuery(
    tabularObject: GenerateWidgetBuilderDto,
  ): Promise<{ header: ITabularHeader[]; body: Array<Record<string, unknown>> }> {
    const generateResult = await this.wbQueryService.generateWidgetBuilderQuery(tabularObject);

    if (!isEmptyString(generateResult.query)) {
      try {
        const queryResult = await this.legacyDataDb.query<Record<string, unknown>>(generateResult.query);
        return {
          header: generateResult.header,
          body: queryResult,
        };
      } catch (error) {
        this.logger.error('executeQuery failed', (error as Error).stack);
        throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
      }
    }

    return { header: [], body: [] };
  }

  /**
   * Generate a chart by type for a widget builder.
   * Fetches the WB config + chart from DB, builds query, dispatches to correct
   * chart generator based on chart.type. Mirrors v3 generateChartByType().
   */
  async generateChartByType(body: GenerateChartByTypeDto): Promise<IChartData> {
    const wb = await this.widgetBuilderRepo.findOne({
      where: { id: body.widgetBuilderId },
    });
    if (!wb) {
      throw new NotFoundException(ErrorMessages.WIDGET_BUILDER_NOT_FOUND);
    }

    const chart = await this.chartsRepo.findOne({
      where: { id: body.chartId, widgetBuilderId: body.widgetBuilderId },
    });
    if (!chart) {
      throw new NotFoundException(ErrorMessages.CHART_NOT_FOUND);
    }

    const tabularObject: GenerateWidgetBuilderDto = {
      limit: wb.limit ?? undefined,
      tables: safeJsonParse(wb.tables) || [],
      globalFilter: safeJsonParse(wb.globalFilter) || { condition: 'AND', rules: [] },
      orderBy: safeJsonParse(wb.orderBy) || [],
      control: safeJsonParse(wb.control) || [],
      operation: safeJsonParse(wb.operation) || [],
      compare: safeJsonParse(wb.compare) || [],
      priority: safeJsonParse(wb.priority) || [],
      inclusion: safeJsonParse(wb.inclusion) || [],
    };

    const chartObject = JSON.parse(chart.data) as IChartData;
    const chartType = chart.type as ChartTypes;

    return this.dispatchChart(chartType, tabularObject, chartObject);
  }

  /**
   * Dispatch chart generation to the correct chart generator function.
   * Called both by generateChartByType (DB-driven) and by individual
   * controller chart endpoints (body-driven).
   */
  async dispatchChart(
    chartType: ChartTypes,
    tabularObject: GenerateWidgetBuilderDto,
    chartObject: IChartData,
  ): Promise<IChartData> {
    // Shared report charts + WB-only simple charts all need the generateResult first
    const needsGenerateResult = [
      ChartTypes.PIE,
      ChartTypes.DOUGHNUT,
      ChartTypes.VERTICAL_BAR,
      ChartTypes.HORIZONTAL_BAR,
      ChartTypes.PROGRESS,
      ChartTypes.EXPLODED_PROGRESS,
      ChartTypes.COUNTER,
      ChartTypes.EXPLODED_COUNTER,
      ChartTypes.PERCENTAGE,
      ChartTypes.EXPLODED_PERCENTAGE,
      ChartTypes.SOLO_BAR,
      ChartTypes.TOP_LEAST_BAR,
      ChartTypes.TABULAR,
      ChartTypes.TOP_LEAST_TABULAR,
      ChartTypes.TABLE,
    ];

    let generateResult: GenerateResultDto | undefined;
    if (needsGenerateResult.includes(chartType)) {
      generateResult = await this.wbQueryService.generateWidgetBuilderQuery(tabularObject);
    }

    const dateObject = { fromDate: '', toDate: '' };

    switch (chartType) {
      // --- Shared report charts (reuse from Reports module) ---
      case ChartTypes.PIE:
        return generatePie(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          dateObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.DOUGHNUT:
        return generateDoughnut(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          dateObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.VERTICAL_BAR:
        return generateVerticalBar(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          dateObject,
          tabularObject.compare,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.HORIZONTAL_BAR:
        return generateHorizontalBar(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          dateObject,
          tabularObject.compare,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.PROGRESS:
        return generateProgress(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          dateObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        ) as unknown as Promise<IChartData>;

      case ChartTypes.EXPLODED_PROGRESS:
        return generateExplodedProgress(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          dateObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        ) as unknown as Promise<IChartData>;

      // --- WB-only simple charts ---
      case ChartTypes.COUNTER:
        return generateWidgetCounter(
          { query: generateResult!.query, fieldsArray: generateResult!.fieldsArray, header: generateResult!.header },
          chartObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.EXPLODED_COUNTER:
        return generateWidgetExplodedCounter(
          { query: generateResult!.query, fieldsArray: generateResult!.fieldsArray },
          chartObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.PERCENTAGE:
        return generateWidgetPercentage(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.EXPLODED_PERCENTAGE:
        return generateWidgetExplodedPercentage(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.SOLO_BAR:
        return generateWidgetSoloBar(
          { query: generateResult!.query, fieldsArray: generateResult!.fieldsArray },
          chartObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.TOP_LEAST_BAR:
        return generateWidgetTopBar(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.TABULAR:
      case ChartTypes.TABLE:
        return generateWidgetTabular(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            header: generateResult!.header,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          tabularObject.orderBy,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      case ChartTypes.TOP_LEAST_TABULAR:
        return generateWidgetTopLeastTable(
          {
            query: generateResult!.query,
            fieldsArray: generateResult!.fieldsArray,
            header: generateResult!.header,
            tables: tabularObject.tables,
            operation: tabularObject.operation,
          },
          chartObject,
          this.legacyDataDb,
          this.dateHelper,
          this.coreDbName,
        );

      // --- WB-only complex charts (handle query generation internally) ---
      case ChartTypes.CUMULATIVE_TABLE:
        return generateWidgetCumulativeTable(
          {
            tables: tabularObject.tables,
            orderBy: tabularObject.orderBy,
            operation: tabularObject.operation,
            timeFilter: tabularObject.timeFilter,
          },
          chartObject,
          {
            legacyDataDb: this.legacyDataDb,
            dateHelper: this.dateHelper,
            coreDbName: this.coreDbName,
            generateReport: (dto, maxInterval, timeFilter, dateFormat, converter) =>
              this.queryBuilderService.generate(dto, maxInterval, timeFilter, dateFormat, converter),
            getRefTableId: () => this.getRefTableId(),
            getDateFieldForTable: (tableId) => this.getDateFieldForTable(tableId),
          },
        );

      case ChartTypes.WIDGET_BUILDER_TREND:
        return generateWidgetTrend(
          {
            tables: tabularObject.tables,
            compare: tabularObject.compare,
            operation: tabularObject.operation,
            timeFilter: tabularObject.timeFilter,
          },
          chartObject,
          {
            legacyDataDb: this.legacyDataDb,
            dateHelper: this.dateHelper,
            coreDbName: this.coreDbName,
            generateReport: (dto, maxInterval, timeFilter, dateFormat, converter) =>
              this.queryBuilderService.generate(dto, maxInterval, timeFilter, dateFormat, converter),
            getRefTableId: () => this.getRefTableId(),
            getDateFieldForTable: (tableId) => this.getDateFieldForTable(tableId),
          },
        );

      case ChartTypes.COMPARE_TREND:
        return generateWidgetCompareTrend(
          {
            tables: tabularObject.tables,
            compare: tabularObject.compare,
            operation: tabularObject.operation,
            control: tabularObject.control,
            priority: tabularObject.priority,
            inclusion: tabularObject.inclusion,
            timeFilter: tabularObject.timeFilter,
          },
          chartObject,
          {
            legacyDataDb: this.legacyDataDb,
            dateHelper: this.dateHelper,
            coreDbName: this.coreDbName,
            generateReport: (dto, maxInterval, timeFilter, dateFormat, converter) =>
              this.queryBuilderService.generate(dto, maxInterval, timeFilter, dateFormat, converter),
            getRefTableId: () => this.getRefTableId(),
            getDateFieldForTable: (tableId) => this.getDateFieldForTable(tableId),
          },
        );

      default:
        throw new BadRequestException(`Unsupported chart type: ${chartType}`);
    }
  }

  /**
   * Get the refTable ID from core_modules_tables.
   */
  private async getRefTableId(): Promise<string> {
    const result: Array<{ id: string }> = await this.dataSource.query(
      'SELECT id FROM core_modules_tables WHERE tableName = ? AND tableType = ? LIMIT 1',
      [REF_TABLE_KEY, TABLE_TYPE_STATISTICS],
    );
    return result.length > 0 ? result[0].id : '';
  }

  /**
   * Get the datetime field info for a table.
   */
  private async getDateFieldForTable(
    tableId: string,
  ): Promise<{ id: string; columnName: string; columnDisplayName: string } | null> {
    const result: Array<{ id: string; columnName: string; columnDisplayName: string }> = await this.dataSource.query(
      'SELECT id, columnName, columnDisplayName FROM core_tables_field WHERE tId = ? AND type = ? LIMIT 1',
      [tableId, 'datetime'],
    );
    return result.length > 0 ? result[0] : null;
  }

  // --- CRUD ---

  /**
   * List all widget builders for the current user: own, default, and shared.
   * Filters out widget builders where user lacks privilege on used tables.
   * Mirrors v3 list().
   */
  async list(userId: string): Promise<ListWidgetBuildersDto[]> {
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
        (SELECT userName FROM core_application_users WHERE id = ownerId) AS owner
      FROM core_widget_builder
      WHERE ownerId = ? OR isDefault = 1

      UNION

      SELECT
        swb.id AS id,
        wb.name AS name,
        swb.isFavorite AS isFavorite,
        true AS isShared,
        DATE_FORMAT(swb.createdAt, '%Y-%m-%d %H:%i') AS createdAt,
        DATE_FORMAT(wb.updatedAt, '%Y-%m-%d %H:%i') AS updatedAt,
        0 AS isDefault,
        wb.ownerId,
        (SELECT userName FROM core_application_users WHERE id = wb.ownerId) AS owner
      FROM core_shared_widget_builder swb, core_widget_builder wb
      WHERE swb.ownerId = ? AND swb.widgetBuilderId = wb.id
      ORDER BY isDefault DESC, isFavorite DESC, updatedAt DESC, createdAt DESC, name DESC
    `;

    const widgetBuilders: ListWidgetBuildersDto[] = await this.dataSource.query(selectQuery, [userId, userId]);

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

    // Filter widget builders where user does NOT have privilege on all used tables
    let wbIndex = widgetBuilders.length;
    while (wbIndex--) {
      const wb = widgetBuilders[wbIndex];

      if (wb.isShared || userId === DEFAULT_ADMIN_ID) {
        continue;
      }

      const usedTablesQuery = `
        SELECT GROUP_CONCAT(CONCAT('"', tableId, '"')) AS usedTables
        FROM core_widget_builder_used_tables
        WHERE widgetBuilderId = ?
      `;

      const usedTablesResult: Array<{ usedTables: string }> = await this.dataSource.query(usedTablesQuery, [wb.id]);

      const usedTablesRaw = usedTablesResult[0]?.usedTables;
      let usedTables: string[] = usedTablesRaw ? JSON.parse('[' + usedTablesRaw + ']') : [];
      usedTables = usedTables.length === 1 && usedTables[0] == null ? [] : usedTables;

      const hasPriv = usedTables.every((tableId) => privilegedTables.includes(tableId));

      if (!hasPriv) {
        widgetBuilders.splice(wbIndex, 1);
      }
    }

    return widgetBuilders;
  }

  /**
   * Get a single widget builder by ID with parsed JSON columns and loaded charts.
   * Mirrors v3 getWidgetBuilderById().
   */
  async getById(widgetBuilderId: string, userId: string, checkAccess = true): Promise<WidgetBuilderResponseDto> {
    const dbWb = await this.widgetBuilderRepo.findOne({ where: { id: widgetBuilderId } });

    if (!dbWb) {
      throw new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST);
    }

    if (userId !== dbWb.ownerId && !dbWb.isDefault && checkAccess) {
      throw new BadRequestException(ErrorMessages.ACCESS_DENIED);
    }

    const wb: WidgetBuilderResponseDto = {
      id: dbWb.id,
      name: dbWb.name,
      ownerId: dbWb.ownerId,
      isFavorite: !!dbWb.isFavorite,
      isDefault: !!dbWb.isDefault,
      createdAt: dbWb.createdAt as unknown as string,
      updatedAt: dbWb.updatedAt as unknown as string,
      limit: dbWb.limit as number,
      tables: safeJsonParse(dbWb.tables) || [],
      globalFilter: safeJsonParse(dbWb.globalFilter) || {},
      orderBy: safeJsonParse(dbWb.orderBy) || [],
      control: safeJsonParse(dbWb.control) || [],
      operation: safeJsonParse(dbWb.operation) || [],
      compare: safeJsonParse(dbWb.compare) || [],
      priority: safeJsonParse(dbWb.priority) || [],
      inclusion: safeJsonParse(dbWb.inclusion) || [],
      options: safeJsonParse(dbWb.options) || { threshold: {}, isFooterAggregation: false, globalFieldIndex: 0 },
      globalOrderIndex: dbWb.globalOrderIndex || 0,
      charts: [],
    };

    // Load charts using JSON_INSERT to merge metadata into data column
    const chartsQuery = `
      SELECT ${FETCH_WIDGETCHART_DB_FUNCTION} AS data
      FROM core_widget_builder_charts WHERE widgetBuilderId = ? ORDER BY orderIndex
    `;
    const chartsResult: Array<{ data: string }> = await this.dataSource.query(chartsQuery, [wb.id]);

    for (const chartResult of chartsResult) {
      const chart = JSON.parse(chartResult.data) as IChartData;
      wb.charts.push(chart);
    }

    return wb;
  }

  /**
   * Get a shared widget builder by its shared entry ID.
   * Loads the original widget builder data and its charts via the original widgetBuilderId.
   * Mirrors v3 getSharedWidgetBuilderById().
   */
  async getSharedById(sharedWbId: string): Promise<WidgetBuilderResponseDto> {
    const selectQuery = `
      SELECT
        swb.id,
        swb.widgetBuilderId,
        swb.ownerId,
        swb.isFavorite,
        FALSE AS isDefault,
        wb.name,
        wb.createdAt,
        wb.updatedAt,
        wb.\`limit\`,
        wb.\`tables\`,
        wb.globalFilter,
        wb.options,
        wb.orderBy,
        wb.compare,
        wb.control,
        wb.operation,
        wb.inclusion,
        wb.priority,
        wb.globalOrderIndex
      FROM core_shared_widget_builder swb
      LEFT JOIN core_widget_builder wb ON swb.widgetBuilderId = wb.id
      WHERE swb.id = ?
    `;

    const result: Array<Record<string, unknown>> = await this.dataSource.query(selectQuery, [sharedWbId]);

    if (result.length <= 0) {
      throw new BadRequestException(ErrorMessages.SHARED_WIDGET_BUILDER_DOES_NOT_EXIST);
    }

    const sr = result[0];

    const wb: WidgetBuilderResponseDto = {
      id: sr.id as string,
      name: sr.name as string,
      ownerId: sr.ownerId as string,
      isFavorite: !!sr.isFavorite,
      isDefault: !!sr.isDefault,
      createdAt: sr.createdAt as string,
      updatedAt: sr.updatedAt as string,
      limit: sr.limit as number,
      tables: safeJsonParse(sr.tables as string) || [],
      globalFilter: safeJsonParse(sr.globalFilter as string) || {},
      orderBy: safeJsonParse(sr.orderBy as string) || [],
      control: safeJsonParse(sr.control as string) || [],
      operation: safeJsonParse(sr.operation as string) || [],
      compare: safeJsonParse(sr.compare as string) || [],
      priority: safeJsonParse(sr.priority as string) || [],
      inclusion: safeJsonParse(sr.inclusion as string) || [],
      options: safeJsonParse(sr.options as string) || {
        threshold: {},
        isFooterAggregation: false,
        globalFieldIndex: 0,
      },
      globalOrderIndex: (sr.globalOrderIndex as number) || 0,
      charts: [],
    };

    // Load charts from the ORIGINAL widget builder
    const chartsQuery = `
      SELECT ${FETCH_CHART_DB_FUNCTION} AS data
      FROM core_widget_builder_charts WHERE widgetBuilderId = ? ORDER BY orderIndex
    `;
    const chartsResult: Array<{ data: string }> = await this.dataSource.query(chartsQuery, [
      sr.widgetBuilderId as string,
    ]);

    for (const chartResult of chartsResult) {
      const chart = JSON.parse(chartResult.data) as IChartData;
      wb.charts.push(chart);
    }

    return wb;
  }

  /**
   * Save a new widget builder with charts, modules, and used tables.
   * Uses a transaction for atomicity.
   * Mirrors v3 save().
   */
  async save(dto: SaveWidgetBuilderDto, userId: string): Promise<string> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const id = v4();
    const wbModules = new Set<string>();
    const wbTables: Array<[string, string, string]> = [];

    try {
      // Look up moduleId for each table + validate user role
      for (const table of dto.tables) {
        const moduleTable = await queryRunner.manager.findOne(CoreModulesTables, {
          where: { id: table.id },
          select: { mId: true },
        });
        if (moduleTable) {
          // Check user role on module — must not be 'user' role
          const roleResult: Array<{ name: string }> = await queryRunner.query(
            `SELECT name FROM core_application_roles WHERE id =
              (SELECT RoleId FROM core_privileges WHERE ModuleId =
                (SELECT mId FROM core_modules_tables WHERE id = ?) AND UserId = ?)`,
            [table.id, userId],
          );
          if (roleResult.length > 0 && roleResult[0].name === AvailableRoles.USER) {
            throw new BadRequestException(ErrorMessages.USER_NOT_PRIVILEGED_TO_SAVE);
          }
          wbModules.add(String(moduleTable.mId));
          wbTables.push([id, table.id, table.displayName]);
        }
      }

      // Insert the widget builder
      await queryRunner.manager.insert(CoreWidgetBuilder, {
        id,
        name: dto.name,
        limit: dto.limit,
        tables: JSON.stringify(dto.tables),
        control: JSON.stringify(dto.control),
        compare: JSON.stringify(dto.compare),
        operation: JSON.stringify(dto.operation),
        globalFilter: JSON.stringify(dto.globalFilter),
        orderBy: JSON.stringify(dto.orderBy),
        options: JSON.stringify(dto.options),
        inclusion: JSON.stringify(dto.inclusion || []),
        priority: JSON.stringify(dto.priority || []),
        globalOrderIndex: dto.globalOrderIndex,
        ownerId: userId,
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
            notification: '{}',
            createdAt: this.dateHelper.formatDate() as unknown as Date,
            createdBy: userId,
            widgetBuilderId: id,
          };
        });
        await queryRunner.manager.insert(CoreWidgetBuilderCharts, chartInserts);
      }

      // Insert widget builder module associations
      if (wbModules.size > 0) {
        const moduleInserts = Array.from(wbModules).map((moduleId) => ({
          widgetBuilderId: id,
          moduleId,
        }));
        await queryRunner.manager.insert(CoreWidgetBuilderModule, moduleInserts);
      }

      // Insert used tables
      if (wbTables.length > 0) {
        const usedTableInserts = wbTables.map(([wbId, tableId, tableName]) => ({
          widgetBuilderId: wbId,
          tableId,
          tableName,
        }));
        await queryRunner.manager.insert(CoreWidgetBuilderUsedTables, usedTableInserts);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Error saving widget builder', error);
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_WIDGETBUILDER);
    } finally {
      await queryRunner.release();
    }

    return id;
  }

  /**
   * Update an existing widget builder: update fields, re-insert modules/used-tables,
   * and process chart changes by chartsStatus (created/edited/deleted).
   * Mirrors v3 update().
   */
  async update(dto: EditWidgetBuilderDto, userId: string): Promise<void> {
    const id = dto.id;
    const wbModules = new Set<string>();
    const wbTables: Array<[string, string, string]> = [];

    // Validate ownership
    const existing = await this.widgetBuilderRepo.findOne({
      where: { id },
      select: { ownerId: true },
    });
    if (!existing) {
      throw new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST);
    }
    if (existing.ownerId !== userId) {
      throw new BadRequestException(ErrorMessages.USER_NOT_PRIVILEGED_TO_SAVE);
    }

    // Look up moduleId for each table
    for (const table of dto.tables) {
      const moduleTable = await this.modulesTablesRepo.findOne({
        where: { id: table.id },
        select: { mId: true },
      });
      if (moduleTable) {
        wbModules.add(String(moduleTable.mId));
        wbTables.push([id, table.id, table.displayName]);
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update the widget builder
      await queryRunner.manager.update(
        CoreWidgetBuilder,
        { id },
        {
          name: dto.name,
          limit: dto.limit,
          tables: JSON.stringify(dto.tables),
          control: JSON.stringify(dto.control),
          compare: JSON.stringify(dto.compare),
          operation: JSON.stringify(dto.operation),
          priority: JSON.stringify(dto.priority || []),
          inclusion: JSON.stringify(dto.inclusion || []),
          globalFilter: JSON.stringify(dto.globalFilter),
          orderBy: JSON.stringify(dto.orderBy),
          options: JSON.stringify(dto.options),
          globalOrderIndex: dto.globalOrderIndex,
          updatedAt: this.dateHelper.formatDate() as unknown as Date,
        },
      );

      // Delete and re-insert modules and used tables
      await queryRunner.manager.delete(CoreWidgetBuilderModule, { widgetBuilderId: id });
      await queryRunner.manager.delete(CoreWidgetBuilderUsedTables, { widgetBuilderId: id });

      if (wbModules.size > 0) {
        const moduleInserts = Array.from(wbModules).map((moduleId) => ({
          widgetBuilderId: id,
          moduleId,
        }));
        await queryRunner.manager.insert(CoreWidgetBuilderModule, moduleInserts);
      }

      if (wbTables.length > 0) {
        const usedTableInserts = wbTables.map(([wbId, tableId, tableName]) => ({
          widgetBuilderId: wbId,
          tableId,
          tableName,
        }));
        await queryRunner.manager.insert(CoreWidgetBuilderUsedTables, usedTableInserts);
      }

      // Process charts by status
      const chartsStatus = { ...dto.chartsStatus };

      for (const chart of dto.charts) {
        const dataObject = { ...chart };
        delete (dataObject as Record<string, unknown>).id;
        delete (dataObject as Record<string, unknown>).name;
        delete (dataObject as Record<string, unknown>).type;
        delete (dataObject as Record<string, unknown>).orderIndex;
        const dataString = JSON.stringify(dataObject);

        if (chartsStatus && chartsStatus[chart.id] !== undefined) {
          if (chartsStatus[chart.id] === ChartStatus.EDITED) {
            await queryRunner.manager.update(
              CoreWidgetBuilderCharts,
              { id: chart.id },
              {
                name: chart.name,
                type: chart.type,
                orderIndex: chart.orderIndex,
                data: dataString,
              },
            );
          } else if (chartsStatus[chart.id] === ChartStatus.DELETED) {
            await queryRunner.manager.delete(CoreWidgetBuilderCharts, { id: chart.id });
          } else if (chartsStatus[chart.id] === ChartStatus.CREATED) {
            await queryRunner.manager.insert(CoreWidgetBuilderCharts, {
              id: chart.id || v4(),
              name: chart.name,
              type: chart.type,
              orderIndex: chart.orderIndex,
              data: dataString,
              notification: '{}',
              createdAt: this.dateHelper.formatDate() as unknown as Date,
              createdBy: userId,
              widgetBuilderId: id,
            });
          }
          delete chartsStatus[chart.id];
        }
      }

      // Handle remaining deleted charts not in the charts array
      if (chartsStatus) {
        for (const chartId of Object.keys(chartsStatus)) {
          if (chartsStatus[chartId] === ChartStatus.DELETED) {
            await queryRunner.manager.delete(CoreWidgetBuilderCharts, { id: chartId });
          }
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Error updating widget builder', error);
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Delete a widget builder after validation:
   * - exists, user is admin on modules, not used in dashboards.
   * Mirrors v3 deleteWidgetBuilder().
   */
  async delete(userId: string, widgetBuilderId: string): Promise<string> {
    const wbExists = await this.widgetBuilderRepo.findOne({
      where: { id: widgetBuilderId },
      select: { id: true },
    });
    if (!wbExists) {
      throw new NotFoundException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST);
    }

    // Check user has admin role on all WB modules
    const wbModules = await this.wbModuleRepo.find({
      where: { widgetBuilderId },
      select: { moduleId: true },
    });

    if (wbModules.length > 0) {
      await this.validateUserIsAdminOnModules(userId, wbModules);
    } else {
      throw new BadRequestException(ErrorMessages.WIDGET_DOES_NOT_HAVE_MODULES);
    }

    // Check widget builder is not used in a dashboard
    const dashboardResult: Array<{ dashboardNames: string }> = await this.dataSource.query(
      `SELECT GROUP_CONCAT(CONCAT('"', \`name\`, '"')) AS dashboardNames
         FROM core_dashboard_widget_builder AS d_widgets
         LEFT JOIN core_dashboard ON id = d_widgets.dashboardId
         WHERE widgetBuilderId = ?`,
      [widgetBuilderId],
    );

    if (dashboardResult.length > 0 && dashboardResult[0].dashboardNames != null) {
      throw new BadRequestException(
        ErrorMessages.WIDGET_BUILDER_IS_BEING_USED_IN_THE_FOLLOWING_DASHBOARDS + dashboardResult[0].dashboardNames,
      );
    }

    try {
      await this.widgetBuilderRepo.delete({ id: widgetBuilderId });
    } catch (error) {
      this.logger.error('Error deleting widget builder', error);
      throw new BadRequestException(ErrorMessages.ERROR_DELETE);
    }

    return ErrorMessages.WIDGET_BUILDER_DELETED;
  }

  // --- Sharing ---

  /**
   * Share a widget builder with multiple users.
   * Mirrors v3 share().
   */
  async share(widgetBuilderId: string, dto: ShareWidgetBuilderDto): Promise<void> {
    const wbExists = await this.widgetBuilderRepo.findOne({
      where: { id: widgetBuilderId },
      select: { id: true },
    });
    if (!wbExists) {
      throw new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST);
    }

    try {
      const sharedInserts = dto.userIds.map((userId) => ({
        widgetBuilderId,
        ownerId: userId,
        createdAt: this.dateHelper.formatDate() as unknown as Date,
      }));
      await this.sharedWbRepo.insert(sharedInserts);
    } catch (error) {
      this.logger.error('Error sharing widget builder', error);
      throw new BadRequestException(ErrorMessages.ERROR_SHARE);
    }
  }

  /**
   * Save a shared widget builder as the user's own copy.
   * Creates a new widget builder with new UUID, copies charts, modules, and used tables.
   * Mirrors v3 saveSharedWidgetBuilder().
   */
  async saveSharedWidgetBuilder(sharedWbId: string, userId: string): Promise<string> {
    const sharedWb = await this.getSharedById(sharedWbId);

    if (!sharedWb) {
      throw new BadRequestException(ErrorMessages.SHARED_WIDGET_BUILDER_DOES_NOT_EXIST);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const id = v4();
    const wbModules = new Set<string>();
    const wbTables: Array<[string, string, string]> = [];

    try {
      // Validate user has privilege on each table's module
      for (const table of sharedWb.tables) {
        const moduleTable = await queryRunner.manager.findOne(CoreModulesTables, {
          where: { id: table.id },
          select: { mId: true },
        });

        if (moduleTable) {
          const roleResult: Array<{ name: string }> = await queryRunner.query(
            `SELECT name FROM core_application_roles WHERE id =
              (SELECT RoleId FROM core_privileges WHERE ModuleId = ? AND UserId = ?)`,
            [moduleTable.mId, userId],
          );

          if (
            roleResult.length > 0 &&
            (roleResult[0].name === AvailableRoles.DEFAULT || roleResult[0].name === AvailableRoles.USER)
          ) {
            throw new BadRequestException(ErrorMessages.USER_NOT_PRIVILEGED_TO_SAVE);
          }

          wbModules.add(String(moduleTable.mId));
          wbTables.push([id, table.id, table.displayName]);
        }
      }

      // Create the new widget builder
      await queryRunner.manager.insert(CoreWidgetBuilder, {
        id,
        name: sharedWb.name,
        limit: sharedWb.limit,
        tables: JSON.stringify(sharedWb.tables),
        control: JSON.stringify(sharedWb.control),
        compare: JSON.stringify(sharedWb.compare),
        operation: JSON.stringify(sharedWb.operation),
        globalFilter: JSON.stringify(sharedWb.globalFilter),
        orderBy: JSON.stringify(sharedWb.orderBy),
        options: JSON.stringify(sharedWb.options),
        inclusion: JSON.stringify(sharedWb.inclusion || []),
        priority: JSON.stringify(sharedWb.priority || []),
        globalOrderIndex: sharedWb.globalOrderIndex,
        ownerId: userId,
        createdAt: this.dateHelper.formatDate() as unknown as Date,
      });

      // Copy charts (new IDs)
      if (sharedWb.charts && sharedWb.charts.length > 0) {
        const chartInserts = sharedWb.charts.map((chart) => {
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
            notification: '{}',
            createdAt: this.dateHelper.formatDate() as unknown as Date,
            createdBy: userId,
            widgetBuilderId: id,
          };
        });
        await queryRunner.manager.insert(CoreWidgetBuilderCharts, chartInserts);
      }

      // Insert module associations
      if (wbModules.size > 0) {
        const moduleInserts = Array.from(wbModules).map((moduleId) => ({
          widgetBuilderId: id,
          moduleId,
        }));
        await queryRunner.manager.insert(CoreWidgetBuilderModule, moduleInserts);
      }

      // Insert used tables
      if (wbTables.length > 0) {
        const usedTableInserts = wbTables.map(([wbId, tableId, tableName]) => ({
          widgetBuilderId: wbId,
          tableId,
          tableName,
        }));
        await queryRunner.manager.insert(CoreWidgetBuilderUsedTables, usedTableInserts);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Error saving shared widget builder', error);
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_WIDGETBUILDER);
    } finally {
      await queryRunner.release();
    }

    return id;
  }

  // --- Management ---

  /**
   * Toggle the isFavorite status on a widget builder or shared widget builder.
   * Mirrors v3 favorite().
   */
  async favorite(widgetBuilderId: string, isShared: boolean): Promise<boolean> {
    if (isShared) {
      const sharedWb = await this.sharedWbRepo.findOne({
        where: { id: widgetBuilderId },
        select: { isFavorite: true },
      });
      const newValue = !sharedWb?.isFavorite;
      await this.sharedWbRepo.update({ id: widgetBuilderId }, { isFavorite: newValue });
      return newValue;
    } else {
      const wb = await this.widgetBuilderRepo.findOne({
        where: { id: widgetBuilderId },
        select: { isFavorite: true },
      });
      const newValue = !wb?.isFavorite;
      await this.widgetBuilderRepo.update({ id: widgetBuilderId }, { isFavorite: newValue });
      return newValue;
    }
  }

  /**
   * Rename a widget builder. Validates the widget builder exists and user has admin role on modules.
   * Mirrors v3 changeWidgetBuilderName().
   */
  async rename(dto: RenameWidgetBuilderDto, userId: string): Promise<string> {
    const wbModules = await this.wbModuleRepo.find({
      where: { widgetBuilderId: dto.widgetBuilderId },
      select: { moduleId: true },
    });

    if (wbModules.length > 0) {
      await this.validateUserIsAdminOnModules(userId, wbModules);
    } else {
      throw new BadRequestException(ErrorMessages.WIDGET_DOES_NOT_HAVE_MODULES);
    }

    try {
      await this.widgetBuilderRepo.update({ id: dto.widgetBuilderId }, { name: dto.name });
    } catch (error) {
      this.logger.error('Error renaming widget builder', error);
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    }

    return ErrorMessages.WIDGET_BUILDER_NAME_UPDATED;
  }

  /**
   * Transfer widget builder ownership to a new user.
   * Also deletes any dashboards using this widget builder.
   * Mirrors v3 changeWidgetBuilderOwner().
   */
  async changeOwner(dto: ChangeWbOwnerDto, userId: string): Promise<string> {
    const userExists = await this.usersRepo.findOne({
      where: { id: dto.newOwnerId },
      select: { id: true },
    });
    if (!userExists) {
      throw new BadRequestException(ErrorMessages.USER_NOT_FOUND);
    }

    const wb = await this.widgetBuilderRepo.findOne({
      where: { id: dto.widgetBuilderId },
      select: { ownerId: true },
    });
    if (!wb) {
      throw new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST);
    }

    const wbModules = await this.wbModuleRepo.find({
      where: { widgetBuilderId: dto.widgetBuilderId },
      select: { moduleId: true },
    });

    if (wbModules.length > 0) {
      await this.validateUserIsAdminOnModules(userId, wbModules);
    } else {
      throw new BadRequestException(ErrorMessages.WIDGET_DOES_NOT_HAVE_MODULES);
    }

    if (wb.ownerId === dto.newOwnerId) {
      throw new BadRequestException(ErrorMessages.USER_ALREADY_OWNS_WIDGET_BUILDER);
    }

    try {
      await this.widgetBuilderRepo.update({ id: dto.widgetBuilderId }, { ownerId: dto.newOwnerId });
    } catch (error) {
      this.logger.error('Error updating widget builder owner', error);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }

    // Delete dashboards using this widget builder (ownership transfer invalidates them)
    try {
      await this.dataSource.query(
        `DELETE FROM core_dashboard WHERE id IN (
          SELECT dashboardId FROM core_dashboard_widget_builder WHERE widgetBuilderId = ?
        )`,
        [dto.widgetBuilderId],
      );
    } catch {
      this.logger.warn('Error deleting related dashboards for widget builder owner change');
    }

    return ErrorMessages.WIDGET_OWNER_UPDATED;
  }

  /**
   * Check if a user has access to a widget builder (owned or shared).
   * Mirrors v3 hasAccess().
   */
  async hasAccess(widgetBuilderId: string, userId: string): Promise<WidgetBuilderAccessDto> {
    // Check own widget builders
    const ownQuery = `
      SELECT id AS widgetBuilderId, false AS shared
      FROM core_widget_builder WHERE ownerId = ? AND id = ?
    `;
    const ownResult: Array<WidgetBuilderAccessDto> = await this.dataSource.query(ownQuery, [userId, widgetBuilderId]);

    if (ownResult.length > 0) {
      return ownResult[0];
    }

    // Check shared widget builders
    const sharedQuery = `
      SELECT id AS widgetBuilderId, true AS shared
      FROM core_shared_widget_builder WHERE ownerId = ? AND widgetBuilderId = ?
    `;
    const sharedResult: Array<WidgetBuilderAccessDto> = await this.dataSource.query(sharedQuery, [
      userId,
      widgetBuilderId,
    ]);

    if (sharedResult.length > 0) {
      return sharedResult[0];
    }

    // Check default widget builders
    const defaultQuery = `
      SELECT id AS widgetBuilderId, false AS shared
      FROM core_widget_builder WHERE id = ? AND isDefault = 1
    `;
    const defaultResult: Array<WidgetBuilderAccessDto> = await this.dataSource.query(defaultQuery, [widgetBuilderId]);

    if (defaultResult.length > 0) {
      return defaultResult[0];
    }

    throw new BadRequestException(ErrorMessages.ACCESS_DENIED);
  }

  /**
   * Close a chart tab by deleting the chart.
   * Mirrors v3 closeTab().
   */
  async closeTab(widgetBuilderId: string, chartId: string): Promise<void> {
    const wbExists = await this.widgetBuilderRepo.findOne({
      where: { id: widgetBuilderId },
      select: { id: true },
    });
    if (!wbExists) {
      throw new NotFoundException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST);
    }

    await this.chartsRepo.delete({ id: chartId, widgetBuilderId });
  }

  // --- Private Helpers ---

  /**
   * Fetch fields for a specific table.
   */
  private async fetchTableFields(
    tableId: string,
    role: string,
    index: number,
  ): Promise<{
    index: number;
    fields: Array<{ id: string; node: string; columnDisplayName: string; type: string; operation: string }>;
  }> {
    const fieldsQuery = `
      SELECT id, node, columnDisplayName, type, operation
      FROM core_tables_field
      WHERE tableId = ?
      ORDER BY columnDisplayName
    `;
    const fields: Array<{ id: string; node: string; columnDisplayName: string; type: string; operation: string }> =
      await this.dataSource.query(fieldsQuery, [tableId]);
    return { index, fields };
  }

  /**
   * Fetch the ref table and its fields for the user.
   */
  private async fetchRefTable(userId: string): Promise<{
    id: string;
    displayName: string;
    role: string;
    fields: Array<{ id: string; node: string; columnDisplayName: string; type: string; operation: string }>;
  }> {
    const refQuery = `
      SELECT id, displayName, 'admin' AS role
      FROM core_modules_tables
      WHERE tableName = ?
      AND tableType = ?
    `;
    const refResult: Array<{ id: string; displayName: string; role: string }> = await this.dataSource.query(refQuery, [
      REF_TABLE_KEY,
      TABLE_TYPE_STATISTICS,
    ]);

    if (refResult.length === 0) {
      return { id: '', displayName: 'Parameters', role: 'admin', fields: [] };
    }

    const refTable = refResult[0];
    const fieldResult = await this.fetchTableFields(refTable.id, refTable.role, 0);
    return { ...refTable, fields: fieldResult.fields };
  }

  /**
   * Validate that a user has admin role on all specified modules.
   * Throws BadRequestException if the user is not admin on any module.
   */
  private async validateUserIsAdminOnModules(userId: string, modules: Array<{ moduleId: string }>): Promise<void> {
    for (const mod of modules) {
      const isAdminResult: Array<Record<string, unknown>> = await this.dataSource.query(
        `SELECT 1 FROM core_application_roles WHERE name = ? AND id =
          (SELECT roleId FROM core_privileges WHERE userId = ? AND moduleId = ?)`,
        [AvailableRoles.ADMIN, userId, mod.moduleId],
      );
      if (isAdminResult.length <= 0) {
        throw new BadRequestException(ErrorMessages.UNAUTHORIZED_ROLE);
      }
    }
  }
}
