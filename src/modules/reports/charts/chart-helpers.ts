/**
 * Chart helper utilities ported from v3 core/utils/chart.util.ts
 * and core/utils/common.util.ts.
 *
 * These are pure functions (no DI) used by chart generators to:
 * - Build aggregated SQL expressions from the query builder result (KPIcalculator)
 * - Transform hotkey placeholders in chart titles (hotkeyTransform)
 * - Empty chart data structures by type (emptyReportChartByType)
 * - Deep copy chart objects (deepCopy)
 * - Format numbers with truncation/rounding (numberFormatter)
 * - Normalize chart gauge values (normalizeChartValue)
 * - Format large numbers in human-readable form (humanReadableLargeNumber)
 * - Adjust bar chart label display (barLabelChanger)
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { ChartTypes, BarLabelValues } from '../enums';
import {
  IChartData,
  ICustomOperationColumn,
  ICustomCompareColumn,
  ICustomControlColumn,
  IFieldsArrayEntry,
} from '../dto/report-interfaces';
export type { IFieldsArrayEntry } from '../dto/report-interfaces';
import { REF_TABLE_KEY } from '../constants';
import { dbRound, dbTruncate } from '../utils/sql-helpers';
import { CustomColumnType, FieldFunctions } from '../services/query-builder.service';

// ---------------------------------------------------------------------------
// Internal interfaces for chart generation
// ---------------------------------------------------------------------------

/** Bar series structure used by vertical/horizontal bar charts */
export interface IBarSerie {
  draggedId?: string;
  name: string;
  type: string;
  data: Array<unknown>;
  label?: Record<string, unknown>;
  emphasis?: Record<string, unknown>;
  barGap?: string;
  color?: string;
  barWidth?: string;
  symbolSize?: number;
  showSymbol?: boolean;
  areaStyle?: Record<string, unknown> | null;
  smooth?: boolean;
  step?: string;
  lineStyle?: Record<string, unknown>;
  xAxisIndex?: number;
  yAxisIndex?: number;
  labelLine?: Record<string, unknown>;
  stack?: string;
  [key: string]: unknown;
}

