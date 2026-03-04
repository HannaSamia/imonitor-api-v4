/**
 * QueryBuilderService - Dynamic SQL generation engine for reports.
 *
 * Faithfully ported from v3 infrastructure/services/queryBuilder.service.ts.
 * Generates complex multi-table JOIN queries with date dimensions, parameter tables,
 * alpha fields, custom columns (compare, control, operation, priority, inclusion),
 * global filter optimization (WHERE / HAVING split), and ORDER BY / LIMIT.
 *
 * Key architectural differences from v3:
 * - InversifyJS -> NestJS DI
 * - _systemRepository.retriveSystemValue() -> SystemConfigService.getConfigValue()
 * - _systemRepository.retriveSystemValueFromList() -> SystemConfigService.getConfigValues()
 * - _systemRepository.GetConfigQuery() -> replaced with cached config values (performance)
 * - _systemRepository.findOne() / .find() -> DataSource.query() with raw SQL
 * - process.env.dataDbName / coreDbName -> ConfigService.get()
 * - _dateHelper -> DateHelperService (same API)
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SystemConfigService } from '../../../shared/services/system-config.service';
import { DateHelperService, DATE_FULL_TIME } from '../../../shared/services/date-helper.service';
import {
  ITabularTable,
  IMinimalTabularTable,
  IReportField,
  IReportGlobalFilter,
  IGlobalFilterRule,
  ITabularHeader,
  ITabularOrderBy,
  ICustomCompareColumn,
  ICustomControlColumn,
  ICustomOperationColumn,
  IOperationColumn,
  IOperationOperatorColumn,
  OperationColumnType,
} from '../dto/report-interfaces';
import { GenerateReportDto } from '../dto/generate-report.dto';
import { dbDateAdd, dbDateFormat, dbIfNull, dbRound, dbTruncate, dbDecrypt } from '../utils/sql-helpers';
import {
  REF_TABLE_KEY,
  REF_TABLE_ID,
  INNER_QUERY_KEY,
  INNER_GROUP_BY_KEY,
  OUTER_QUERY_INNER_VALUE_KEY,
  ALPHA_NODE_NAME,
  NODE_NAME,
  REF_NODE_NAME,
  SPACE_COMMA_SPACE_KEY,
  SPACE_UNION_SPACE_KEY,
  SPACE_AND_SPACE_KEY,
  UNKNOWN_KEY,
  NUMERIC_CAST,
  DEFAULT_DATE_COLUMN,
  CUSTOM_DATE_COLUMN,
  JOIN_TABLE_NOTATION,
  ALPHA_TABLE_NAME,
  PARAMS_TABLE_NAME,
  DATE_TABLE_NAME,
  SUB_TABLE_NAME,
} from '../constants';

// ---------------------------------------------------------------------------
// Enums (ported from v3 core/enums/queryBuilder.enum.ts)
// ---------------------------------------------------------------------------

export enum TimeFilters {
  minute = 'minutes',
  hour = 'hourly',
  day = 'daily',
  week = 'weekly',
  month = 'monthly',
  year = 'yearly',
}

export enum TimeConvert {
  MinutesAndHours = 3600000,
  DayAndAbove = 86400000,
}

export enum QueryDateFormats {
  hour = '_hourly',
  day = '_daily',
  month = '_monthly',
  year = '_yearly',
}

export enum TimeIntervals {
  minute = 'minute',
  hour = 'hour',
  day = 'day',
  week = 'week',
  month = 'month',
  year = 'year',
}

export enum FieldTypes {
  alpha = 'alpha',
  number = 'number',
  encrypted = 'encrypted',
  datetime = 'datetime',
}

export enum MaxIntervals {
  maxHourInterval = 'MaxHourInterval',
  maxDailyInterval = 'MaxDailyInterval',
}

export enum FieldFunctions {
  round = 'round',
  truncate = 'trunc',
  sum = 'sum',
  count = 'count',
  avg = 'avg',
  min = 'min',
  max = 'max',
}

export enum CustomColumnType {
  CASE = 'caseColumn',
  OPERATION = 'customColumn',
  COMPARE = 'compareColumn',
  PRIORITY = 'priorityColumn',
  INCLUSION = 'inclusionColumn',
}

export enum NodeType {
  ALL = 'all',
  PRODUCTION = 'production',
  TEST = 'test',
}

// ---------------------------------------------------------------------------
// Date format constants (ported from v3 core/consts/dateConstants.ts)
// ---------------------------------------------------------------------------

export const DateFormats = {
  ReportFormatMinutes: 'yyyy-MM-dd HH:mm:00',
  ReportFormatMinutesEndOfDay: 'yyyy-MM-dd HH:mm:59',
  ReportFormatHourly: 'yyyy-MM-dd HH:00:00',
  ReportFormatDaily: 'yyyy-MM-dd 00:00:00',
  ReportFormatHoulyEndOfHour: 'yyyy-MM-dd HH:59:59',
  ReportFormatStartOfDate: 'yyyy-MM-dd 23:59:59',
  DateFullTime: DATE_FULL_TIME,
} as const;

// ---------------------------------------------------------------------------
// Internal interfaces for query builder arrays
// ---------------------------------------------------------------------------

/** System config keys used by v3 query builder */
const SK = {
  dateFormat1: 'dateFormat1',
  encryption: 'aesEncryptionKey',
  maxHoursCompare: 'maxHoursCompare',
  maxDaysCompare: 'maxDaysCompare',
  maxWeekCompare: 'maxWeekCompare',
  maxMonthCompare: 'maxMonthCompare',
  maxYearCompare: 'maxYearCompare',
} as const;

/** Internal field array entry for normal (non-custom) fields */
export interface IFieldsArrayEntry {
  tableId?: string;
  type: string;
  tableIndex?: number;
  draggedId: string;
  isCustomColumn: boolean;
  operation?: string;
  tableName?: string;
  tableNodeColumn?: string;
  columnName?: string;
  columnDisplayName: string;
  refNodeColumn?: string;
  [key: string]: unknown;
}

/** Internal field array entry for custom columns */
export interface ICustomColumnEntry extends IFieldsArrayEntry {
  customColumnType?: string;
  builtString?: string;
  savedTokens?: OperationColumnType[];
  index?: number;
}

/** Union type for entries in the fieldsArray */
export type FieldsArrayDto = IFieldsArrayEntry | ICustomColumnEntry;

/** Result of SpecialParameterProcessing query */
interface FieldsResultDto {
  paramTableName: string;
  paramTableField: string;
  paramSelectedField: string;
  tableName: string;
  tableField: string;
  displayName: string;
}

/** Result returned by generate() and generateQuery() */
export interface GenerateResultDto {
  header: ITabularHeader[];
  query: string;
  fieldsArray: FieldsArrayDto[];
}

/** Time model used in comparison date processing */
interface ITimeModel {
  fromDate: string;
  toDate: string;
}

// ---------------------------------------------------------------------------
// Utility helpers (ported from v3 core/utils/common.util.ts)
// ---------------------------------------------------------------------------

function isUndefinedOrNull(obj: unknown): boolean {
  return obj === undefined || obj === null;
}

function has(object: Record<string, unknown>, key: string | number): boolean {
  return object != null && Object.prototype.hasOwnProperty.call(object, key);
}

function isNumeric(str: unknown): boolean {
  if (typeof str === 'number') return true;
  if (typeof str !== 'string') return false;
  return !isNaN(Number(str)) && !isNaN(parseFloat(str));
}

function isTokenExistsInString(toSearchIn: string, toSearchFor: string): boolean {
  return toSearchIn.indexOf(toSearchFor) > -1;
}

