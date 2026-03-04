/**
 * Trend chart generator - ported from v3 infrastructure/charts/trend.chart.ts.
 *
 * Builds multi-series line/bar trend charts with:
 * - Multiple label axes (including compare column date axes)
 * - Exploded series (GROUP BY on an explode field)
 * - Single optimized query instead of N queries (v3 optimization)
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { IChartData, ICustomOperationColumn, ICustomCompareColumn } from '../dto/report-interfaces';
import { FieldTypes } from '../services/query-builder.service';
import { CUSTOM_DATE_COLUMN } from '../constants';
import { kpiCalculator, hotkeyTransform, IFieldsArrayEntry, isUndefinedOrNull } from './chart-helpers';

export interface ITrendDataField {
  draggedId: string;
  dataId: string;
  type: string;
  color?: string;
  barWidth?: string;
  barGap?: string;
  symbolSize?: number;
  smooth?: boolean;
  showSymbol?: boolean;
  lineStyle?: Record<string, unknown>;
  step?: string;
  stacked?: boolean;
  filled?: boolean;
  areaGradient?: boolean;
  explode?: boolean;
  explodeBy?: string;
  serieIndexes?: number[];
}

export interface ITrendChartOptions {
  labelFields: string[];
  dataFields: ITrendDataField[];
  textTransform?: string;
  subTextTransform?: string;
}

export interface ITrendGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

/**
 * Generate a trend chart using a single optimized query approach.
 *
 * Ported from v3 generateTrend in trend.chart.ts (performance-optimized version).
 */