/** Chart value with optional itemStyle for threshold coloring */
export interface IChartValue {
  value: number;
  itemStyle?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// KPIcalculator
// ---------------------------------------------------------------------------

/**
 * Build a SQL aggregation expression for a given field in a chart context.
 *
 * For OPERATION custom columns: replaces inner table aliases (t0., t1., ...)
 * with the chart table alias, and replaces CASE/COMPARE sub-expressions.
 *
 * For regular numeric fields: wraps with the field's operation (SUM, AVG, etc.).
 *
 * Ported faithfully from v3 KPIcalculator in chart.util.ts.
 */
export function kpiCalculator(
  tablesLength: number,
  fieldsArray: IFieldsArrayEntry[],
  operationColumns: Array<ICustomOperationColumn>,
  draggedId: string,
  chartTableName: string,
  columnAlias: string,
  withOperation = true,
): string {
  let correctedString = '';
  const calculatedField = fieldsArray.find((f) => f.draggedId === draggedId);

  if (!calculatedField) {
    return `${chartTableName}.\`${draggedId}\` ${columnAlias}`;
  }

  if (
    fieldsArray.length > 0 &&
    calculatedField.isCustomColumn &&
    calculatedField.customColumnType === CustomColumnType.OPERATION
  ) {
    let operationString: string = calculatedField.builtString || '';

    // Replace CASE and COMPARE custom column built strings with chart-level aggregation
    for (const field of fieldsArray) {
      if (field.isCustomColumn && field.customColumnType === CustomColumnType.CASE && field.builtString) {
        const controlStringRegex = new RegExp(field.builtString.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
        operationString = operationString.replace(
          controlStringRegex,
          `sum(${chartTableName}.\`${field.columnDisplayName}\`)`,
        );
      } else if (field.isCustomColumn && field.customColumnType === CustomColumnType.COMPARE) {
        if (field.builtString && field.builtString.trim().length > 5) {
          const controlStringRegex = new RegExp(field.builtString.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
          operationString = operationString.replace(
            controlStringRegex,
            `${field.operation}(${chartTableName}.\`${field.columnDisplayName}\`)`,
          );
        }
      }
    }

    // Replace table aliases (t0., t1., ...) with chart table name
    for (let tableIndex = 0; tableIndex < tablesLength; tableIndex++) {
      const tableNameRegex = new RegExp(`t${tableIndex}\\.`, 'g');
      operationString = operationString.replace(tableNameRegex, chartTableName + '.');
    }

    // Replace refTable alias
    const refTableRegex = new RegExp(`${REF_TABLE_KEY}\\.`, 'g');
    operationString = operationString.replace(refTableRegex, chartTableName + '.');

    // Apply truncate or round if configured
    if (operationColumns) {
      const operationColumn = operationColumns.find((op) => op.draggedId === draggedId);
      if (operationColumn) {
        if (operationColumn[FieldFunctions.truncate] && operationColumn.trunc) {
          operationString = dbTruncate(operationString, String(operationColumn.trValue));
        } else if (operationColumn[FieldFunctions.round] && operationColumn.round) {
          operationString = dbRound(operationString, String(operationColumn.trValue));
        }
      }
    }

    correctedString = `${operationString} ${columnAlias}`;
  } else {
    if (withOperation && calculatedField.operation) {
      correctedString = `${calculatedField.operation}(${chartTableName}.\`${calculatedField.columnDisplayName}\`) ${columnAlias}`;
    } else {
      correctedString = `${chartTableName}.\`${calculatedField.columnDisplayName}\` ${columnAlias}`;
    }
  }

  return correctedString;
}

// ---------------------------------------------------------------------------
// HotkeyTransform
// ---------------------------------------------------------------------------

/**
 * Replace hotkey placeholders in chart title/subtitle strings.
 *
 * Queries core_sys_config for keys marked with description='hotKeys',
 * then replaces placeholders in the string. Supports:
 * - `object.fromDate` / `object.toDate` replacements
 * - `moment` / `moment-1` date replacements
 *
 * Ported from v3 HotkeyTransform in chart.util.ts.
 */
export async function hotkeyTransform(
  stringToTransform: string | undefined,
  dateObject: Record<string, string | null>,
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<string | undefined> {
  if (!stringToTransform) return stringToTransform;

  try {
    let transformedString = stringToTransform;
    const hotKeyConfigs = await legacyDataDb.query<{ confKey: string; confVal: string }>(
      `SELECT confKey, confVal FROM ${coreDbName}.core_sys_config WHERE description = 'hotKeys'`,
    );

    for (const hotKey of hotKeyConfigs) {
      if (_isTokenExistsInString(hotKey.confVal, 'object')) {
        const dateKey = hotKey.confVal.split('.')[1];
        if (stringToTransform.includes(hotKey.confKey)) {
          if (dateObject[dateKey] !== null && dateObject[dateKey] !== undefined) {
            const date = dateObject[dateKey];
            transformedString = transformedString.replace(
              hotKey.confKey,
              dateHelper.formatDate('yyyy-MM-dd', dateHelper.parseISO(date)),
            );
          }
        }
      } else if (_isTokenExistsInString(hotKey.confVal, 'moment')) {
        if (stringToTransform.includes(hotKey.confKey)) {
          if (hotKey.confVal === 'moment-1') {
            const dateValue = dateHelper.formatDate(
              'yyyy-MM-dd HH:mm:59',
              dateHelper.subtractDurationFromDate({ days: 1 }),
            );
            transformedString = transformedString.replace(hotKey.confKey, dateValue);
          } else {
            transformedString = transformedString.replace(hotKey.confKey, dateHelper.formatDate('yyyy-MM-dd HH:mm:59'));
          }
        }
      }
    }

    return transformedString;
  } catch (error) {
    throw new BadRequestException(ErrorMessages.CHART_HOT_KEY_ERROR);
  }
}

// ---------------------------------------------------------------------------
// emptyReportChartByType
// ---------------------------------------------------------------------------

/**
 * Return an empty chart data structure by clearing data arrays.
 * Ported from v3 emptyReportChartByType in chart.util.ts.
 */
export function emptyReportChartByType(chart: IChartData): IChartData {
  switch (chart.type) {
    case ChartTypes.VERTICAL_BAR:
    case ChartTypes.HORIZONTAL_BAR: {
      const barChart = chart as IChartData & { lib: { xAxis?: unknown[]; yAxis?: unknown[]; series: unknown[] } };
      if (barChart.lib) {
        const axes = (chart.type === ChartTypes.HORIZONTAL_BAR ? barChart.lib.yAxis : barChart.lib.xAxis) as Array<{
          data: unknown[];
        }>;
        if (axes) {
          for (const axis of axes) {
            axis.data = [];
          }
        }
        barChart.lib.series = [];
      }
      return chart;
    }
    case ChartTypes.TREND: {
      const trendChart = chart as IChartData & { lib: { xAxis: Array<{ data: unknown[] }>; series: unknown[] } };
      if (trendChart.lib) {
        for (const axis of trendChart.lib.xAxis) {
          axis.data = [];
        }
        trendChart.lib.series = [];
      }
      return chart;
    }
    case ChartTypes.PIE:
    case ChartTypes.DOUGHNUT: {
      const pieChart = chart as IChartData & { lib: { series: { data: unknown[] } } };
      if (pieChart.lib) {
        pieChart.lib.series.data = [];
      }
      return chart;
    }
    case ChartTypes.PROGRESS: {
      const progressChart = chart as IChartData & {
        lib: { series: { data: Array<{ name: string; value: number | null }> } };
      };
      if (progressChart.lib && progressChart.lib.series.data.length > 0) {
        progressChart.lib.series.data[0].name = '';
        progressChart.lib.series.data[0].value = null;
      }
      return chart;
    }
    case ChartTypes.EXPLODED_PROGRESS: {
      const explodedChart = chart as IChartData & { explodedData: unknown[] };
      explodedChart.explodedData = [];
      return chart;
    }
    default:
      return chart;
  }
}

// ---------------------------------------------------------------------------
// Deep copy
// ---------------------------------------------------------------------------

/**
 * Recursive deep copy that handles arrays, plain objects, and primitives.
 * Ported from v3 DeepCopyFunction in common.util.ts.
 */
export function deepCopy<T>(inObject: T): T {
  return structuredClone(inObject);
}

// ---------------------------------------------------------------------------
// Number formatting helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a percentage value to max 200 (gauge chart boundary).
 * Ported from v3 normalizeChartValue.
 */
export function normalizeChartValue(value: number, maxValue = 200): number {
  if (value > maxValue) {
    value = maxValue;
  }
  return value;
}

/**
 * Format a number with truncation or rounding to specified decimal places.
 * Ported from v3 numberFormater.
 */
export function numberFormatter(number: number, type: string, decimalPlaces: number): number {
  if (number.toString().split('.').length > 1 && number.toString().split('.')[1].length < decimalPlaces) {
    return number;
  }
  const multiplier = Math.pow(10, decimalPlaces);
  if (type === FieldFunctions.truncate) {
    return Math.floor(number * multiplier) / multiplier;
  } else if (type === FieldFunctions.round) {
    return Math.round(number * multiplier) / multiplier;
  }
  return number;
}

/**
 * Convert large numbers to human-readable strings (e.g. "1.23 trillion").
 * Ported from v3 humanReadableLargeNumber.
 */
export function humanReadableLargeNumber(num: number): string {
  const absNum = Math.abs(num);
  if (absNum < 1e12) return num.toString();
  if (absNum < 1e15) return (num / 1e12).toFixed(2) + ' trillion';
  if (absNum < 1e18) return (num / 1e15).toFixed(2) + ' quadrillion';
  if (absNum < 1e21) return (num / 1e18).toFixed(2) + ' quintillion';
  if (absNum < 1e24) return (num / 1e21).toFixed(2) + ' sextillion';
  if (absNum < 1e27) return (num / 1e24).toFixed(2) + ' septillion';
  if (absNum < 1e30) return (num / 1e27).toFixed(2) + ' octillion';
  return (num / 1e30).toFixed(2) + ' nonillion';
}

// ---------------------------------------------------------------------------
// Bar label changer
// ---------------------------------------------------------------------------

/**
 * Adjust bar chart label display based on BarLabelValues.
 * Ported from v3 barLableChanger.
 */
export function barLabelChanger(
  barLabel: string,
  series: Array<IBarSerie>,
  isVertical: boolean,
  bgColor: string,
  labelRotate = 0,
): void {
  switch (barLabel) {
    case BarLabelValues.NONE: {
      for (const serie of series) {
        serie.label = { show: false };
      }
      break;
    }
    case BarLabelValues.VALUE: {
      let offset = isVertical ? [0, 0] : [5, 0];
      let align = isVertical ? 'center' : 'left';
      if (isVertical && labelRotate > 0) {
        offset = [10, 0];
        align = 'left';
      }
      for (const serie of series) {
        serie.label = {
          show: true,
          formatter: '{c}',
          fontSize: 12,
          align,
          offset,
          backgroundColor: bgColor,
          rotate: labelRotate,
        };
      }
      break;
    }
    case BarLabelValues.SERIE_VALUE: {
      let formatter = isVertical ? '{b}\n({c})' : '{b} ({c})';
      let offset = isVertical ? [0, -10] : [5, 0];
      let align = isVertical ? 'center' : 'left';
      if (isVertical && labelRotate > 0) {
        formatter = formatter.replace(/\n/g, ' ');
        offset = [10, 0];
        align = 'left';
      }
      for (const serie of series) {
        serie.label = {
          show: true,
          formatter,
          fontSize: 12,
          align,
          offset,
          backgroundColor: bgColor,
          rotate: labelRotate,
        };
      }
      break;
    }
    case BarLabelValues.COLUMN_VALUE: {
      let formatter = isVertical ? '{a}\n({c})' : '{a} ({c})';
      let offset = isVertical ? [0, -10] : [5, 0];
      let align = isVertical ? 'center' : 'left';
      if (isVertical && labelRotate > 0) {
        formatter = formatter.replace(/\n/g, ' ');
        offset = [10, 0];
        align = 'left';
      }
      for (const serie of series) {
        serie.label = {
          show: true,
          formatter,
          fontSize: 12,
          align,
          offset,
          backgroundColor: bgColor,
          rotate: labelRotate,
        };
      }
      break;
    }
    default: {
      let offset = isVertical ? [0, -10] : [5, 0];
      let align = isVertical ? 'center' : 'left';
      if (isVertical && labelRotate > 0) {
        offset = [10, 0];
        align = 'left';
      }
      for (const serie of series) {
        serie.label = {
          show: true,
          fontSize: 12,
          align,
          offset,
          backgroundColor: bgColor,
          rotate: labelRotate,
        };
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _isTokenExistsInString(str: string, token: string): boolean {
  if (!str || !token) return false;
  return str.toLowerCase().indexOf(token.toLowerCase()) !== -1;
}

function _isUndefinedOrNull(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

/** Exported alias for use in chart generators */
export const isUndefinedOrNull = _isUndefinedOrNull;