function findInArray<T>(
  arr: T[],
  predictor: (value: T, index: number, obj: T[]) => unknown,
): { value: T; index: number } {
  for (let i = 0; i < arr.length; i++) {
    if (predictor(arr[i], i, arr)) {
      return { value: arr[i], index: i };
    }
  }
  return { value: undefined as unknown as T, index: -1 };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class QueryBuilderService {
  private readonly logger = new Logger(QueryBuilderService.name);

  /** Backtick-quoted database names from environment */
  private readonly dataDbName: string;
  private readonly coreDbName: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly systemConfig: SystemConfigService,
    private readonly dateHelper: DateHelperService,
    private readonly configService: ConfigService,
  ) {
    this.dataDbName = this.configService.get<string>('dataDbName', '`iMonitorData`');
    this.coreDbName = this.configService.get<string>('coreDbName', '`iMonitorV3_1`');
  }

  // =========================================================================
  // PUBLIC: generateQuery
  // =========================================================================

  /**
   * Parse the timeFilter from the DTO and dispatch to generate().
   * This is the main entry point for report SQL generation.
   */
  async generateQuery(tabularObject: GenerateReportDto): Promise<GenerateResultDto> {
    let maxInterval: string | null = null;
    let timeFilter: string | null = null;
    let dateFormat = '';
    let converter: number | null = null;

    switch (tabularObject.timeFilter) {
      case TimeFilters.minute:
        maxInterval = MaxIntervals.maxHourInterval;
        timeFilter = TimeIntervals.minute;
        converter = TimeConvert.MinutesAndHours;
        tabularObject.fromDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatMinutes,
          this.dateHelper.parseISO(tabularObject.fromDate),
        );
        tabularObject.toDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatMinutes,
          this.dateHelper.parseISO(tabularObject.toDate),
        );
        return this.generate(tabularObject, maxInterval, timeFilter, dateFormat, converter);

      case TimeFilters.hour:
        maxInterval = MaxIntervals.maxHourInterval;
        timeFilter = TimeIntervals.hour;
        dateFormat = QueryDateFormats.hour;
        converter = TimeConvert.MinutesAndHours;
        tabularObject.fromDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatHourly,
          this.dateHelper.parseISO(tabularObject.fromDate),
        );
        tabularObject.toDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatHoulyEndOfHour,
          this.dateHelper.parseISO(tabularObject.toDate),
        );
        return this.generate(tabularObject, maxInterval, timeFilter, dateFormat, converter);

      case TimeFilters.day:
        maxInterval = MaxIntervals.maxDailyInterval;
        timeFilter = TimeIntervals.day;
        dateFormat = QueryDateFormats.day;
        converter = TimeConvert.DayAndAbove;
        tabularObject.fromDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatDaily,
          this.dateHelper.parseISO(tabularObject.fromDate),
        );
        tabularObject.toDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatStartOfDate,
          this.dateHelper.parseISO(tabularObject.toDate),
        );
        return this.generate(tabularObject, maxInterval, timeFilter, dateFormat, converter);

      case TimeFilters.week:
        maxInterval = MaxIntervals.maxDailyInterval;
        timeFilter = TimeIntervals.week;
        dateFormat = QueryDateFormats.day;
        converter = TimeConvert.DayAndAbove;
        tabularObject.fromDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatDaily,
          this.dateHelper.parseISO(tabularObject.fromDate),
        );
        tabularObject.toDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatStartOfDate,
          this.dateHelper.parseISO(tabularObject.toDate),
        );
        return this.generate(tabularObject, maxInterval, timeFilter, dateFormat, converter);

      case TimeFilters.month:
        maxInterval = MaxIntervals.maxDailyInterval;
        timeFilter = TimeIntervals.month;
        dateFormat = QueryDateFormats.month;
        converter = TimeConvert.DayAndAbove;
        tabularObject.fromDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatDaily,
          this.dateHelper.parseISO(tabularObject.fromDate),
        );
        tabularObject.toDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatStartOfDate,
          this.dateHelper.parseISO(tabularObject.toDate),
        );
        return this.generate(tabularObject, maxInterval, timeFilter, dateFormat, converter);

      case TimeFilters.year:
        maxInterval = MaxIntervals.maxDailyInterval;
        timeFilter = TimeIntervals.year;
        dateFormat = QueryDateFormats.year;
        converter = TimeConvert.DayAndAbove;
        tabularObject.fromDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatDaily,
          this.dateHelper.parseISO(tabularObject.fromDate),
        );
        tabularObject.toDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatStartOfDate,
          this.dateHelper.parseISO(tabularObject.toDate),
        );
        return this.generate(tabularObject, maxInterval, timeFilter, dateFormat, converter);

      default:
        throw new BadRequestException('Invalid time filter');
    }
  }

  // =========================================================================
  // PUBLIC: generateQueryString (returns SQL only)
  // =========================================================================

  async generateQueryString(tabularObject: GenerateReportDto): Promise<string> {
    const result = await this.generateQuery(tabularObject);
    return result.query;
  }

  // =========================================================================
  // PUBLIC: TableUpdate
  // =========================================================================

  /**
   * Enrich minimal table objects with DB metadata (tableName, statInterval, etc.)
   * and resolve field columnName / type from core_tables_field.
   */
  async tableUpdate(tables: IMinimalTabularTable[]): Promise<ITabularTable[]> {
    const updatedTables: ITabularTable[] = [];

    for (const table of tables) {
      const tableMetaRows: Array<Record<string, unknown>> = await this.dataSource.query(
        `SELECT id, tableName, displayName, statInterval, startTime, tableHourName, tableDayName,
                paramsTable, paramsNodeName, nodeNameColumn, statDateNameColumn,
                gracePeriodMinutes AS gracePeriod
         FROM core_modules_tables WHERE id = ?`,
        [table.id],
      );

      if (tableMetaRows.length === 0) continue;
      const meta = tableMetaRows[0];

      const updatedTable: ITabularTable = {
        ...table,
        id: meta.id as string,
        tableName: meta.tableName as string,
        statInterval: meta.statInterval as number,
        tableHourName: meta.tableHourName as string,
        tableDayName: meta.tableDayName as string,
        paramsTable: meta.paramsTable as string,
        paramsNodeName: meta.paramsNodeName as string,
        nodeNameColumn: meta.nodeNameColumn as string,
        statDateNameColumn: (meta.statDateNameColumn as string) || DEFAULT_DATE_COLUMN,
        gracePeriod: meta.gracePeriod as number,
        startTime: meta.startTime as string,
      };

      // Resolve field columnName / type
      const fieldRows: Array<{
        id: string;
        columnName: string;
        columnDisplayName: string;
        type: string;
        isEncrypted: boolean;
      }> = await this.dataSource.query(
        `SELECT id, columnDisplayName, columnName, type, isEncrypted FROM core_tables_field WHERE tId = ?`,
        [meta.id],
      );

      for (const field of updatedTable.fields) {
        const dbField = fieldRows.find((r) => r.id === field.id);
        if (dbField) {
          field.columnName = dbField.columnName;
          field.type = dbField.isEncrypted ? FieldTypes.encrypted : dbField.type;
        }
      }

      updatedTables.push(updatedTable);
    }

    return updatedTables;
  }

  // =========================================================================
  // PUBLIC: generate (the main SQL builder)
  // =========================================================================

  async generate(
    tabularObject: GenerateReportDto,
    maxInterval: string,
    timefilter: string,
    dateFormat: string,
    converter: number,
  ): Promise<GenerateResultDto> {
    let reportFromDate = tabularObject.fromDate;
    const reportToDate = tabularObject.toDate;
    const role = (tabularObject.tables[0] as ITabularTable).role || 'N/A';
    const currentDate = this.dateHelper.formatDate(DateFormats.ReportFormatStartOfDate);

    // PERFORMANCE: pre-fetch config values
    const configKeys = [`${SK.dateFormat1}${dateFormat}`, `chartDateFormat${dateFormat}`, SK.encryption];
    const configValuesMap = await this.systemConfig.getConfigValues(configKeys);
    const dateFormat1Value = configValuesMap[`${SK.dateFormat1}${dateFormat}`] || '%Y-%m-%d %H:%i:%s';
    const chartDateFormatValue = configValuesMap[`chartDateFormat${dateFormat}`] || '%Y-%m-%d';
    const encryptionValue = configValuesMap[SK.encryption] || '';

    // Arrays
    const alphaFieldsResults: FieldsResultDto[] = [];
    const header: ITabularHeader[] = [];
    const tablesAdjustedNamesArray: string[] = [];
    const noneAlphafieldsObject: Record<number, IReportField[]> = {};
    const fieldsArray: FieldsArrayDto[] = [];

    // Fields
    let specialParamsSelected = false;
    let normalParamsSelected = false;
    let lastNormalTableIndex = 0;
    let alphaSelected = false;

    // Queries
    const compareColumns: Record<string, string> = {};
    let innerQueryDate = '';
    let intermediateTableQueryStatement = '';
    let intermediateTableJoinQuery = '';
    let outerLeftJoinQueryString = '';
    let compareLeftJoinQueryString = '';

    // Query Arrays
    const outerQueryStatements: string[] = [];
    const groupByValues: string[] = [];
    const paramsSelectionStatements: string[] = [];
    const paramsGroupStatements: string[] = [];
    const innerQueryMinutlyQueries: string[] = [];
    const innerGroupByValues: string[] = [];
    const innerQueryParamsUnionStatements: string[] = [];
    const intermediateNodeTableUnionQueries: string[] = [];
    const innerQueryAlphaUnionsTable: string[] = [];
    const outerLeftJoinQueryArray: string[] = [];
    let innerQueryStringsArray: string[] = [];
    const intervalTableArray: string[] = [];
    const innerQueryAlpha: string[] = [];
    let innerQueryStringsGroupByArray: string[] = [];

    // Enrich tables
    const tabularTables = await this.tableUpdate(tabularObject.tables as IMinimalTabularTable[]);

    if (tabularTables.length === 1 && tabularTables[tabularTables.length - 1].tableName === REF_TABLE_KEY) {
      throw new BadRequestException('Cannot select parameter view only');
    }

    let refTableIndex = -1;
    const tableNameArray: string[] = [];
    for (let tableIndex = 0; tableIndex < tabularTables.length; tableIndex++) {
      const table = tabularTables[tableIndex];
      if (table.tableName !== REF_TABLE_KEY) {
        tableNameArray.push(table.tableName);
        lastNormalTableIndex = tableIndex;
      } else {
        refTableIndex = tableIndex;
      }
    }

    // Interval check
    const allowedInterval = await this.systemConfig.getConfigValue(maxInterval);
    const dateDiff = (new Date(reportToDate).getTime() - new Date(reportFromDate).getTime()) / converter;
    if (allowedInterval && dateDiff > parseInt(allowedInterval, 10)) {
      throw new BadRequestException('Interval out of range');
    }

    if (role === 'user' && reportToDate === currentDate) {
      throw new BadRequestException('User cannot access live data');
    }

    // ------------------------------------------------------------------
    // RefTable processing
    // ------------------------------------------------------------------
    const refTableOuterQueryValues: string[] = [];
    const refHeader: ITabularHeader[] = [];
    const refNodeNameValue = REF_NODE_NAME;

    if (refTableIndex !== -1) {
      for (const field of tabularTables[refTableIndex].fields) {
        fieldsArray.push({
          tableId: tabularTables[refTableIndex].id,
          type: field.type,
          tableIndex: refTableIndex,
          draggedId: field.draggedId,
          isCustomColumn: false,
          operation: field.operation,
          tableName: tabularTables[refTableIndex].tableName,
          tableNodeColumn: tabularTables[refTableIndex].nodeNameColumn,
          columnName: field.columnName,
          columnDisplayName: field.columnDisplayName,
          refNodeColumn: refNodeNameValue,
        });

        // Check if field is a parameter
        const paramIdResult: Array<{ id: string }> = await this.dataSource.query(
          `SELECT id FROM core_tables_field WHERE id = ? AND isParam = 1`,
          [field.id],
        );

        if (paramIdResult.length > 0) {
          specialParamsSelected = true;
          await this.specialParameterProcessing(
            tableNameArray,
            field,
            paramIdResult[0],
            alphaFieldsResults,
            refTableOuterQueryValues,
            groupByValues,
            header,
          );
        } else {
          normalParamsSelected = true;
          const columnSelectName = `${REF_TABLE_KEY}.\`${field.columnDisplayName}\``;
          const ifNullString = dbIfNull(field.columnName!, `"${UNKNOWN_KEY}"`);
          paramsSelectionStatements.push(`${ifNullString} as '${field.columnDisplayName}'`);
          paramsGroupStatements.push(`'${field.columnDisplayName}'`);
          refTableOuterQueryValues.push(`${columnSelectName} as '${field.columnDisplayName}'`);
          groupByValues.push(columnSelectName);

          refHeader.push({
            text: field.columnDisplayName,
            datafield: field.columnDisplayName,
            aggregates: field.footerAggregation || [],
            draggedId: field.draggedId,
            pinned: field.pinned,
            hidden: field.hidden,
            headerColumnType: field.type,
            index: field.index,
          });
        }
      }
    }

    // Minute date check
    if (timefilter === TimeIntervals.minute) {
      reportFromDate = await this.dateChecker(
        reportFromDate,
        tabularTables[lastNormalTableIndex].startTime,
        tabularTables[lastNormalTableIndex].statInterval,
      );
    }

    // ------------------------------------------------------------------
    // Normal Tables processing
    // ------------------------------------------------------------------
    for (let tableIndex = 0; tableIndex < tabularTables.length; tableIndex++) {
      const table = tabularTables[tableIndex];
      const tableName = this.returnTableName(table, timefilter);
      tablesAdjustedNamesArray.push(tableName);
      let innerTableQueryArray: string[] = [];

      // Compatibility check for minute filter
      if (tabularTables.length > 1) {
        if (
          tableIndex < tabularTables.length - 1 &&
          table.tableName !== REF_TABLE_KEY &&
          tabularTables[tableIndex + 1].tableName !== REF_TABLE_KEY
        ) {
          if (
            tabularObject.timeFilter === TimeFilters.minute &&
            (table.statInterval !== tabularTables[tableIndex + 1].statInterval ||
              table.startTime !== tabularTables[tableIndex + 1].startTime)
          ) {
            throw new BadRequestException('Tables not compatible for minute selection');
          }
        }
      }

      if (tableName !== REF_TABLE_KEY) {
        const joinTableName = `${JOIN_TABLE_NOTATION}${tableIndex}`;
        outerLeftJoinQueryArray[tableIndex] =
          ` left join (select ${OUTER_QUERY_INNER_VALUE_KEY} ) as ${joinTableName} on `;

        innerQueryStringsArray.push(`${table.statDateNameColumn} `);
        intervalTableArray.push(tableName);
        lastNormalTableIndex = tableIndex;

        if (timefilter === TimeIntervals.minute) {
          innerQueryMinutlyQueries.push(` select ${table.statDateNameColumn} as '${DEFAULT_DATE_COLUMN}'
          from ${this.dataDbName}.${table.tableName} where ${table.statDateNameColumn} >= '${reportFromDate}'
          and ${table.statDateNameColumn} <= '${reportToDate}' group by ${table.statDateNameColumn} `);
        }

        if (normalParamsSelected) {
          if (refTableIndex !== -1 && table.nodeNameColumn == null) {
            throw new BadRequestException('Table not compatible with parameter');
          }

          innerQueryAlpha.push(` ${table.nodeNameColumn} as ${ALPHA_NODE_NAME} `);
          innerQueryStringsArray.push(table.nodeNameColumn);
          innerQueryStringsGroupByArray.push(table.nodeNameColumn);
          innerGroupByValues.push(table.nodeNameColumn, table.statDateNameColumn);

          let condition = '';
          if (tabularObject.nodeType === NodeType.ALL) {
            condition = '';
          } else if (tabularObject.nodeType === NodeType.TEST) {
            condition = 'where is_test_node = 1';
          } else if (tabularObject.nodeType === NodeType.PRODUCTION) {
            condition = 'where is_live = 1 and is_test_node = 0';
          }

          innerQueryParamsUnionStatements.push(` select ${table.paramsNodeName} as '${NODE_NAME}' , ${paramsSelectionStatements.join(' , ')}
          from ${this.dataDbName}.${table.paramsTable} ${condition} group By ${NODE_NAME},${paramsGroupStatements.toString()}`);
          outerLeftJoinQueryArray[tableIndex] +=
            ` ${joinTableName}.${table.nodeNameColumn} = ${REF_TABLE_KEY}.${ALPHA_NODE_NAME} and ${condition}`;
        }

        if (specialParamsSelected) {
          innerGroupByValues.push(table.statDateNameColumn);
        }

        // Process fields
        const numericAndEncryptedFields: IReportField[] = [];
        for (const field of table.fields) {
          fieldsArray.push({
            tableId: tabularTables[tableIndex].id,
            type: field.type,
            draggedId: field.draggedId,
            tableIndex,
            isCustomColumn: false,
            operation: field.operation,
            tableName: table.tableName,
            tableNodeColumn: table.nodeNameColumn,
            columnName: field.columnName,
            columnDisplayName: field.columnDisplayName,
            refNodeColumn: refNodeNameValue,
          });

          header.push({
            text: field.columnDisplayName,
            datafield: field.columnDisplayName,
            aggregates: field.footerAggregation || [],
            draggedId: field.draggedId,
            pinned: field.pinned,
            hidden: field.hidden,
            headerColumnType: field.type,
            index: field.index,
          });

          alphaSelected = this.processFieldByType(
            field,
            alphaSelected,
            innerQueryStringsArray,
            innerQueryStringsGroupByArray,
            table,
            tabularTables,
            outerLeftJoinQueryArray,
            outerQueryStatements,
            groupByValues,
            innerQueryAlpha,
            innerGroupByValues,
            intermediateNodeTableUnionQueries,
            tableName,
            normalParamsSelected,
            tableIndex,
            dateFormat,
            numericAndEncryptedFields,
            reportFromDate,
            reportToDate,
            innerTableQueryArray,
            refNodeNameValue,
            encryptionValue,
          );

          innerQueryAlpha.push(` ${table.statDateNameColumn} as 'statDate' `);
          if (normalParamsSelected) {
            innerQueryStringsArray.push(table.nodeNameColumn);
          }
        }
        noneAlphafieldsObject[tableIndex] = numericAndEncryptedFields;

        // Inner query construction
        innerTableQueryArray = [...new Set(innerTableQueryArray)];

        const innerQueryStatements: string[] = [];
        for (const alphaFieldResult of alphaFieldsResults) {
          if (alphaFieldResult.tableName === tabularTables[tableIndex].tableName) {
            const ifNullString = dbIfNull(
              `(select ${alphaFieldResult.paramSelectedField} from ${this.dataDbName}.${alphaFieldResult.paramTableName} where ${alphaFieldResult.paramTableField} = ${alphaFieldResult.tableField})`,
              `"${UNKNOWN_KEY}"`,
            );
            innerQueryStatements.push(`${ifNullString} as '${alphaFieldResult.paramSelectedField}'`);
            innerQueryStringsGroupByArray.push(alphaFieldResult.paramSelectedField);
          }
        }
        innerTableQueryArray = [...innerTableQueryArray, ...innerQueryStatements];

        let innerTableQuery = innerTableQueryArray.toString();
        innerTableQuery =
          innerTableQuery +
          ` ${INNER_QUERY_KEY} from
        ${this.dataDbName}.${tableName} where ${tabularTables[tableIndex].statDateNameColumn} >= '${reportFromDate}'
        and ${tabularTables[tableIndex].statDateNameColumn} <= '${reportToDate}' ${INNER_GROUP_BY_KEY}  `;
        outerLeftJoinQueryArray[tableIndex] = outerLeftJoinQueryArray[tableIndex].replace(
          OUTER_QUERY_INNER_VALUE_KEY,
          innerTableQuery,
        );
      } else {
        outerQueryStatements.push(...refTableOuterQueryValues);
        header.push(...refHeader);
      }
    }

    innerQueryStringsArray = [...new Set(innerQueryStringsArray)];
    innerQueryStringsGroupByArray = [...new Set(innerQueryStringsGroupByArray)];
    const innerQueryString = innerQueryStringsArray.toString();
    const innerTableGroupBy =
      innerQueryStringsGroupByArray.length > 0 ? `group by ${innerQueryStringsGroupByArray.toString()}` : '';

    // ------------------------------------------------------------------
    // Date table JOIN
    // ------------------------------------------------------------------
    if (timefilter === TimeIntervals.minute) {
      innerQueryDate = ` select * from (${innerQueryMinutlyQueries.join(SPACE_UNION_SPACE_KEY)}) as ${DATE_TABLE_NAME} `;
    } else {
      const addedDateString = dbDateAdd(`'${reportFromDate}'`, 'n.n', timefilter);
      innerQueryDate = ` select * from (select ${addedDateString} AS '${DEFAULT_DATE_COLUMN}'
      from ${this.coreDbName}.ref_numbers n where ${addedDateString} <= '${reportToDate}' ) as ${DATE_TABLE_NAME} `;
    }

    // ------------------------------------------------------------------
    // Fill custom fields in fieldsArray (MUST happen before filter clauses)
    // ------------------------------------------------------------------
    const priorityColumns = tabularObject.priority || [];
    const inclusionColumns = tabularObject.inclusion || [];
    this.fillCustomFieldInAllFieldsArray(
      tabularObject.compare,
      tabularObject.control,
      tabularObject.operation,
      priorityColumns,
      inclusionColumns,
      fieldsArray,
    );

    // ------------------------------------------------------------------
    // Global filter - build optimized WHERE and HAVING clauses
    // ------------------------------------------------------------------
    const filterClauses = this.buildGlobalFilterClauses(tabularObject.globalFilter, fieldsArray);

    // ------------------------------------------------------------------
    // Outer query (LEFT JOINs)
    // ------------------------------------------------------------------
    outerLeftJoinQueryString = this.outerJoinProcessing(
      outerLeftJoinQueryArray,
      tablesAdjustedNamesArray,
      innerQueryString,
      innerTableGroupBy,
      tabularTables,
      alphaFieldsResults,
      innerQueryAlpha,
      innerGroupByValues,
      innerQueryAlphaUnionsTable,
      reportFromDate,
      reportToDate,
      outerLeftJoinQueryString,
      fieldsArray,
    );

    // Inject WHERE into LEFT JOIN queries for performance
    if (filterClauses.where) {
      this.injectWhereIntoOuterJoinQueries(
        filterClauses.where,
        fieldsArray,
        tabularTables,
        outerLeftJoinQueryArray,
        reportFromDate,
        reportToDate,
      );

      outerLeftJoinQueryString = '';
      for (let outerLeftJoinIndex = 0; outerLeftJoinIndex < outerLeftJoinQueryArray.length; outerLeftJoinIndex++) {
        const tblName = tablesAdjustedNamesArray[outerLeftJoinIndex];
        if (tblName !== REF_TABLE_KEY && outerLeftJoinQueryArray[outerLeftJoinIndex]) {
          outerLeftJoinQueryString += ` ${outerLeftJoinQueryArray[outerLeftJoinIndex]} `;
        }
      }
    }

    // ------------------------------------------------------------------
    // Intermediate node table JOIN
    // ------------------------------------------------------------------
    if (intermediateNodeTableUnionQueries.length > 0) {
      const intermediateTableName = 'intermediateNodeTable';
      intermediateTableQueryStatement = `left join (${intermediateNodeTableUnionQueries.join(SPACE_UNION_SPACE_KEY)} ) as ${intermediateTableName} on 1 = 1`;
      intermediateTableJoinQuery = ` and ${SUB_TABLE_NAME}.${ALPHA_NODE_NAME}=${intermediateTableName}.${refNodeNameValue}`;
    }

    // ------------------------------------------------------------------
    // Inner query construction (ref_table Join)
    // ------------------------------------------------------------------
    let innerQueryParamsStatement = ` left join (${innerQueryParamsUnionStatements.join(SPACE_UNION_SPACE_KEY)}) as ${PARAMS_TABLE_NAME}
    on ${PARAMS_TABLE_NAME}.${NODE_NAME} = ${ALPHA_TABLE_NAME}.${ALPHA_NODE_NAME} `;
    const innerGroupByStatement = [...new Set(innerGroupByValues)].toString();
    const innerQueryAlphaTableString = ` ${innerQueryAlphaUnionsTable.join(SPACE_UNION_SPACE_KEY)} group by ${innerGroupByStatement}) as ${ALPHA_TABLE_NAME} `;
    if (!normalParamsSelected) {
      innerQueryParamsStatement = '';
    }

    let innerQuery = `( ${innerQueryDate} ${intermediateTableQueryStatement}
      left join (select * from (${innerQueryAlphaTableString} ${innerQueryParamsStatement}) as ${SUB_TABLE_NAME}
      on ${SUB_TABLE_NAME}.statDate=${DATE_TABLE_NAME}.${DEFAULT_DATE_COLUMN} ${intermediateTableJoinQuery}) as ${REF_TABLE_KEY}  `;

    if (!normalParamsSelected && !specialParamsSelected && !alphaSelected) {
      innerQuery = `( ${innerQueryDate} ) as ${REF_TABLE_KEY}  `;
    }

    // ------------------------------------------------------------------
    // Custom columns: Compare
    // ------------------------------------------------------------------
    const compareQueryStatements: string[] = [];
    try {
      compareLeftJoinQueryString = await this.compareColumnsProcessing(
        tabularObject,
        reportFromDate,
        reportToDate,
        tabularTables,
        outerLeftJoinQueryArray,
        compareLeftJoinQueryString,
        dateFormat,
        fieldsArray,
        compareQueryStatements,
        header,
        compareColumns,
        noneAlphafieldsObject,
        outerQueryStatements,
      );
    } catch (error) {
      throw new BadRequestException(`Error in compare columns: ${(error as Error).message}`);
    }

    // Custom columns: Control (CASE/WHEN)
    const switchQueryStatements: string[] = [];
    try {
      this.controlColumnsProcessing(tabularObject, fieldsArray, compareColumns, switchQueryStatements, header);
    } catch (error) {
      throw new BadRequestException(`Error in control columns: ${(error as Error).message}`);
    }

    // Custom columns: Operation
    const operationQueryStatements: string[] = [];
    try {
      this.operationColumnsProcessing(tabularObject, fieldsArray, compareColumns, operationQueryStatements, header);
    } catch (error) {
      throw new BadRequestException(`Error in operation columns: ${(error as Error).message}`);
    }

    // Custom columns: Priority
    const priorityQueryStatements: string[] = [];
    try {
      this.priorityColumnProcessing(tabularObject, fieldsArray, compareColumns, priorityQueryStatements, header);
    } catch (error) {
      throw new BadRequestException(`Error in priority columns: ${(error as Error).message}`);
    }

    // Custom columns: Inclusion
    const inclusionStatements: string[] = [];
    try {
      this.inclusionColumnProcessing(tabularObject, fieldsArray, compareColumns, inclusionStatements, header);
    } catch (error) {
      throw new BadRequestException(`Error in inclusion columns: ${(error as Error).message}`);
    }

    const customColumns = [
      ...compareQueryStatements,
      ...operationQueryStatements,
      ...switchQueryStatements,
      ...priorityQueryStatements,
      ...inclusionStatements,
    ];

    let customColumnsQuery = customColumns.length > 0 ? SPACE_COMMA_SPACE_KEY + customColumns.toString() : '';

    // Post-processing: replace ref table references for special params
    if (refTableIndex !== -1 && specialParamsSelected) {
      for (const field of tabularTables[refTableIndex].fields) {
        for (const alphaFieldResult of alphaFieldsResults) {
          if (alphaFieldResult.displayName === field.columnDisplayName) {
            const regex = new RegExp(`${REF_TABLE_KEY}.${field.columnName}`, 'g');
            customColumnsQuery = customColumnsQuery.replace(
              regex,
              `${REF_TABLE_KEY}.${alphaFieldResult.paramSelectedField}`,
            );
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // Final assembly
    // ------------------------------------------------------------------
    let orderBy = '';
    if (tabularObject.orderBy && tabularObject.orderBy.length > 0) {
      orderBy += ' order by ';
      for (const column of tabularObject.orderBy) {
        const orderField = fieldsArray.find((field) => field.draggedId === column.draggedId);
        if (!orderField) continue;
        orderBy += ` \`${orderField.columnDisplayName}\` ${column.orderBy}${SPACE_COMMA_SPACE_KEY}`;
      }
      orderBy = orderBy.substring(0, orderBy.length - SPACE_COMMA_SPACE_KEY.length);
    }

    const innerQueryWhereClause = filterClauses.where ? ` WHERE ${filterClauses.where}` : '';
    const havingClause = filterClauses.having ? ` HAVING ${filterClauses.having}` : '';

    const limit = tabularObject.limit && tabularObject.limit !== 0 ? ` limit ${tabularObject.limit} ` : '';
    const outerQuery = outerQueryStatements.join(SPACE_COMMA_SPACE_KEY);
    const groupByStatement = groupByValues.length > 0 ? ' group by ' + groupByValues.toString() : '';

    let finalQuery = ` select  ${outerQuery} ${customColumnsQuery} from (${innerQuery} ${outerLeftJoinQueryString}
      ${compareLeftJoinQueryString} ) ${innerQueryWhereClause} ${groupByStatement} ${havingClause} ${orderBy}  ${limit} `;

    // Replace config subqueries with cached values
    finalQuery = this.replaceConfigSubqueries(
      finalQuery,
      dateFormat,
      dateFormat1Value,
      chartDateFormatValue,
      encryptionValue,
    );

    // Sort header by frontend index
    const sortedHeader = header.sort((h1, h2) => (h1.index || 0) - (h2.index || 0));

    return {
      header: sortedHeader,
      query: finalQuery,
      fieldsArray,
    };
  }

  // =========================================================================
  // PRIVATE: Config subquery replacement
  // =========================================================================

  private replaceConfigSubqueries(
    sqlQuery: string,
    dateFormat: string,
    dateFormat1Value: string,
    chartDateFormatValue: string,
    encryptionValue: string,
  ): string {
    const dbName = this.coreDbName;
    const table = 'core_sys_config';

    const dateFormat1Subquery = `select confVal from ${dbName}.${table} where confKey = '${SK.dateFormat1}${dateFormat}'`;
    const chartDateFormatSubquery = `select confVal from ${dbName}.${table} where confKey = 'chartDateFormat${dateFormat}'`;
    const encryptionSubquery = `select confVal from ${dbName}.${table} where confKey = '${SK.encryption}'`;

    let optimizedQuery = sqlQuery;
    optimizedQuery = optimizedQuery.split(`(${dateFormat1Subquery})`).join(`'${dateFormat1Value}'`);
    optimizedQuery = optimizedQuery.split(`(${chartDateFormatSubquery})`).join(`'${chartDateFormatValue}'`);
    optimizedQuery = optimizedQuery.split(`(${encryptionSubquery})`).join(`'${encryptionValue}'`);

    return optimizedQuery;
  }

  // =========================================================================
  // PRIVATE: ReturnTableName
  // =========================================================================

  private returnTableName(table: ITabularTable, timeFilter: string): string {
    if (timeFilter === TimeIntervals.minute) return table.tableName;
    if (timeFilter === TimeIntervals.hour) return table.tableHourName;
    return table.tableDayName; // day, week, month, year
  }

  // =========================================================================
  // PRIVATE: DateChecker
  // =========================================================================

  private async dateChecker(fromDate: string, startTime: string, interval: number): Promise<string> {
    const from = this.dateHelper.parseISO(fromDate);
    let start = this.dateHelper.parseISO(startTime);
    let difference = this.dateHelper.differenceInMinutes(from, start);
    const maxIterations = 52596000; // 1 year in minutes

    if (difference > maxIterations) {
      throw new BadRequestException('Date checker: loop would exceed 1 year');
    }

    let loopIterator = 0;
    do {
      start = this.dateHelper.addDurationToDate({ minutes: interval }, start);
      difference = this.dateHelper.differenceInMinutes(from, start);
      loopIterator++;
    } while (difference > interval && loopIterator !== maxIterations);

    if (loopIterator === maxIterations) {
      throw new BadRequestException('Date checker: infinite loop detected');
    }

    return this.dateHelper.formatDate(
      DateFormats.DateFullTime,
      this.dateHelper.addDurationToDate({ minutes: interval }, start),
    );
  }

  // =========================================================================
  // PRIVATE: ProcessFieldByType
  // =========================================================================

  private processFieldByType(
    field: IReportField,
    alphaSelected: boolean,
    innerQueryStringsArray: string[],
    innerQueryStringsGroupByArray: string[],
    table: ITabularTable,
    tabularTables: ITabularTable[],
    outerLeftJoinQueryArray: string[],
    outerQueryStatements: string[],
    groupByValues: string[],
    innerQueryAlpha: string[],
    innerGroupByValues: string[],
    intermediateNodeTableUnionQueries: string[],
    tableName: string,
    normalParamsSelected: boolean,
    tableIndex: number,
    dateFormat: string,
    numericAndEncryptedFields: IReportField[],
    reportFromDate: string,
    reportToDate: string,
    innerTableQueryArray: string[],
    refNodeNameValue: string,
    encryptionValue: string,
  ): boolean {
    if (field.type === FieldTypes.alpha) {
      alphaSelected = true;
      const fieldColumn = (field.columnName || '').replace('\t', '');

      const isFieldNameAlreadyInUse =
        innerQueryStringsArray.findIndex(
          (el) => el.toLowerCase() === `${fieldColumn.toLowerCase()} as \`${fieldColumn.toLowerCase()}\``,
        ) > -1 || innerQueryStringsArray.includes(fieldColumn);

      if (fieldColumn.toLowerCase() !== field.columnDisplayName.toLowerCase() && !isFieldNameAlreadyInUse) {
        innerQueryStringsArray.push(fieldColumn);
      }

      const isFieldDisplayNameInUsed =
        innerQueryStringsArray.findIndex(
          (el) =>
            el.toLowerCase() === `${fieldColumn.toLowerCase()} as \`${field.columnDisplayName.toLocaleLowerCase()}\``,
        ) > -1;

      if (!isFieldDisplayNameInUsed) {
        innerQueryStringsArray.push(`${fieldColumn} as \`${field.columnDisplayName}\``);
      }
      innerQueryStringsGroupByArray.push(`\`${field.columnDisplayName}\``);

      if (field.columnName !== table.nodeNameColumn) {
        const tableColumnsName = `${REF_TABLE_KEY}.${field.columnName}`;
        for (let index = 0; index < tabularTables.length; index++) {
          outerLeftJoinQueryArray[index] +=
            ` ${JOIN_TABLE_NOTATION}${index}.${field.columnName}=${tableColumnsName} and `;
        }
        outerQueryStatements.push(`${tableColumnsName} as \`${field.columnDisplayName}\``);
        groupByValues.push(tableColumnsName);
        innerQueryAlpha.push(` ${field.columnName}`);
        innerGroupByValues.push(field.columnName!);
      } else {
        intermediateNodeTableUnionQueries.push(` select ${table.nodeNameColumn} as ${refNodeNameValue}
        from ${this.dataDbName}.${tableName} where ${table.statDateNameColumn} >= '${reportFromDate}'
        and ${table.statDateNameColumn} <= '${reportToDate}' group by ${refNodeNameValue}`);

        for (let index = 0; index < tabularTables.length; index++) {
          if (tabularTables[index].nodeNameColumn) {
            outerLeftJoinQueryArray[index] +=
              ` ${JOIN_TABLE_NOTATION}${index}.${tabularTables[index].nodeNameColumn}=${REF_TABLE_KEY}.${ALPHA_NODE_NAME} and `;
          }
        }

        const tableColumnName = `${REF_TABLE_KEY}.${refNodeNameValue}`;
        outerQueryStatements.push(`${tableColumnName} as '${field.columnDisplayName}'`);
        groupByValues.push(tableColumnName);

        if (!normalParamsSelected) {
          innerQueryAlpha.push(` ${field.columnName} as ${ALPHA_NODE_NAME} `);
        }
        innerGroupByValues.push(field.columnName!);
      }
      innerGroupByValues.push(table.statDateNameColumn);
    } else if (field.type === FieldTypes.datetime) {
      const dateFormatQuery = `'${this.getConfigValueLiteral(field.dateFormat, dateFormat)}'`;
      if (field.columnName !== table.statDateNameColumn) {
        const tableColumnName = `${JOIN_TABLE_NOTATION}${tableIndex}.${field.columnName}`;
        const formattedDateString = dbDateFormat(tableColumnName, dateFormatQuery);
        outerQueryStatements.push(`${formattedDateString} as '${field.columnDisplayName}'`);
        groupByValues.push(`${formattedDateString}`);
        innerQueryStringsArray.push(field.columnName!);
        innerQueryStringsGroupByArray.push(field.columnName!);
      }

      if (field.columnName === table.statDateNameColumn) {
        groupByValues.push(`${REF_TABLE_KEY}.${DEFAULT_DATE_COLUMN}`);
        const formattedOuterQueryGroupByString = dbDateFormat(
          `${REF_TABLE_KEY}.${DEFAULT_DATE_COLUMN}`,
          dateFormatQuery,
        );
        outerQueryStatements.push(`${formattedOuterQueryGroupByString} as '${field.columnDisplayName}'`);
        const formattedInnerQueryGroupByString = dbDateFormat(field.columnName!, dateFormatQuery);
        innerQueryStringsGroupByArray.push(formattedInnerQueryGroupByString);
      }
    } else {
      // number / encrypted
      numericAndEncryptedFields.push(field);
      const decryptionString = dbDecrypt(field.columnName!, `'${encryptionValue}'`);
      const trValue = field.trValue == null ? '0' : field.trValue.toString();
      let outerStatement = `${field.operation}(${JOIN_TABLE_NOTATION}${tableIndex}.\`${field.columnDisplayName}\`)`;

      if (field.round) {
        if (field.type === FieldTypes.number) {
          const roundedString = dbRound(`${field.operation}(${field.columnName})`, trValue);
          innerTableQueryArray.push(` ${roundedString} as '${field.columnDisplayName}' `);
        } else if (field.type === FieldTypes.encrypted) {
          const roundedString = dbRound(`${field.operation}(${decryptionString})`, trValue);
          innerTableQueryArray.push(` ${roundedString} as '${field.columnDisplayName}'`);
        }
        outerStatement = dbRound(outerStatement, trValue);
      } else if (field.trunc) {
        if (field.type === FieldTypes.number) {
          const truncatedString = dbTruncate(`${field.operation}(${field.columnName})`, trValue);
          innerTableQueryArray.push(` ${truncatedString} as '${field.columnDisplayName}' `);
        } else if (field.type === FieldTypes.encrypted) {
          const truncatedString = dbTruncate(`${field.operation}(${decryptionString})`, trValue);
          innerTableQueryArray.push(`${truncatedString} as '${field.columnDisplayName}'`);
        }
        outerStatement = dbTruncate(outerStatement, trValue);
      } else {
        if (field.type === FieldTypes.number) {
          innerTableQueryArray.push(` ${field.operation}(${field.columnName}) as '${field.columnDisplayName}' `);
        } else if (field.type === FieldTypes.encrypted) {
          innerTableQueryArray.push(` ${field.operation}(${decryptionString}) as '${field.columnDisplayName}'`);
        }
      }
      outerQueryStatements.push(` ${outerStatement} as '${field.columnDisplayName}'`);
    }
    return alphaSelected;
  }

  // =========================================================================
  // PRIVATE: buildOperationString
  // =========================================================================

  private buildOperationString(
    operation: ICustomOperationColumn,
    fieldsArray: FieldsArrayDto[],
    compareColumns: Record<string, string>,
    tabularObject: GenerateReportDto,
  ): { tableUsed: Set<string>; sql: string } {
    const tokensLength = operation.savedTokens?.length || 0;
    const tableUsed = new Set<string>();
    let str = '';

    for (let j = 0; j < tokensLength; j++) {
      const token = operation.savedTokens[j];
      if ((token as IOperationOperatorColumn).isOperation) {
        str += (token as IOperationOperatorColumn).operator;
      } else {
        const opColumn = token as IOperationColumn;
        const operationField = fieldsArray.find((f) => f.draggedId === opColumn.draggedId);
        if (!operationField) continue;

        if (!opColumn.isCustomColumn) {
          const fieldEntry = operationField as IFieldsArrayEntry;
          tableUsed.add(fieldEntry.tableId!);
          const fieldName = has(compareColumns as unknown as Record<string, unknown>, operationField.columnDisplayName)
            ? `(${compareColumns[operationField.columnDisplayName]})`
            : operationField.columnDisplayName;
          const tableColumnName = `${JOIN_TABLE_NOTATION}${fieldEntry.tableIndex}.\`${fieldName}\``;
          const wordsValue =
            fieldEntry.type !== FieldTypes.number
              ? tableColumnName
              : dbIfNull(`cast(${fieldEntry.operation}(${tableColumnName}) as ${NUMERIC_CAST})`, '0');
          str += `${wordsValue}`;
        } else {
          const customField = operationField as ICustomColumnEntry;
          const fieldType = customField.customColumnType;

          if (fieldType === CustomColumnType.OPERATION) {
            const customColumn = tabularObject.operation.find((f) => f.draggedId === operationField.draggedId);
            if (customColumn) {
              str += `(${this.buildOperationString(customColumn, fieldsArray, compareColumns, tabularObject).sql})`;
            }
          } else if (fieldType === CustomColumnType.COMPARE) {
            const compareColumn = tabularObject.compare.find((f) => f.draggedId === operationField.draggedId);
            if (compareColumn) {
              const fieldName = has(
                compareColumns as unknown as Record<string, unknown>,
                compareColumn.columnDisplayName,
              )
                ? dbIfNull(compareColumns[compareColumn.columnDisplayName], '0')
                : `\`${compareColumn.columnDisplayName}\``;
              str += ` ${fieldName} `;
            }
          } else if (fieldType === CustomColumnType.CASE) {
            const caseIndex = tabularObject.control.findIndex((f) => f.draggedId === operationField.draggedId);
            if (caseIndex >= 0) {
              str += this.buildControlString(
                tabularObject.control[caseIndex],
                fieldsArray,
                compareColumns,
                tabularObject,
              ).sql;
            }
          }
        }
      }
    }
    return { tableUsed, sql: str };
  }

  // =========================================================================
  // PRIVATE: buildControlString (CASE/WHEN/THEN/ELSE)
  // =========================================================================

  private buildControlString(
    control: ICustomControlColumn,
    fieldsArray: FieldsArrayDto[],
    compareColumns: Record<string, string>,
    tabularObject: GenerateReportDto,
  ): { tableUsed: Set<string>; sql: string } {
    const valueToSQL = (value: unknown, isCustom: boolean): string => {
      if (isCustom) {
        if (isNumeric(value)) return String(value);
        return `'${value}'`;
      }
      return String(value);
    };

    const convertInValue = (value: string, type: string): string => {
      if (type === FieldTypes.number) return `(${value})`;
      if (type === FieldTypes.alpha) {
        return `(${value
          .split(',')
          .map((el) => `'${el.trim()}'`)
          .join(',')})`;
      }
      return `(${value})`;
    };

    const caseElement = control.controlValue;
    const tableUsed = new Set<string>();
    let sql = '( CASE';

    for (const condition of caseElement.whenCondition) {
      sql += ' WHEN ';
      if (condition.isSubCondition) sql += '(';

      // WHEN statement
      sql += this.resolveFieldReference(
        condition.whenStatementId,
        fieldsArray,
        compareColumns,
        tabularObject,
        tableUsed,
        valueToSQL,
      );
      sql += ` ${condition.operator} `;

      // Field statement (the comparison value)
      if (condition.isCustomField) {
        if (condition.operator === 'in' || condition.operator === 'not in') {
          sql += ` ${convertInValue(condition.fieldStatement, condition.whenStatementType)} `;
        } else {
          sql += ` ${valueToSQL(condition.fieldStatement, condition.isCustomField)} `;
        }
      } else {
        sql += this.resolveFieldReference(
          condition.fieldStatementId,
          fieldsArray,
          compareColumns,
          tabularObject,
          tableUsed,
          valueToSQL,
        );
      }

      // Sub-condition
      if (condition.isSubCondition && condition.subCondition) {
        sql += ` ${condition.condition} `;
        sql += this.resolveFieldReference(
          condition.subCondition.whenStatementId,
          fieldsArray,
          compareColumns,
          tabularObject,
          tableUsed,
          valueToSQL,
        );
        sql += ` ${condition.subCondition.operator} `;

        if (condition.subCondition.isCustomField) {
          if (condition.subCondition.operator === 'in' || condition.subCondition.operator === 'not in') {
            sql += ` ${convertInValue(condition.subCondition.fieldStatement, condition.subCondition.whenStatementType)} `;
          } else {
            sql += ` ${valueToSQL(condition.subCondition.fieldStatement, condition.subCondition.isCustomField)}`;
          }
        } else {
          sql += this.resolveFieldReference(
            condition.subCondition.fieldStatementId,
            fieldsArray,
            compareColumns,
            tabularObject,
            tableUsed,
            valueToSQL,
          );
        }
        sql += ' )';
      }

      // THEN
      sql += ' THEN ';
      if (condition.isThenCustomField) {
        sql += ` ${valueToSQL(condition.thenStatement, condition.isThenCustomField)} `;
      } else {
        sql += this.resolveFieldReference(
          condition.thenStatementId,
          fieldsArray,
          compareColumns,
          tabularObject,
          tableUsed,
          valueToSQL,
        );
      }
    }

    // ELSE
    sql += ' ELSE ';
    if (caseElement.iselseCustomField) {
      sql += ` ${valueToSQL(caseElement.elseStatement, caseElement.iselseCustomField)}`;
    } else {
      sql += this.resolveFieldReference(
        caseElement.elseStatementId,
        fieldsArray,
        compareColumns,
        tabularObject,
        tableUsed,
        valueToSQL,
      );
    }
    sql += ' END )';

    return { tableUsed, sql };
  }

  /**
   * Resolve a field reference by draggedId. Handles normal fields and custom columns
   * (operation, compare, case, priority, inclusion).
   */
  private resolveFieldReference(
    draggedId: string,
    fieldsArray: FieldsArrayDto[],
    compareColumns: Record<string, string>,
    tabularObject: GenerateReportDto,
    tableUsed: Set<string>,
    valueToSQL: (value: unknown, isCustom: boolean) => string,
  ): string {
    const found = findInArray(fieldsArray, (f) => f.draggedId === draggedId);
    const fieldObj = found.value;
    if (!fieldObj) return "''";

    if (!fieldObj.isCustomColumn) {
      const entry = fieldObj as IFieldsArrayEntry;
      if (entry.tableId) tableUsed.add(entry.tableId);
      const wordsValue = this.buildWordValue(entry, compareColumns);
      return ` ${valueToSQL(wordsValue, false)} `;
    }

    const customEntry = fieldObj as ICustomColumnEntry;
    const fieldType = customEntry.customColumnType;

    if (fieldType === CustomColumnType.OPERATION) {
      const customColumn = tabularObject.operation.find((f) => f.draggedId === fieldObj.draggedId);
      if (customColumn) return this.buildOperationString(customColumn, fieldsArray, compareColumns, tabularObject).sql;
    } else if (fieldType === CustomColumnType.COMPARE) {
      const compareColumn = tabularObject.compare.find((f) => f.draggedId === fieldObj.draggedId);
      if (compareColumn) {
        const fieldName = has(compareColumns as unknown as Record<string, unknown>, compareColumn.columnDisplayName)
          ? `(${compareColumns[compareColumn.columnDisplayName]})`
          : `\`${compareColumn.columnDisplayName}\``;
        return ` ${fieldName} `;
      }
    } else if (fieldType === CustomColumnType.CASE) {
      const caseIdx = tabularObject.control.findIndex((f) => f.draggedId === fieldObj.draggedId);
      if (caseIdx >= 0)
        return this.buildControlString(tabularObject.control[caseIdx], fieldsArray, compareColumns, tabularObject).sql;
    } else if (fieldType === CustomColumnType.PRIORITY) {
      const priIdx = tabularObject.priority?.findIndex((f) => f.draggedId === fieldObj.draggedId) ?? -1;
      if (priIdx >= 0)
        return this.buildControlString(tabularObject.priority![priIdx], fieldsArray, compareColumns, tabularObject).sql;
    } else if (fieldType === CustomColumnType.INCLUSION) {
      const incIdx = tabularObject.inclusion?.findIndex((f) => f.draggedId === fieldObj.draggedId) ?? -1;
      if (incIdx >= 0)
        return this.buildControlString(tabularObject.inclusion![incIdx], fieldsArray, compareColumns, tabularObject)
          .sql;
    }

    return "''";
  }

  // =========================================================================
  // PRIVATE: buildWordValue
  // =========================================================================

  private buildWordValue(statmentObj: IFieldsArrayEntry, compareColumns: Record<string, string>): string {
    let fieldName = statmentObj.columnName || '';
    let selectionTable = `${JOIN_TABLE_NOTATION}${statmentObj.tableIndex}`;

    if (statmentObj.type === FieldTypes.number) {
      fieldName = has(compareColumns as unknown as Record<string, unknown>, statmentObj.columnDisplayName)
        ? `(${compareColumns[statmentObj.columnDisplayName]})`
        : statmentObj.columnDisplayName;
    }

    if (statmentObj.type === FieldTypes.alpha) {
      fieldName = statmentObj.columnDisplayName;
      if (statmentObj.columnName === statmentObj.tableNodeColumn) {
        selectionTable = REF_TABLE_KEY;
        fieldName = statmentObj.refNodeColumn || REF_NODE_NAME;
      }
    }

    if (statmentObj.tableName === REF_TABLE_KEY) {
      fieldName = statmentObj.columnDisplayName;
      selectionTable = REF_TABLE_KEY;
    }

    const tableColumnName = `${selectionTable}.\`${fieldName}\``;
    return statmentObj.type !== FieldTypes.number
      ? tableColumnName
      : dbIfNull(`cast(${statmentObj.operation}(${tableColumnName}) as ${NUMERIC_CAST})`, '0');
  }

  // =========================================================================
  // PRIVATE: Custom column processing methods
  // =========================================================================

  private operationColumnsProcessing(
    tabularObject: GenerateReportDto,
    fieldsArray: FieldsArrayDto[],
    compareColumns: Record<string, string>,
    operationQueryStatements: string[],
    header: ITabularHeader[],
  ): void {
    for (const operationColumn of tabularObject.operation) {
      const operationField = this.buildOperationString(operationColumn, fieldsArray, compareColumns, tabularObject);
      const fieldIdx = fieldsArray.findIndex((f) => f.draggedId === operationColumn.draggedId);
      if (fieldIdx >= 0) (fieldsArray[fieldIdx] as ICustomColumnEntry).builtString = operationField.sql;

      if (operationColumn.trunc) {
        operationQueryStatements.push(
          ` ${dbTruncate(operationField.sql, operationColumn.trValue.toString())} as \`${operationColumn.columnDisplayName}\``,
        );
      } else if (operationColumn.round) {
        operationQueryStatements.push(
          `${dbRound(operationField.sql, operationColumn.trValue.toString())}  as \`${operationColumn.columnDisplayName}\``,
        );
      } else {
        operationQueryStatements.push(` ${operationField.sql} as \`${operationColumn.columnDisplayName}\``);
      }

      header.push({
        text: operationColumn.columnDisplayName,
        datafield: operationColumn.columnDisplayName,
        draggedId: operationColumn.draggedId,
        aggregates: operationColumn.footerAggregation || [],
        pinned: operationColumn.pinned,
        hidden: operationColumn.hidden,
        headerColumnType: operationColumn.type,
        index: operationColumn.index,
      });
    }
  }

  private controlColumnsProcessing(
    tabularObject: GenerateReportDto,
    fieldsArray: FieldsArrayDto[],
    compareColumns: Record<string, string>,
    switchQueryStatements: string[],
    header: ITabularHeader[],
  ): void {
    for (const controlColumn of tabularObject.control) {
      const switchField = this.buildControlString(controlColumn, fieldsArray, compareColumns, tabularObject);
      const fieldIdx = fieldsArray.findIndex((f) => f.draggedId === controlColumn.draggedId);
      if (fieldIdx >= 0) (fieldsArray[fieldIdx] as ICustomColumnEntry).builtString = switchField.sql;

      if (controlColumn.type === FieldTypes.number) {
        if (controlColumn.trunc) {
          switchQueryStatements.push(
            ` ${dbTruncate(`cast(${switchField.sql} as ${NUMERIC_CAST})`, controlColumn.trValue.toString())} as  \`${controlColumn.columnDisplayName}\``,
          );
        } else if (controlColumn.round) {
          switchQueryStatements.push(
            ` ${dbRound(`cast(${switchField.sql} as ${NUMERIC_CAST})`, controlColumn.trValue.toString())}  as  \`${controlColumn.columnDisplayName}\``,
          );
        } else {
          switchQueryStatements.push(
            ` cast(${switchField.sql} as ${NUMERIC_CAST}) as  \`${controlColumn.columnDisplayName}\``,
          );
        }
      } else {
        switchQueryStatements.push(` ${switchField.sql} as  \`${controlColumn.columnDisplayName}\``);
      }

      header.push({
        text: controlColumn.columnDisplayName,
        datafield: controlColumn.columnDisplayName,
        draggedId: controlColumn.draggedId,
        aggregates: controlColumn.footerAggregation || [],
        pinned: controlColumn.pinned,
        hidden: controlColumn.hidden,
        headerColumnType: controlColumn.type,
        index: controlColumn.index,
      });
    }
  }

  private priorityColumnProcessing(
    tabularObject: GenerateReportDto,
    fieldsArray: FieldsArrayDto[],
    compareColumns: Record<string, string>,
    priorityQueryStatements: string[],
    header: ITabularHeader[],
  ): void {
    const priorities = tabularObject.priority || [];
    for (const priorityColumn of priorities) {
      const switchField = this.buildControlString(priorityColumn, fieldsArray, compareColumns, tabularObject);
      const fieldIdx = fieldsArray.findIndex((f) => f.draggedId === priorityColumn.draggedId);
      if (fieldIdx >= 0) (fieldsArray[fieldIdx] as ICustomColumnEntry).builtString = switchField.sql;

      if (priorityColumn.type === FieldTypes.number) {
        if (priorityColumn.trunc) {
          priorityQueryStatements.push(
            ` ${dbTruncate(`cast(${switchField.sql} as ${NUMERIC_CAST})`, priorityColumn.trValue.toString())} as  \`${priorityColumn.columnDisplayName}\``,
          );
        } else if (priorityColumn.round) {
          priorityQueryStatements.push(
            ` ${dbRound(`cast(${switchField.sql} as ${NUMERIC_CAST})`, priorityColumn.trValue.toString())}  as  \`${priorityColumn.columnDisplayName}\``,
          );
        } else {
          priorityQueryStatements.push(
            ` cast(${switchField.sql} as ${NUMERIC_CAST}) as  \`${priorityColumn.columnDisplayName}\``,
          );
        }
      } else {
        priorityQueryStatements.push(` ${switchField.sql} as  \`${priorityColumn.columnDisplayName}\``);
      }

      header.push({
        text: priorityColumn.columnDisplayName,
        datafield: priorityColumn.columnDisplayName,
        draggedId: priorityColumn.draggedId,
        aggregates: priorityColumn.footerAggregation || [],
        pinned: priorityColumn.pinned,
        hidden: priorityColumn.hidden,
        headerColumnType: priorityColumn.type,
        index: priorityColumn.index,
      });
    }
  }

  private inclusionColumnProcessing(
    tabularObject: GenerateReportDto,
    fieldsArray: FieldsArrayDto[],
    compareColumns: Record<string, string>,
    inclusionStatements: string[],
    header: ITabularHeader[],
  ): void {
    const inclusions = tabularObject.inclusion || [];
    for (const inclusionColumn of inclusions) {
      const switchField = this.buildControlString(inclusionColumn, fieldsArray, compareColumns, tabularObject);
      const fieldIdx = fieldsArray.findIndex((f) => f.draggedId === inclusionColumn.draggedId);
      if (fieldIdx >= 0) (fieldsArray[fieldIdx] as ICustomColumnEntry).builtString = switchField.sql;

      if (inclusionColumn.type === FieldTypes.number) {
        if (inclusionColumn.trunc) {
          inclusionStatements.push(
            ` ${dbTruncate(`cast(${switchField.sql} as ${NUMERIC_CAST})`, inclusionColumn.trValue.toString())} as  \`${inclusionColumn.columnDisplayName}\``,
          );
        } else if (inclusionColumn.round) {
          inclusionStatements.push(
            ` ${dbRound(`cast(${switchField.sql} as ${NUMERIC_CAST})`, inclusionColumn.trValue.toString())}  as  \`${inclusionColumn.columnDisplayName}\``,
          );
        } else {
          inclusionStatements.push(
            ` cast(${switchField.sql} as ${NUMERIC_CAST}) as  \`${inclusionColumn.columnDisplayName}\``,
          );
        }
      } else {
        inclusionStatements.push(` ${switchField.sql} as  \`${inclusionColumn.columnDisplayName}\``);
      }

      header.push({
        text: inclusionColumn.columnDisplayName,
        datafield: inclusionColumn.columnDisplayName,
        draggedId: inclusionColumn.draggedId,
        aggregates: inclusionColumn.footerAggregation || [],
        pinned: inclusionColumn.pinned,
        hidden: inclusionColumn.hidden,
        headerColumnType: inclusionColumn.type,
        index: inclusionColumn.index,
      });
    }
  }

  // =========================================================================
  // PRIVATE: Compare columns processing
  // =========================================================================

  private async compareColumnsProcessing(
    tabularObject: GenerateReportDto,
    reportFromDate: string,
    reportToDate: string,
    tabularTables: ITabularTable[],
    outerLeftJoinQueryArray: string[],
    compareLeftJoinQueryString: string,
    dateFormat: string,
    fieldsArray: FieldsArrayDto[],
    compareQueryStatements: string[],
    header: ITabularHeader[],
    compareColumns: Record<string, string>,
    noneAlphafieldsObject: Record<number, IReportField[]>,
    outerQueryStatements: string[],
  ): Promise<string> {
    let joinTableNumber = 0;

    const comparisonMaxDates = await this.systemConfig.getConfigValues([
      SK.maxHoursCompare,
      SK.maxDaysCompare,
      SK.maxWeekCompare,
      SK.maxMonthCompare,
      SK.maxYearCompare,
    ]);

    for (let comparisonIndex = 0; comparisonIndex < tabularObject.compare.length; comparisonIndex++) {
      const comparisonColumn = tabularObject.compare[comparisonIndex];
      const interval = comparisonColumn.timeFilter.toLowerCase();
      const comparisonTimeValue = comparisonColumn.backPeriod;

      const comparisonDates = this.processComparisonDates(
        comparisonColumn.timeFilter,
        tabularObject.timeFilter,
        reportFromDate,
        reportToDate,
        comparisonTimeValue,
      );

      // Validate comparison interval
      if (
        interval === TimeIntervals.hour &&
        comparisonTimeValue > Number(comparisonMaxDates[SK.maxHoursCompare] || 0)
      ) {
        throw new BadRequestException('Interval out of range');
      }
      if (interval === TimeIntervals.day && comparisonTimeValue > Number(comparisonMaxDates[SK.maxDaysCompare] || 0)) {
        throw new BadRequestException('Interval out of range');
      }
      if (interval === TimeIntervals.week && comparisonTimeValue > Number(comparisonMaxDates[SK.maxWeekCompare] || 0)) {
        throw new BadRequestException('Interval out of range');
      }
      if (
        interval === TimeIntervals.month &&
        comparisonTimeValue > Number(comparisonMaxDates[SK.maxMonthCompare] || 0)
      ) {
        throw new BadRequestException('Interval out of range');
      }
      if (interval === TimeIntervals.year && comparisonTimeValue > Number(comparisonMaxDates[SK.maxYearCompare] || 0)) {
        throw new BadRequestException('Interval out of range');
      }

      const compareFieldArrayIndex = fieldsArray.findIndex((f) => f.draggedId === comparisonColumn.draggedId);

      if (!comparisonColumn.isCustom) {
        joinTableNumber++;
        const compareField = fieldsArray.find(
          (f) => f.draggedId === comparisonColumn.usedColumnId,
        ) as IFieldsArrayEntry;
        if (!compareField) continue;

        const compareTableIndex = compareField.tableIndex!;
        const comparisonLeftJoin = outerLeftJoinQueryArray[compareTableIndex];
        const compareJoinTableName = `${JOIN_TABLE_NOTATION}${compareTableIndex}Compare${joinTableNumber}`;
        const nodeStatDateColumn = tabularTables[compareTableIndex].statDateNameColumn;

        compareLeftJoinQueryString += this.processComparisonLeftJoin(
          comparisonLeftJoin,
          nodeStatDateColumn,
          reportFromDate,
          comparisonDates,
          reportToDate,
          compareTableIndex,
          compareJoinTableName,
          comparisonTimeValue,
          interval,
          dateFormat,
        );

        const tableNameWithOperation = `${comparisonColumn.operation}(${compareJoinTableName}.\`${compareField.columnDisplayName}\`)`;
        this.addComparisonQueryStatement(comparisonColumn, compareQueryStatements, tableNameWithOperation);

        header.push({
          text: comparisonColumn.columnDisplayName,
          datafield: comparisonColumn.columnDisplayName,
          draggedId: comparisonColumn.draggedId,
          aggregates: comparisonColumn.footerAggregation || [],
          pinned: comparisonColumn.pinned,
          hidden: comparisonColumn.hidden,
          headerColumnType: comparisonColumn.type,
          index: comparisonColumn.index,
        });

        compareColumns[comparisonColumn.columnDisplayName] =
          ` ${comparisonColumn.operation}(\`${compareJoinTableName}\`.\`${compareField.columnDisplayName}\`) `;
        if (compareFieldArrayIndex >= 0) {
          (fieldsArray[compareFieldArrayIndex] as ICustomColumnEntry).builtString =
            compareColumns[comparisonColumn.columnDisplayName];
        }
      } else {
        // Custom compare column
        const comparedToField = fieldsArray.find(
          (f) => f.draggedId === comparisonColumn.usedColumnId,
        ) as ICustomColumnEntry;
        if (!comparedToField) continue;

        const builtCustomField =
          comparedToField.customColumnType === CustomColumnType.CASE
            ? this.buildControlString(
                tabularObject.control[comparedToField.index!],
                fieldsArray,
                compareColumns,
                tabularObject,
              )
            : this.buildOperationString(
                tabularObject.operation[comparedToField.index!],
                fieldsArray,
                compareColumns,
                tabularObject,
              );

        let compareQueryToAdd = builtCustomField.sql;
        const tablesUsed = [...builtCustomField.tableUsed];

        for (const compareTableId of tablesUsed) {
          if (compareTableId !== REF_TABLE_ID) {
            joinTableNumber++;
            const compareTableIdx = tabularTables.findIndex((t) => t.id === compareTableId);
            if (compareTableIdx < 0) continue;

            const comparisonLeftJoin = outerLeftJoinQueryArray[compareTableIdx];
            const compareJoinTableName = `${JOIN_TABLE_NOTATION}${compareTableIdx}Compare_${joinTableNumber}`;
            const nodeStatDateColumn = tabularTables[compareTableIdx].statDateNameColumn;
            const joinTablesNamesRegex = new RegExp(`${JOIN_TABLE_NOTATION}${compareTableIdx}\\.`, 'g');

            compareLeftJoinQueryString += this.processComparisonLeftJoin(
              comparisonLeftJoin,
              nodeStatDateColumn,
              reportFromDate,
              comparisonDates,
              reportToDate,
              compareTableIdx,
              compareJoinTableName,
              comparisonTimeValue,
              interval,
              dateFormat,
            );

            compareQueryToAdd = compareQueryToAdd.replace(joinTablesNamesRegex, compareJoinTableName + '.');
            if (noneAlphafieldsObject[compareTableIdx]) {
              for (const field of noneAlphafieldsObject[compareTableIdx]) {
                outerQueryStatements.push(
                  ` ${field.operation}(${compareJoinTableName}.\`${field.columnDisplayName}\`) as \`${field.columnDisplayName}_Compare_${comparisonIndex}\``,
                );
              }
            }
          }
        }

        this.addComparisonQueryStatement(comparisonColumn, compareQueryStatements, compareQueryToAdd);

        header.push({
          text: comparisonColumn.columnDisplayName,
          datafield: comparisonColumn.columnDisplayName,
          draggedId: comparisonColumn.draggedId,
          aggregates: comparisonColumn.footerAggregation || [],
          pinned: comparisonColumn.pinned,
          hidden: comparisonColumn.hidden,
          headerColumnType: comparisonColumn.type,
          index: comparisonColumn.index,
        });

        compareColumns[comparisonColumn.columnDisplayName] = compareQueryToAdd;
        if (compareFieldArrayIndex >= 0) {
          (fieldsArray[compareFieldArrayIndex] as ICustomColumnEntry).builtString =
            compareColumns[comparisonColumn.columnDisplayName];
        }
      }

      // Compare date column
      if (comparisonColumn.withStatDate) {
        const dateFormatValue =
          (await this.systemConfig.getConfigValue(`${comparisonColumn.dateFormat}${dateFormat}`)) ||
          '%Y-%m-%d %H:%i:%s';
        const addedDateString = dbDateAdd(
          `${REF_TABLE_KEY}.${DEFAULT_DATE_COLUMN}`,
          `-${comparisonTimeValue}`,
          interval,
        );
        const dateFormatString = dbDateFormat(addedDateString, `'${dateFormatValue}'`);
        compareQueryStatements.push(
          `${dateFormatString} as '${comparisonColumn.columnDisplayName}${CUSTOM_DATE_COLUMN}'`,
        );

        header.push({
          text: comparisonColumn.columnDisplayName + CUSTOM_DATE_COLUMN,
          datafield: comparisonColumn.columnDisplayName + CUSTOM_DATE_COLUMN,
          aggregates: ['count'],
          draggedId: comparisonColumn.draggedId + CUSTOM_DATE_COLUMN,
          pinned: comparisonColumn.pinned,
          hidden: comparisonColumn.hidden,
          headerColumnType: FieldTypes.datetime,
          index: comparisonColumn.index,
        });
      }
    }
    return compareLeftJoinQueryString;
  }

  private addComparisonQueryStatement(
    comparisonColumn: ICustomCompareColumn,
    compareQueryStatements: string[],
    compareQueryToAdd: string,
  ): void {
    if (comparisonColumn.trunc) {
      compareQueryStatements.push(
        ` ${dbTruncate(compareQueryToAdd, comparisonColumn.trValue.toString())} as \`${comparisonColumn.columnDisplayName}\``,
      );
    } else if (comparisonColumn.round) {
      compareQueryStatements.push(
        ` ${dbRound(compareQueryToAdd, comparisonColumn.trValue.toString())} as \`${comparisonColumn.columnDisplayName}\``,
      );
    } else {
      compareQueryStatements.push(` ${compareQueryToAdd} as \`${comparisonColumn.columnDisplayName}\``);
    }
  }

  private processComparisonLeftJoin(
    comparisonLeftJoin: string,
    nodeStatDateColumn: string,
    reportFromDate: string,
    comparisonDates: ITimeModel,
    reportToDate: string,
    compareTableIndex: number,
    compareJoinTableName: string,
    comparisonTimeValue: number,
    interval: string,
    dateFormat: string,
  ): string {
    let joinStr = comparisonLeftJoin;
    joinStr = joinStr.replace(`'${reportFromDate}'`, `'${comparisonDates.fromDate}'`);
    joinStr = joinStr.replace(`'${reportToDate}'`, `'${comparisonDates.toDate}'`);

    // Use cached config value instead of subquery
    const dateFormatValue = '%Y-%m-%d %H:%i:%s'; // Will be replaced by replaceConfigSubqueries

    const joinTablesNamesRegex = new RegExp(`${JOIN_TABLE_NOTATION}${compareTableIndex}\\b`, 'g');
    joinStr = joinStr.replace(joinTablesNamesRegex, compareJoinTableName);

    const compareDateRegex = new RegExp(`${compareJoinTableName}.${nodeStatDateColumn}`, 'g');
    const compareDateFormatString = dbDateFormat(
      `${compareJoinTableName}.${nodeStatDateColumn}`,
      `'${dateFormatValue}'`,
    );
    joinStr = joinStr.replace(compareDateRegex, compareDateFormatString);

    const statDateRegex = new RegExp(`${REF_TABLE_KEY}.${DEFAULT_DATE_COLUMN}`, 'g');
    const addedDateString = dbDateAdd(`${REF_TABLE_KEY}.${DEFAULT_DATE_COLUMN}`, `-${comparisonTimeValue}`, interval);
    const dateFormatString = dbDateFormat(addedDateString, `'${dateFormatValue}'`);
    joinStr = joinStr.replace(statDateRegex, dateFormatString);

    return joinStr;
  }

  // =========================================================================
  // PRIVATE: processComparisonDates
  // =========================================================================

  private processComparisonDates(
    compareTimeFilter: string,
    tableTimeFilter: string,
    fromDate: string,
    toDate: string,
    value: number,
  ): ITimeModel {
    let comparisonFromDateStr = fromDate;
    let comparisonToDateStr = toDate;

    let fromDateFormat: string = DateFormats.ReportFormatDaily;
    let toDateFormat: string = DateFormats.ReportFormatStartOfDate;

    if (tableTimeFilter === TimeFilters.minute) {
      fromDateFormat = DateFormats.ReportFormatMinutes;
      toDateFormat = DateFormats.ReportFormatMinutes;
    } else if (tableTimeFilter === TimeFilters.hour) {
      fromDateFormat = DateFormats.ReportFormatHourly;
      toDateFormat = DateFormats.ReportFormatMinutesEndOfDay;
    }

    const durationKey = this.getComparisonDurationKey(compareTimeFilter);
    comparisonFromDateStr = this.dateHelper.formatDate(
      fromDateFormat,
      this.dateHelper.subtractDurationFromDate(
        { [durationKey]: value },
        this.dateHelper.parseISO(comparisonFromDateStr),
      ),
    );
    comparisonToDateStr = this.dateHelper.formatDate(
      toDateFormat,
      this.dateHelper.subtractDurationFromDate({ [durationKey]: value }, this.dateHelper.parseISO(comparisonToDateStr)),
    );

    return { fromDate: comparisonFromDateStr, toDate: comparisonToDateStr };
  }

  private getComparisonDurationKey(compareTimeFilter: string): string {
    switch (compareTimeFilter) {
      case TimeIntervals.minute:
        return 'minutes';
      case TimeIntervals.hour:
        return 'hours';
      case TimeIntervals.day:
        return 'days';
      case TimeIntervals.week:
        return 'weeks';
      case TimeIntervals.month:
        return 'months';
      case TimeIntervals.year:
        return 'years';
      default:
        return 'days';
    }
  }

  // =========================================================================
  // PRIVATE: fillCustomFieldInAllFieldsArray
  // =========================================================================

  private fillCustomFieldInAllFieldsArray(
    compare: ICustomCompareColumn[],
    control: ICustomControlColumn[],
    operation: ICustomOperationColumn[],
    priority: ICustomControlColumn[],
    inclusion: ICustomControlColumn[],
    fieldsArray: FieldsArrayDto[],
  ): void {
    for (let i = 0; i < compare.length; i++) {
      const c = compare[i];
      fieldsArray.push({
        index: i,
        isCustomColumn: true,
        draggedId: c.draggedId,
        columnDisplayName: c.columnDisplayName,
        type: c.type,
        operation: c.operation,
        customColumnType: CustomColumnType.COMPARE,
        builtString: '',
      });
      if (c.withStatDate) {
        fieldsArray.push({
          index: i,
          isCustomColumn: true,
          draggedId: c.draggedId + CUSTOM_DATE_COLUMN,
          columnDisplayName: c.columnDisplayName + CUSTOM_DATE_COLUMN,
          type: FieldTypes.datetime,
          operation: '',
          customColumnType: CustomColumnType.COMPARE,
          builtString: '',
        });
      }
    }

    for (let i = 0; i < control.length; i++) {
      fieldsArray.push({
        index: i,
        isCustomColumn: true,
        draggedId: control[i].draggedId,
        columnDisplayName: control[i].columnDisplayName,
        type: control[i].type,
        customColumnType: CustomColumnType.CASE,
        operation: control[i].operation,
        builtString: '',
      });
    }

    for (let i = 0; i < operation.length; i++) {
      fieldsArray.push({
        index: i,
        isCustomColumn: true,
        draggedId: operation[i].draggedId,
        columnDisplayName: operation[i].columnDisplayName,
        type: operation[i].type,
        customColumnType: CustomColumnType.OPERATION,
        savedTokens: operation[i].savedTokens,
        operation: operation[i].operation,
        builtString: '',
      });
    }

    if (priority) {
      for (let i = 0; i < priority.length; i++) {
        fieldsArray.push({
          index: i,
          isCustomColumn: true,
          draggedId: priority[i].draggedId,
          columnDisplayName: priority[i].columnDisplayName,
          type: priority[i].type,
          customColumnType: CustomColumnType.PRIORITY,
          operation: priority[i].operation,
          builtString: '',
        });
      }
    }

    if (inclusion) {
      for (let i = 0; i < inclusion.length; i++) {
        fieldsArray.push({
          index: i,
          isCustomColumn: true,
          draggedId: inclusion[i].draggedId,
          columnDisplayName: inclusion[i].columnDisplayName,
          type: inclusion[i].type,
          customColumnType: CustomColumnType.INCLUSION,
          operation: inclusion[i].operation,
          builtString: '',
        });
      }
    }
  }

  // =========================================================================
  // PRIVATE: outerJoinProcessing
  // =========================================================================

  private outerJoinProcessing(
    outerLeftJoinQueryArray: string[],
    tablesAdjustedNamesArray: string[],
    innerQueryString: string,
    innerTableGroupBy: string,
    tabularTables: ITabularTable[],
    alphaFieldsResults: FieldsResultDto[],
    innerQueryAlpha: string[],
    innerGroupByValues: string[],
    innerQueryAlphaUnionsTable: string[],
    reportFromDate: string,
    reportToDate: string,
    outerLeftJoinQueryString: string,
    fieldsArray: FieldsArrayDto[],
  ): string {
    for (let outerLeftJoinIndex = 0; outerLeftJoinIndex < outerLeftJoinQueryArray.length; outerLeftJoinIndex++) {
      const outerJoinString = outerLeftJoinQueryArray[outerLeftJoinIndex];
      const tableName = tablesAdjustedNamesArray[outerLeftJoinIndex];

      if (tableName !== REF_TABLE_KEY) {
        if (isTokenExistsInString(outerJoinString, `select  ${INNER_QUERY_KEY}`)) {
          outerLeftJoinQueryArray[outerLeftJoinIndex] = outerJoinString.replace(INNER_QUERY_KEY, innerQueryString);
        } else {
          outerLeftJoinQueryArray[outerLeftJoinIndex] = outerJoinString.replace(
            INNER_QUERY_KEY,
            ',' + innerQueryString,
          );
        }

        outerLeftJoinQueryArray[outerLeftJoinIndex] = outerLeftJoinQueryArray[outerLeftJoinIndex].replace(
          INNER_GROUP_BY_KEY,
          innerTableGroupBy,
        );

        const isNodeSelected = tabularTables[outerLeftJoinIndex].fields.some(
          (f) => f.columnName === tabularTables[outerLeftJoinIndex].nodeNameColumn,
        );
        const isNodeInUse = fieldsArray.some(
          (f) => (f as IFieldsArrayEntry).columnName === tabularTables[outerLeftJoinIndex].nodeNameColumn,
        );
        if (!isNodeSelected && isNodeInUse) {
          outerLeftJoinQueryArray[outerLeftJoinIndex] +=
            ` ${JOIN_TABLE_NOTATION}${outerLeftJoinIndex}.${tabularTables[outerLeftJoinIndex].nodeNameColumn}=${REF_TABLE_KEY}.${ALPHA_NODE_NAME} and `;
        }
        outerLeftJoinQueryArray[outerLeftJoinIndex] +=
          ` ${JOIN_TABLE_NOTATION}${outerLeftJoinIndex}.${tabularTables[outerLeftJoinIndex].statDateNameColumn}=${REF_TABLE_KEY}.${DEFAULT_DATE_COLUMN} ${SPACE_AND_SPACE_KEY}`;

        for (const alphaFieldResult of alphaFieldsResults) {
          if (alphaFieldResult.tableName === tabularTables[outerLeftJoinIndex].tableName) {
            outerLeftJoinQueryArray[outerLeftJoinIndex] +=
              ` ${JOIN_TABLE_NOTATION}${outerLeftJoinIndex}.${alphaFieldResult.paramSelectedField}=${REF_TABLE_KEY}.\`${alphaFieldResult.displayName}\` ${SPACE_AND_SPACE_KEY}`;
            const ifNullString = dbIfNull(
              `(select ${alphaFieldResult.paramSelectedField} from ${this.dataDbName}.${alphaFieldResult.paramTableName}
              where ${alphaFieldResult.paramTableField} = ${alphaFieldResult.tableField})`,
              `"${UNKNOWN_KEY}"`,
            );
            innerQueryAlpha.push(`${ifNullString} as '${alphaFieldResult.displayName}' `);
            innerGroupByValues.push(`'${alphaFieldResult.displayName}'`);
          }
        }
        const uniqueInnerQueryAlpha = [...new Set(innerQueryAlpha)];
        const innerQueryAlphaString = uniqueInnerQueryAlpha.toString();
        innerQueryAlphaUnionsTable.push(`select ${innerQueryAlphaString} from ${this.dataDbName}.${tableName}
         where ${tabularTables[outerLeftJoinIndex].statDateNameColumn}>= '${reportFromDate}' and ${tabularTables[outerLeftJoinIndex].statDateNameColumn}<= '${reportToDate}' `);
        outerLeftJoinQueryArray[outerLeftJoinIndex] = outerLeftJoinQueryArray[outerLeftJoinIndex].substring(
          0,
          outerLeftJoinQueryArray[outerLeftJoinIndex].length - SPACE_AND_SPACE_KEY.length,
        );

        outerLeftJoinQueryString += ` ${outerLeftJoinQueryArray[outerLeftJoinIndex]} `;
      }
    }
    return outerLeftJoinQueryString;
  }

  // =========================================================================
  // PRIVATE: Global filter helpers
  // =========================================================================

  private buildGlobalFilterClauses(
    filterObject: IReportGlobalFilter,
    fieldsArray: FieldsArrayDto[],
  ): { where: string; having: string } {
    if (!filterObject || !filterObject.rules || filterObject.rules.length === 0) {
      return { where: '', having: '' };
    }

    const fieldMap = new Map(fieldsArray.map((f) => [f.draggedId, f]));

    const categorizeRules = (
      rules: Array<IGlobalFilterRule | IReportGlobalFilter>,
      condition: string,
    ): { where: string; having: string } => {
      const whereConditions: string[] = [];
      const havingConditions: string[] = [];

      for (const ruleOrGroup of rules) {
        if ((ruleOrGroup as IReportGlobalFilter).rules) {
          const nestedGroup = ruleOrGroup as IReportGlobalFilter;
          const nested = categorizeRules(nestedGroup.rules!, nestedGroup.condition || 'AND');
          if (nested.where) whereConditions.push(`(${nested.where})`);
          if (nested.having) havingConditions.push(`(${nested.having})`);
        } else {
          const rule = ruleOrGroup as IGlobalFilterRule;
          const field = fieldMap.get(rule.field);
          if (!field) {
            throw new BadRequestException(`Invalid filter field with draggedId: ${rule.field}`);
          }

          const sqlCondition = this.buildSQLCondition(rule, field, fieldMap);

          if (this.isAggregatedField(field)) {
            havingConditions.push(sqlCondition);
          } else {
            whereConditions.push(sqlCondition);
          }
        }
      }

      return {
        where: whereConditions.length ? whereConditions.join(` ${condition} `) : '',
        having: havingConditions.length ? havingConditions.join(` ${condition} `) : '',
      };
    };

    try {
      return categorizeRules(
        filterObject.rules as Array<IGlobalFilterRule | IReportGlobalFilter>,
        filterObject.condition || 'AND',
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Error building filter clauses: ${(error as Error).message}`);
    }
  }

  private isAggregatedField(field: FieldsArrayDto): boolean {
    if (field.type === FieldTypes.alpha || field.type === FieldTypes.datetime) return false;
    if (field.isCustomColumn) return true;
    const operation = (field as IFieldsArrayEntry).operation;
    const aggregationOps = ['sum', 'avg', 'max', 'min', 'count'];
    return !!(operation && aggregationOps.includes(operation.toLowerCase()));
  }

  private buildSQLCondition(
    rule: IGlobalFilterRule,
    field: FieldsArrayDto,
    fieldMap: Map<string, FieldsArrayDto>,
  ): string {
    let column: string;

    if (this.isAggregatedField(field)) {
      column = `\`${field.columnDisplayName}\``;
    } else {
      const customField = field as IFieldsArrayEntry;
      let rawColumnName: string;

      if (field.type === FieldTypes.alpha && customField.columnName === customField.tableNodeColumn) {
        rawColumnName = customField.refNodeColumn || REF_NODE_NAME;
      } else if (customField.tableId === REF_TABLE_ID || customField.tableName === REF_TABLE_KEY) {
        rawColumnName = field.columnDisplayName;
      } else {
        rawColumnName = customField.columnName || field.columnDisplayName;
      }

      column = `refTable.\`${rawColumnName.replace('\t', '')}\``;
    }

    switch (rule.operator) {
      case 'is null':
      case 'is not null':
        return `${column} ${rule.operator}`;
      case 'in':
      case 'not in':
        return `${column} ${rule.operator} ${this.buildInClauseValue(rule)}`;
      default: {
        const value = this.escapeSQLValue(rule.value, rule.isCustom, fieldMap);
        return `${column} ${rule.operator} ${value}`;
      }
    }
  }

  private buildInClauseValue(rule: IGlobalFilterRule): string {
    if (rule.type === FieldTypes.alpha) {
      const values = rule.value
        .split(',')
        .map((el) => el.trim())
        .filter(Boolean)
        .map((el) => this.escapeSQLLiteral(el));
      if (values.length === 0) throw new BadRequestException('IN clause cannot be empty');
      return `(${values.join(',')})`;
    } else {
      const values = rule.value
        .split(',')
        .map((el) => el.trim())
        .filter(Boolean)
        .map((el) => {
          const num = parseFloat(el);
          if (!isFinite(num)) throw new BadRequestException(`Invalid numeric value in IN clause: ${el}`);
          return num;
        });
      if (values.length === 0) throw new BadRequestException('IN clause cannot be empty');
      return `(${values.join(',')})`;
    }
  }

  private escapeSQLValue(value: string, isCustom: boolean, fieldMap: Map<string, FieldsArrayDto>): string {
    if (isCustom) {
      // v3 accepts any type at runtime; we guard all paths for safety
      const raw = value as unknown;
      if (typeof raw === 'boolean') return raw ? '1' : '0';
      if (typeof raw === 'number' && isFinite(raw)) return raw.toString();
      if (typeof raw === 'string') {
        if (isNumeric(raw)) return raw;
        return this.escapeSQLLiteral(raw);
      }
      return '0';
    } else {
      const columnField = fieldMap.get(String(value));
      if (columnField) return `\`${columnField.columnDisplayName}\``;
      return this.escapeSQLLiteral(String(value));
    }
  }

  private escapeSQLLiteral(value: string): string {
    const escaped = value.replace(/'/g, "''");
    return `'${escaped}'`;
  }

  // =========================================================================
  // PRIVATE: injectWhereIntoOuterJoinQueries
  // =========================================================================

  private injectWhereIntoOuterJoinQueries(
    whereClause: string,
    fieldsArray: FieldsArrayDto[],
    tabularTables: ITabularTable[],
    outerLeftJoinQueryArray: string[],
    fromDate: string,
    toDate: string,
  ): void {
    const tableFieldsMap = new Map<number, Set<string>>();

    for (const field of fieldsArray) {
      const entry = field as IFieldsArrayEntry;
      if (entry.tableIndex !== undefined && !field.isCustomColumn && entry.columnName) {
        if (!tableFieldsMap.has(entry.tableIndex)) {
          tableFieldsMap.set(entry.tableIndex, new Set());
        }
        tableFieldsMap.get(entry.tableIndex)!.add(entry.columnName);
      }
    }

    for (let tableIndex = 0; tableIndex < tabularTables.length; tableIndex++) {
      const table = tabularTables[tableIndex];
      if (table.tableName === REF_TABLE_KEY || !outerLeftJoinQueryArray[tableIndex]) continue;

      const tableFields = tableFieldsMap.get(tableIndex);
      if (!tableFields || tableFields.size === 0) continue;

      const tableSpecificConditions = this.extractTableConditions(whereClause, tableFields);
      if (tableSpecificConditions.length === 0) continue;

      const additionalWhere = tableSpecificConditions.join(' AND ');
      const currentQuery = outerLeftJoinQueryArray[tableIndex];

      const escapedFrom = fromDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedTo = toDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dateFilterPattern = `where\\s+${table.statDateNameColumn}\\s*>=\\s*'${escapedFrom}'\\s*\\n?\\s*and\\s+${table.statDateNameColumn}\\s*<=\\s*'${escapedTo}'`;
      const regex = new RegExp(dateFilterPattern, 'i');

      if (regex.test(currentQuery)) {
        const newWhere = `where ${table.statDateNameColumn} >= '${fromDate}' and ${table.statDateNameColumn} <= '${toDate}' AND (${additionalWhere})`;
        outerLeftJoinQueryArray[tableIndex] = currentQuery.replace(regex, newWhere);
      }
    }
  }

  private extractTableConditions(whereClause: string, tableFields: Set<string>): string[] {
    const conditions: string[] = [];
    const parts = whereClause.split(/\s+(AND|OR)\s+/i);

    for (let i = 0; i < parts.length; i += 2) {
      const condition = parts[i]?.trim();
      if (!condition || condition.toUpperCase() === 'AND' || condition.toUpperCase() === 'OR') continue;

      const columnMatch = condition.match(/(?:refTable\.)?`([^`]+)`/);
      if (!columnMatch) continue;

      const columnName = columnMatch[1];
      const matchingField = Array.from(tableFields).find(
        (fieldCol) => columnName === fieldCol || condition.includes(`\`${fieldCol}\``),
      );

      if (matchingField) {
        let cleanCondition = condition.trim();
        if (cleanCondition.startsWith('(') && cleanCondition.endsWith(')')) {
          let depth = 0;
          let isWrapped = true;
          for (let j = 0; j < cleanCondition.length - 1; j++) {
            if (cleanCondition[j] === '(') depth++;
            if (cleanCondition[j] === ')') depth--;
            if (depth === 0) {
              isWrapped = false;
              break;
            }
          }
          if (isWrapped) {
            cleanCondition = cleanCondition.substring(1, cleanCondition.length - 1).trim();
          }
        }
        cleanCondition = cleanCondition.replace(/refTable\./g, '');
        conditions.push(cleanCondition);
      }
    }
    return conditions;
  }

  // =========================================================================
  // PRIVATE: SpecialParameterProcessing
  // =========================================================================

  private async specialParameterProcessing(
    tableNameArray: string[],
    field: IReportField,
    paramIdResult: { id: string },
    alphaFieldsResults: FieldsResultDto[],
    outerQueryStatements: string[],
    groupByValues: string[],
    header: ITabularHeader[],
  ): Promise<void> {
    const tablesNamesString = tableNameArray.join('","');

    const fieldQuery = `select
      (select tableName from ${this.coreDbName}.core_modules_tables where id = paramTableId) as paramTableName,
      (select columnName from ${this.coreDbName}.core_tables_field where id = paramTableFieldId and tId = paramTableId) as paramTableField,
      (select columnName from ${this.coreDbName}.core_tables_field where id = paramSelectedFieldId and tId = paramTableId) as paramSelectedField,
      (select tableName from ${this.coreDbName}.core_modules_tables where id = tableId) as tableName,
      (select columnName from ${this.coreDbName}.core_tables_field where id = tableFieldId and tId = tableId) as tableField,
      "${field.columnDisplayName}" as displayName
      from ${this.coreDbName}.core_params_table_relations where FieldId = "${paramIdResult.id}"
      and tableId in
      (select id from ${this.coreDbName}.core_modules_tables where tableName in
      ("${tablesNamesString}") )`;

    const fieldsResult: FieldsResultDto[] = await this.dataSource.query(fieldQuery);

    if (fieldsResult.length !== tableNameArray.length) {
      throw new BadRequestException('Tables chosen not compatible with selected parameter');
    }

    alphaFieldsResults.push(...fieldsResult);
    const fieldSelectionName = fieldsResult[0].displayName;
    const tableColumnName = `${REF_TABLE_KEY}.\`${fieldSelectionName}\``;
    outerQueryStatements.push(` ${tableColumnName} as '${field.columnDisplayName}'`);
    groupByValues.push(`'${field.columnDisplayName}'`);

    header.push({
      text: field.columnDisplayName,
      datafield: field.columnDisplayName,
      draggedId: field.draggedId,
      aggregates: field.footerAggregation || [],
      pinned: field.pinned,
      hidden: field.hidden,
      headerColumnType: field.type,
      index: field.index,
    });
  }

  // =========================================================================
  // PRIVATE: getConfigValueLiteral
  // =========================================================================

  /**
   * Returns the config value as a SQL-safe literal string.
   * In v3 this was done via GetConfigQuery() which embedded a subquery.
   * Here we use the cached config value directly.
   */
  private getConfigValueLiteral(configKey: string | undefined, dateFormatSuffix: string): string {
    // This will be replaced by replaceConfigSubqueries() after the full SQL is built.
    // For now, generate the subquery format that replaceConfigSubqueries expects.
    const key = `${configKey || SK.dateFormat1}${dateFormatSuffix}`;
    return `(select confVal from ${this.coreDbName}.core_sys_config where confKey = '${key}')`;
  }
}
