/**
 * Pie chart generator - ported from v3 infrastructure/charts/pie.chart.ts.
 *
 * Only the report-side generatePie function is ported here (not widget builder
 * or load/render functions which are frontend-only concerns).
 *
 * Queries the report's generated SQL, wraps it with GROUP BY on the label field,
 * and aggregation on the data field.
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { IChartData, ICustomOperationColumn } from '../dto/report-interfaces';
import { FieldTypes } from '../services/query-builder.service';
import { kpiCalculator, hotkeyTransform, IFieldsArrayEntry, isUndefinedOrNull } from './chart-helpers';

export interface IPieChartOptions {
  labelField: string;
  dataField: string;
  textTransform?: string;
  subTextTransform?: string;
}

export interface IPieGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

/**
 * Generate a pie chart by executing a GROUP BY query on top of the report query.
 *
 * @param generateResult  Result from QueryBuilderService.generateQuery()
 * @param chartObject     Chart configuration object (stored as JSON in core_report_charts.data)
 * @param dateObject      From/to dates for hotkey transform
 * @param legacyDataDb    LegacyDataDbService for executing SQL
 * @param dateHelper      DateHelperService for date formatting
 * @param coreDbName      Core database name for hotkey transform
 */
export async function generatePie(
  generateResult: IPieGenerateResult,
  chartObject: IChartData,
  dateObject: { fromDate: string; toDate: string },
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const options = chartObject['options'] as IPieChartOptions;
  const chartQueryStatements: string[] = [];
  const groupByStatements: string[] = [];
  const mainTable = 'pieTable';

  if (isUndefinedOrNull(options?.labelField) || isUndefinedOrNull(options?.dataField)) {
    throw new BadRequestException(ErrorMessages.CHART_FIELD_IS_MISSING);
  }

  // Label field must be alpha or datetime
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

  // Data field must be number
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
  (chartObject as Record<string, unknown>)['lib'] = {
    ...((chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>),
    title: {
      ...(((chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>)?.['title'] as Record<
        string,
        unknown
      >),
      text: transformedText,
      subtext: await hotkeyTransform(options.subTextTransform, dateObject, legacyDataDb, dateHelper, coreDbName),
    },
    series: {
      ...(((chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>)?.['series'] as Record<
        string,
        unknown
      >),
      data: chartResult,
    },
  };

  return chartObject;
}