export async function generateTrend(
  generateResult: ITrendGenerateResult,
  chartObject: IChartData,
  dateObject: { fromDate: string; toDate: string },
  compare: ICustomCompareColumn[],
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const options = chartObject['options'] as ITrendChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;
  const mainTable = 'trendTable';

  const hasDuplicateFields = options.dataFields.some(
    (item, index) =>
      options.dataFields.findIndex(
        (dataId, foundIndex) => dataId.draggedId === item.draggedId && index !== foundIndex,
      ) !== -1,
  );
  if (hasDuplicateFields) {
    throw new BadRequestException(ErrorMessages.CHART_DUPLICATE_FIELD);
  }

  // Reset series
  (lib as Record<string, unknown>)['series'] = [];

  const compareColumnsArray: Array<{ dateName: string; name: string; draggedId: string; dataId: string }> = [];
  const xAxisArray = ((lib['xAxis'] as Array<Record<string, unknown>>) || []).filter((axis) => {
    const name = axis.name as string;
    return !name.includes(CUSTOM_DATE_COLUMN) && !name.includes('(Date)');
  });
  const dataAxisConnectionLabelIndex: Record<string, number> = {};
  const labelFields: IFieldsArrayEntry[] = [];

  // Collect label fields and compare column axes
  for (const fieldId of options.labelFields) {
    const labelSelectedAxis = generateResult.fieldsArray.find((f) => f.draggedId === fieldId);
    if (!labelSelectedAxis) continue;
    labelFields.push(labelSelectedAxis);

    if (labelSelectedAxis.type === FieldTypes.datetime && compare) {
      let dateAxisIndex = 1;
      for (const dataAxisValue of options.dataFields) {
        const compareColumn = compare.find((c) => c.draggedId === dataAxisValue.draggedId);
        if (!isUndefinedOrNull(compareColumn)) {
          const comparedateFieldName = compareColumn.columnDisplayName + CUSTOM_DATE_COLUMN;
          const dateCompareField = generateResult.fieldsArray.find((f) => f.columnDisplayName === comparedateFieldName);
          if (dateCompareField) labelFields.push(dateCompareField);

          if (compareColumn.withStatDate) {
            compareColumnsArray.push({
              dateName: comparedateFieldName,
              name: compareColumn.columnDisplayName,
              draggedId: compareColumn.draggedId,
              dataId: dataAxisValue.dataId,
            });
            dataAxisConnectionLabelIndex[`${compareColumn.draggedId}_${dataAxisValue.dataId}`] = dateAxisIndex;
            dateAxisIndex++;
          } else {
            throw new BadRequestException(ErrorMessages.CHART_TREND_WITHOUT_COMPARE);
          }
        }
      }

      // Add hidden axes for compare columns
      if (compareColumnsArray.length > 0) {
        for (const compareColumn of compareColumnsArray) {
          const existingIndex = xAxisArray.findIndex((axis) => axis.name === compareColumn.dateName);
          if (existingIndex === -1) {
            xAxisArray.push({
              name: compareColumn.dateName,
              show: false,
              data: [],
              type: 'category',
              nameRotate: 0,
              offset: 0,
              nameTextStyle: { padding: [0, 0, 0, 0], align: '', verticalAlign: '', fontSize: 'medium' },
              axisLabel: { rotate: 0, fontSize: 0 },
              axisTick: { show: false, alignWithLabel: false, inside: false, length: 0 },
              axisLine: { show: false },
              z: 100,
              boundaryGap: false,
            });
          } else {
            dataAxisConnectionLabelIndex[`${compareColumn.draggedId}_${compareColumn.dataId}`] = existingIndex;
          }
        }
      }
    }
  }

  try {
    // Initialize serieIndexes
    for (const dataField of options.dataFields) {
      dataField.serieIndexes = [];
    }

    // Step 1: Build a single comprehensive query
    const selectColumns: string[] = [];
    const groupByColumns: string[] = [];
    const orderByColumns: string[] = [];
    const explodeFields = new Set<string>();

    // Add all label columns
    for (let labelIdx = 0; labelIdx < xAxisArray.length; labelIdx++) {
      if (labelIdx >= labelFields.length) break;
      const labelAxisField = labelFields[labelIdx];
      const selectionColumn = `${mainTable}.\`${labelAxisField.columnDisplayName}\``;
      const labelCorrectedString = kpiCalculator(
        generateResult.tables.length,
        generateResult.fieldsArray,
        generateResult.operation,
        labelAxisField.draggedId,
        mainTable,
        `as label_${labelIdx}`,
        false,
      );
      selectColumns.push(labelCorrectedString);
      groupByColumns.push(selectionColumn);
      orderByColumns.push(selectionColumn);
    }

    interface DataFieldConfig {
      index: number;
      field: ITrendDataField;
      trendField: IFieldsArrayEntry | undefined;
      labelAxisIndex: number;
      serieDataIndex: number;
      explodeField?: IFieldsArrayEntry;
    }
    const dataFieldConfigs: DataFieldConfig[] = [];
    const yAxisArray = (lib['yAxis'] as Array<Record<string, unknown>>) || [];

    // Add all data columns and track explode fields
    for (let dataIdx = 0; dataIdx < options.dataFields.length; dataIdx++) {
      const dataAxisValue = options.dataFields[dataIdx];
      const trendField = generateResult.fieldsArray.find((f) => f.draggedId === dataAxisValue.draggedId);
      const serieDataIndex = yAxisArray.findIndex((yaxis) => yaxis['id'] === dataAxisValue.dataId);

      const identifier = `${dataAxisValue.draggedId}_${dataAxisValue.dataId}`;
      const labelAxisIndex = dataAxisConnectionLabelIndex[identifier] || 0;
      if (!(identifier in dataAxisConnectionLabelIndex)) {
        dataAxisConnectionLabelIndex[identifier] = 0;
      }

      const dataCorrectedString = kpiCalculator(
        generateResult.tables.length,
        generateResult.fieldsArray,
        generateResult.operation,
        dataAxisValue.draggedId,
        mainTable,
        `as data_${dataIdx}`,
      );
      selectColumns.push(dataCorrectedString);

      let explodeField: IFieldsArrayEntry | undefined;
      if (dataAxisValue.explode) {
        explodeField = generateResult.fieldsArray.find((f) => f.draggedId === dataAxisValue.explodeBy);
        if (explodeField) {
          const explodeColumn = `${mainTable}.\`${explodeField.columnDisplayName}\``;
          if (!explodeFields.has(explodeColumn)) {
            selectColumns.push(`${explodeColumn} as explode_${dataIdx}`);
            groupByColumns.push(explodeColumn);
            orderByColumns.push(explodeColumn);
            explodeFields.add(explodeColumn);
          }
        }
      }

      dataFieldConfigs.push({
        index: dataIdx,
        field: dataAxisValue,
        trendField,
        labelAxisIndex,
        serieDataIndex,
        explodeField,
      });
    }

    // Execute single optimized query
    const comprehensiveQuery = `SELECT ${selectColumns.join(', ')} FROM (${generateResult.query}) AS ${mainTable} GROUP BY ${groupByColumns.join(', ')} ORDER BY ${orderByColumns.join(', ')}`;
    const allData = await legacyDataDb.query<Record<string, unknown>>(comprehensiveQuery);

    // Step 2: Process results -- build label axes
    for (let labelIdx = 0; labelIdx < xAxisArray.length; labelIdx++) {
      const labelAxis = xAxisArray[labelIdx];
      const labelKey = `label_${labelIdx}`;
      const uniqueLabels = [...new Set(allData.map((row) => row[labelKey]))];
      labelAxis['data'] = uniqueLabels;
    }

    // Step 3: Build series
    const seriesArray = lib['series'] as Array<Record<string, unknown>>;
    for (const config of dataFieldConfigs) {
      const { index, field, trendField, labelAxisIndex, serieDataIndex } = config;
      const dataKey = `data_${index}`;
      const labelKey = `label_${labelAxisIndex}`;

      if (!field.explode) {
        const axisData: Array<number | null> = [];
        const labelAxis = xAxisArray[labelAxisIndex];
        const labelAxisData = labelAxis['data'] as unknown[];

        for (const labelValue of labelAxisData) {
          const dataRow = allData.find((row) => row[labelKey] === labelValue);
          axisData.push(dataRow ? (dataRow[dataKey] as number) : null);
        }

        const trendSerie: Record<string, unknown> = {
          name: trendField?.columnDisplayName,
          type: field.type,
          emphasis: {
            focus: 'series',
            itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' },
          },
          barGap: field.barGap,
          color: field.color,
          barWidth: field.barWidth,
          symbolSize: field.symbolSize,
          smooth: field.smooth,
          showSymbol: field.showSymbol,
          xAxisIndex: labelAxisIndex,
          yAxisIndex: serieDataIndex,
          labelLine: { show: true },
          lineStyle: field.lineStyle,
          data: axisData,
          step: field.step,
          areaStyle: null,
        };

        if (field.stacked) trendSerie['stack'] = 'total';
        if (field.filled) {
          trendSerie['areaStyle'] = { opacity: field.areaGradient ? 0.5 : 1 };
        }

        seriesArray.push(trendSerie);
        field.serieIndexes = [seriesArray.length - 1];
      } else {
        // Exploded series
        const explodeKey = `explode_${index}`;
        const uniqueExplodeValues = [...new Set(allData.map((row) => row[explodeKey]).filter((v) => v !== undefined))];

        field.serieIndexes = [];
        const labelAxis = xAxisArray[labelAxisIndex];
        const labelAxisData = labelAxis['data'] as unknown[];

        for (const explodeBy of uniqueExplodeValues) {
          const dataSet: Array<number | null> = [];
          const explodedData = allData.filter((row) => row[explodeKey] === explodeBy);

          for (const labelValue of labelAxisData) {
            const dataRow = explodedData.find((row) => row[labelKey] === labelValue);
            dataSet.push(dataRow ? (dataRow[dataKey] as number) : null);
          }

          const trendSerie: Record<string, unknown> = {
            name: `${explodeBy} - ${trendField?.columnDisplayName}`,
            type: field.type,
            emphasis: {
              focus: 'series',
              itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' },
            },
            barGap: field.barGap,
            color: field.color,
            barWidth: field.barWidth,
            symbolSize: field.symbolSize,
            smooth: field.smooth,
            showSymbol: field.showSymbol,
            xAxisIndex: labelAxisIndex,
            yAxisIndex: serieDataIndex,
            data: dataSet,
            step: field.step,
            lineStyle: field.lineStyle,
            labelLine: { show: true },
            areaStyle: null,
          };

          if (field.stacked) trendSerie['stack'] = 'total';
          if (field.filled) {
            trendSerie['areaStyle'] = { opacity: field.areaGradient ? 0.5 : 1 };
          }

          seriesArray.push(trendSerie);
          field.serieIndexes.push(seriesArray.length - 1);
        }
      }
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(ErrorMessages.CHART_TREND_ERROR);
  }

  const transformedText = await hotkeyTransform(
    options.textTransform,
    dateObject,
    legacyDataDb,
    dateHelper,
    coreDbName,
  );
  chartObject.name = transformedText || '';
  (lib as Record<string, unknown>)['title'] = {
    ...((lib['title'] as Record<string, unknown>) || {}),
    text: transformedText,
    subtext: await hotkeyTransform(options.subTextTransform, dateObject, legacyDataDb, dateHelper, coreDbName),
  };
  lib['xAxis'] = xAxisArray;

  return chartObject;
}
