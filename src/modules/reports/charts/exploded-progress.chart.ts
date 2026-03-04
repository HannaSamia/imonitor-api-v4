/**
 * Exploded progress (gauge) chart generator - ported from v3
 * infrastructure/charts/explodedProgress.chart.ts.
 *
 * Generates one progress gauge per exploded group (e.g., per node_name).
 * Each gauge shows percentage = (dataField * 100) / totalField for that group.
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

export interface IExplodedProgressChartOptions {
  totalField: string;
  dataField: string;
  explodeBy: string;
  color?: string;
  textTransform?: string;
  subTextTransform?: string;
  showInnerTitle?: boolean;
  detailOffsetCenter?: number[];
  titleOffsetCenter?: number[];
  format?: { type: string; value: number };
}

export interface IExplodedSerieData {
  data: {
    detail: { offsetCenter?: number[] };
    name: string;
    title: { offsetCenter?: number[] };
    value: number;
  };
  title: {
    text: string;
    subtext: string;
  };
}

export interface IExplodedProgressGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

export interface IExplodedProgressResult {
  chart: IChartData;
  totalFieldName: string;
  dataFieldName: string;
}

/**
 * Generate an exploded progress chart.
 *
 * Groups by the explodeBy field and creates one gauge entry per group.
 * Ported from v3 generateExplodedProgress.
 */
export async function generateExplodedProgress(
  generateResult: IExplodedProgressGenerateResult,
  chartObject: IChartData,
  dateObject: { fromDate: string; toDate: string },
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IExplodedProgressResult> {
  const DEFAULT_TRUNC = 4;
  const mainTable = 'progressTable';
  const options = chartObject['options'] as IExplodedProgressChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;
  const progressOptionsArray: IExplodedSerieData[] = [];

  const totalField = generateResult.fieldsArray.find((f) => f.draggedId === options.totalField);
  const dataField = generateResult.fieldsArray.find((f) => f.draggedId === options.dataField);
  const explodedField = generateResult.fieldsArray.find((f) => f.draggedId === options.explodeBy);

  if (!totalField || !dataField || totalField.type !== FieldTypes.number || dataField.type !== FieldTypes.number) {
    throw new BadRequestException(ErrorMessages.CHART_NO_NUMBER_FIELD);
  }
  if (!explodedField || explodedField.type === FieldTypes.number) {
    throw new BadRequestException(ErrorMessages.CHART_EXPLODE_FIELD_ERROR);
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

  const finalQuery = `SELECT ${dbIfNull(`\`${explodedField.columnDisplayName}\``, '"NULL"')} AS explode, ${dbIfNull(totalFieldQuery, '0')} AS total, ${dbIfNull(dataFieldQuery, '0')} AS percentageValue FROM (${generateResult.query}) AS ${mainTable} GROUP BY \`${explodedField.columnDisplayName}\``;

  const progressQueryResult = await legacyDataDb.query<{ total: number; percentageValue: number; explode: string }>(
    finalQuery,
  );

  for (const progressResult of progressQueryResult) {
    if (isUndefinedOrNull(progressResult.percentageValue) || isUndefinedOrNull(progressResult.total)) {
      progressResult.percentageValue = 0;
    }

    let percentage = 100;
    if (isUndefinedOrNull(progressResult.percentageValue) || isUndefinedOrNull(progressResult.total)) {
      progressResult.percentageValue = 0;
      percentage = 0;
      if (isUndefinedOrNull(progressResult.total)) {
        percentage = 100;
        progressResult.total = 0;
      }
    } else {
      percentage =
        progressResult.total === 0 && progressResult.percentageValue === 0
          ? 100
          : (progressResult.percentageValue * 100) / progressResult.total;
    }

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
        DEFAULT_TRUNC,
      );
    }

    const progressSerieData = {
      detail: { offsetCenter: options.detailOffsetCenter },
      name: options.showInnerTitle
        ? humanReadableLargeNumber(progressResult.percentageValue).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        : '',
      title: { offsetCenter: options.titleOffsetCenter },
      value: percentage,
    };

    const explodedData: IExplodedSerieData = {
      data: progressSerieData,
      title: {
        text: progressResult.explode,
        subtext: progressResult.total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','),
      },
    };

    progressOptionsArray.push(explodedData);
  }

  (chartObject as Record<string, unknown>)['explodedData'] = progressOptionsArray;

  const transformedText = await hotkeyTransform(
    options.textTransform,
    dateObject,
    legacyDataDb,
    dateHelper,
    coreDbName,
  );
  chartObject.name = transformedText || '';
  ((lib['title'] as Record<string, unknown>) || {})['text'] = transformedText;
  ((lib['title'] as Record<string, unknown>) || {})['subtext'] = await hotkeyTransform(
    options.subTextTransform,
    dateObject,
    legacyDataDb,
    dateHelper,
    coreDbName,
  );

  return {
    chart: chartObject,
    totalFieldName: totalField.columnDisplayName,
    dataFieldName: dataField.columnDisplayName,
  };
}
