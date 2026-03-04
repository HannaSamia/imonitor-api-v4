/**
 * Doughnut chart generator - ported from v3 infrastructure/charts/doughnut.chart.ts.
 *
 * Structurally identical to the pie chart (same label + data field pattern),
 * but with a different table alias and chart type.
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { IChartData, ICustomOperationColumn } from '../dto/report-interfaces';
import { FieldTypes } from '../services/query-builder.service';
import { kpiCalculator, hotkeyTransform, IFieldsArrayEntry, isUndefinedOrNull } from './chart-helpers';

export interface IDoughnutChartOptions {
  labelField: string;
  dataField: string;
  textTransform?: string;
  subTextTransform?: string;
}

export interface IDoughnutGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

/**
 * Generate a doughnut chart by executing a GROUP BY query on top of the report query.
 */
export async function generateDoughnut(
  generateResult: IDoughnutGenerateResult,
  chartObject: IChartData,
  dateObject: { fromDate: string; toDate: string },
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const options = chartObject['options'] as IDoughnutChartOptions;
  const chartQueryStatements: string[] = [];
  const groupByStatements: string[] = [];
  const mainTable = 'doughnutTable';

  if (isUndefinedOrNull(options?.labelField) || isUndefinedOrNull(options?.dataField)) {
    throw new BadRequestException(ErrorMessages.CHART_FIELD_IS_MISSING);
  }

  const labelField = generateResult.fieldsArray.find((h) => h.draggedId === options.labelField);
  if (isUndefinedOrNull(labelField)) {
    throw new BadRequestException(ErrorMessages.CHART_CANNOT_FIND_FIELD);
  }
  if (labelField.type === FieldTypes.alpha || labelField.type === FieldTypes.datetime) {
    chartQueryStatements.push(`${mainTable}.\`${labelField.columnDisplayName}\` as name`);
    groupByStatements.push(`${mainTable}.\`${labelField.columnDisplayName}\``);
  } else {
    throw new BadRequestException(ErrorMessages.CHART_FIELD_IS_MISSING);
  }

  const dataField = generateResult.fieldsArray.find((h) => h.draggedId === options.dataField);
  if (isUndefinedOrNull(dataField)) {
    throw new BadRequestException(ErrorMessages.CHART_CANNOT_FIND_FIELD);
  }
  if (dataField.type === FieldTypes.number) {
    const correctedString = kpiCalculator(
      generateResult.tables.length,
      generateResult.fieldsArray,
      generateResult.operation,
      options.dataField,
      mainTable,
      'as value',
    );
    chartQueryStatements.push(correctedString);
  } else {
    throw new BadRequestException(ErrorMessages.CHART_FIELD_IS_MISSING);
  }

  const chartQuery = `SELECT ${chartQueryStatements.join(', ')} FROM (${generateResult.query}) AS ${mainTable} GROUP BY ${groupByStatements.join(', ')}`;
  const chartResult = await legacyDataDb.query<{ name: string; value: number }>(chartQuery);

  const transformedText = await hotkeyTransform(
    options.textTransform,
    dateObject,
    legacyDataDb,
    dateHelper,
    coreDbName,
  );

  chartObject.name = transformedText || '';
  const lib = ((chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>) || {};
  const existingTitle = (lib['title'] as Record<string, unknown>) || {};
  const existingSeries = (lib['series'] as Record<string, unknown>) || {};

  (chartObject as Record<string, unknown>)['lib'] = {
    ...lib,
    title: {
      ...existingTitle,
      text: transformedText,
      subtext: await hotkeyTransform(options.subTextTransform, dateObject, legacyDataDb, dateHelper, coreDbName),
    },
    series: {
      ...existingSeries,
      data: chartResult,
    },
  };

  return chartObject;
}
