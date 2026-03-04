/**
 * Progress (gauge) chart generator - ported from v3 infrastructure/charts/progress.chart.ts.
 *
 * Calculates a percentage from totalField and dataField, formats it,
 * and populates the gauge chart data structure.
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { IChartData, ICustomOperationColumn } from '../dto/report-interfaces';
import { FieldTypes, FieldFunctions } from '../services/query-builder.service';
import { dbIfNull } from '../utils/sql-helpers';
import {
  kpiCalculator,
  hotkeyTransform,
  normalizeChartValue,
  numberFormatter,
  humanReadableLargeNumber,
  IFieldsArrayEntry,
  isUndefinedOrNull,
} from './chart-helpers';

export interface IProgressChartOptions {
  totalField: string;
  dataField: string;
  color?: string;
  textTransform?: string;
  subTextTransform?: string;
  showInnerTitle?: boolean;
  detailOffsetCenter?: number[];
  titleOffsetCenter?: number[];
  format?: { type: string; value: number };
}

export interface IProgressGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

export interface IProgressResult {
  chart: IChartData;
  totalFieldName: string;
  dataFieldName: string;
}

/**
 * Generate a progress (gauge) chart.
 *
 * Calculates percentage = (dataField * 100) / totalField,
 * normalizes to [0, 200], applies formatting, and populates gauge data.
 *
 * Ported from v3 generateProgress.
 */
export async function generateProgress(
  generateResult: IProgressGenerateResult,
  chartObject: IChartData,
  dateObject: { fromDate: string; toDate: string },
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IProgressResult> {
  const DEFAULT_TRUNC = 4;
  const mainTable = 'progressTable';
  const options = chartObject['options'] as IProgressChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;

  const totalField = generateResult.fieldsArray.find((f) => f.draggedId === options.totalField);
  const dataField = generateResult.fieldsArray.find((f) => f.draggedId === options.dataField);

  if (!totalField || !dataField || totalField.type !== FieldTypes.number || dataField.type !== FieldTypes.number) {
    throw new BadRequestException(ErrorMessages.CHART_NO_NUMBER_FIELD);
  }

  const totalFieldQuery = kpiCalculator(
    generateResult.tables.length,
    generateResult.fieldsArray,
    generateResult.operation,
    totalField.draggedId,
    mainTable,
    '',
  );
  const dataFieldQuery = kpiCalculator(
    generateResult.tables.length,
    generateResult.fieldsArray,
    generateResult.operation,
    dataField.draggedId,
    mainTable,
    '',
  );

  const finalQuery = `SELECT ${dbIfNull(totalFieldQuery, '0')} AS total, ${dbIfNull(dataFieldQuery, '0')} AS percentageValue FROM (${generateResult.query}) AS ${mainTable}`;
  const progressQueryResult = await legacyDataDb.query<{ total: number; percentageValue: number }>(finalQuery);
  const progressResult = progressQueryResult[0] || { total: 0, percentageValue: 0 };

  if (isUndefinedOrNull(progressResult.percentageValue) || isUndefinedOrNull(progressResult.total)) {
    progressResult.percentageValue = 0;
  }

  let percentage =
    progressResult.percentageValue === 0 ? 100 : (progressResult.percentageValue * 100) / progressResult.total;

  if (!isFinite(percentage)) {
    percentage = 100;
  }

  percentage = normalizeChartValue(percentage);

  // Apply formatting
  const formatterType = options.format?.type || '';
  const formatValue = options.format?.value || DEFAULT_TRUNC;

  if (formatterType === FieldFunctions.truncate) {
    progressResult.total = numberFormatter(progressResult.total, formatterType, formatValue);
    percentage = numberFormatter(percentage, formatterType, formatValue);
    progressResult.percentageValue = numberFormatter(progressResult.percentageValue, formatterType, formatValue);
  } else if (formatterType === FieldFunctions.round) {
    progressResult.total = numberFormatter(progressResult.total, formatterType, formatValue);
    percentage = numberFormatter(percentage, formatterType, formatValue);
    progressResult.percentageValue = numberFormatter(progressResult.percentageValue, formatterType, formatValue);
  } else {
    progressResult.total = numberFormatter(progressResult.total, FieldFunctions.truncate, DEFAULT_TRUNC);
    percentage = numberFormatter(percentage, FieldFunctions.truncate, DEFAULT_TRUNC);
    progressResult.percentageValue = numberFormatter(
      progressResult.percentageValue,
      FieldFunctions.truncate,
      formatValue,
    );
  }

  // Build series data
  const progressSerieData = {
    detail: { offsetCenter: options.detailOffsetCenter },
    name: options.showInnerTitle
      ? humanReadableLargeNumber(progressResult.percentageValue).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : '',
    title: { offsetCenter: options.titleOffsetCenter },
    value: percentage,
  };

  (chartObject['options'] as Record<string, unknown>)['value'] = percentage;

  // Update lib
  const series = lib['series'] as Record<string, unknown>;
  if (series) {
    (series['detail'] as Record<string, unknown>)['color'] = options.color;
    (series['title'] as Record<string, unknown>)['color'] = options.color;
    ((series['progress'] as Record<string, unknown>)['itemStyle'] as Record<string, unknown>)['color'] = options.color;
    (series['data'] as unknown[])[0] = progressSerieData;
  }

  // Handle subtitle
  if (options.subTextTransform === 'Subtitle' || options.subTextTransform === '') {
    ((lib['title'] as Record<string, unknown>) || {})['subtext'] = progressResult.total
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  } else {
    ((lib['title'] as Record<string, unknown>) || {})['subtext'] = await hotkeyTransform(
      options.subTextTransform,
      dateObject,
      legacyDataDb,
      dateHelper,
      coreDbName,
    );
  }

  const transformedText = await hotkeyTransform(
    options.textTransform,
    dateObject,
    legacyDataDb,
    dateHelper,
    coreDbName,
  );
  chartObject.name = transformedText || '';
  ((lib['title'] as Record<string, unknown>) || {})['text'] = transformedText;

  if (options.subTextTransform !== 'Subtitle' && options.subTextTransform !== '') {
    ((lib['title'] as Record<string, unknown>) || {})['subtext'] = await hotkeyTransform(
      options.subTextTransform,
      dateObject,
      legacyDataDb,
      dateHelper,
      coreDbName,
    );
  }

  return {
    chart: chartObject,
    totalFieldName: totalField.columnDisplayName,
    dataFieldName: dataField.columnDisplayName,
  };
}
