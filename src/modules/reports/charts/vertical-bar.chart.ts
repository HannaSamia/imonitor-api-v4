/**
 * Vertical bar chart generator - ported from v3 infrastructure/charts/verticalBar.chart.ts.
 *
 * Builds multi-series vertical bar charts with label axes on xAxis,
 * data axes on yAxis, compare column support, and explode support.
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { IChartData, ICustomOperationColumn, ICustomCompareColumn } from '../dto/report-interfaces';
import { FieldTypes } from '../services/query-builder.service';
import { CUSTOM_DATE_COLUMN } from '../constants';
import {
  kpiCalculator,
  hotkeyTransform,
  barLabelChanger,
  IFieldsArrayEntry,
  IBarSerie,
  isUndefinedOrNull,
} from './chart-helpers';

export interface IVerticalBarDataField {
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
  label?: Record<string, unknown>;
  areaStyle?: Record<string, unknown>;
  serieIndexes?: number[];
}

export interface IVerticalBarChartOptions {
  labelFields: string[];
  dataFields: IVerticalBarDataField[];
  textTransform?: string;
  subTextTransform?: string;
  barLabel?: string;
  barLabelBackgroundColor?: string;
  barLabelRotation?: number;
}

export interface IVerticalBarGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

/**
 * Generate a vertical bar chart.
 *
 * For each label axis, queries the report result grouped by the label field,
 * then for each data field creates a bar series.
 *
 * Ported faithfully from v3 generateVerticalBar.
 */
export async function generateVerticalBar(
  generateResult: IVerticalBarGenerateResult,
  chartObject: IChartData,
  dateObject: { fromDate: string; toDate: string },
  compare: ICustomCompareColumn[],
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const options = chartObject['options'] as IVerticalBarChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;
  const mainTable = 'verticalTable';
  const dataAxisName = 'dataAxis';
  const labelAxisName = 'labelAxis';
  const compareLabelName = 'compare Date';

  const hasDuplicateFields = options.dataFields.some(
    (item, index) => options.dataFields.findIndex((d, i) => d.draggedId === item.draggedId && index !== i) !== -1,
  );
  if (hasDuplicateFields) {
    throw new BadRequestException(ErrorMessages.CHART_DUPLICATE_FIELD);
  }

  const explode = new Set<string>();
  (lib as Record<string, unknown>)['series'] = [];
  const seriesArray = lib['series'] as IBarSerie[];

  const compareColumnsArray: Array<{ dateName: string; name: string; draggedId: string; dataId: string }> = [];
  const xAxisRaw = (lib['xAxis'] as Array<Record<string, unknown>>) || [];
  const labelAxisArray = xAxisRaw.filter((axis) => {
    const name = axis.name as string;
    const show = axis.show as boolean;
    return (
      (!name.includes(CUSTOM_DATE_COLUMN) && name !== compareLabelName && name !== 'Date' && show === false) ||
      show === true
    );
  });
  const dataAxisConnectionLabelIndex: Record<string, number> = {};
  const labelFields: IFieldsArrayEntry[] = [];

  // Collect label fields and build compare axes
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
            dataAxisConnectionLabelIndex[`${dataAxisValue.draggedId}_${dataAxisValue.dataId}`] = dateAxisIndex;
            dateAxisIndex++;
          } else {
            throw new BadRequestException(ErrorMessages.CHART_TREND_WITHOUT_COMPARE);
          }
        }
      }

      if (compareColumnsArray.length > 0) {
        for (const compareColumn of compareColumnsArray) {
          const existingIndex = labelAxisArray.findIndex((axis) => axis.name === compareColumn.dateName);
          if (existingIndex === -1) {
            labelAxisArray.push({
              name: compareLabelName,
              show: false,
              data: [],
              type: 'category',
              nameRotate: 0,
              offset: 0,
              nameTextStyle: { padding: [0, 0, 0, 0], align: '', verticalAlign: '' },
              axisLabel: { rotate: 0, fontSize: 0 },
              axisTick: { show: false, alignWithLabel: false, inside: false, length: 0 },
              axisLine: { show: false },
              z: 0,
              boundaryGap: false,
            });
          } else {
            dataAxisConnectionLabelIndex[`${compareColumn.draggedId}_${compareColumn.dataId}`] = existingIndex;
          }
        }
      }
    }
  }

  // Initialize serieIndexes
  for (const dataField of options.dataFields) {
    dataField.serieIndexes = [];
  }

  const yAxisArray = (lib['yAxis'] as Array<Record<string, unknown>>) || [];

  // Process each label axis
  for (let labelIdx = 0; labelIdx < labelAxisArray.length; labelIdx++) {
    const labelAxis = labelAxisArray[labelIdx];
    if (labelIdx >= labelFields.length) break;
    const labelAxisField = labelFields[labelIdx];

    const selectionColumn = `${mainTable}.\`${labelAxisField.columnDisplayName}\``;
    const labelQuery = `SELECT ${selectionColumn} AS ${labelAxisName} FROM (${generateResult.query}) AS ${mainTable} GROUP BY ${selectionColumn} ORDER BY ${selectionColumn}`;
    const labelDataResult = await legacyDataDb.query<Record<string, unknown>>(labelQuery);

    labelAxis['data'] = [];
    for (const row of labelDataResult) {
      (labelAxis['data'] as unknown[]).push(row[labelAxisName]);
    }

    // Process each data field for this label axis
    for (const dataAxisValue of options.dataFields) {
      const trendField = generateResult.fieldsArray.find((f) => f.draggedId === dataAxisValue.draggedId);
      const dataIndex = yAxisArray.findIndex((yaxis) => yaxis['id'] === dataAxisValue.dataId);

      const identifier = `${dataAxisValue.draggedId}_${dataAxisValue.dataId}`;
      if (!(identifier in dataAxisConnectionLabelIndex)) {
        dataAxisConnectionLabelIndex[identifier] = labelIdx;
      }

      if (dataAxisConnectionLabelIndex[identifier] === labelIdx) {
        const labelCorrected = kpiCalculator(
          generateResult.tables.length,
          generateResult.fieldsArray,
          generateResult.operation,
          labelAxisField.draggedId,
          mainTable,
          `as ${labelAxisName}`,
          false,
        );
        const dataCorrected = kpiCalculator(
          generateResult.tables.length,
          generateResult.fieldsArray,
          generateResult.operation,
          dataAxisValue.draggedId,
          mainTable,
          `as ${dataAxisName}`,
        );

        if (!dataAxisValue.explode) {
          const dataQuery = `SELECT ${labelCorrected}, ${dataCorrected} FROM (${generateResult.query}) AS ${mainTable} GROUP BY ${selectionColumn} ORDER BY ${selectionColumn}`;
          const dataResults = await legacyDataDb.query<Record<string, unknown>>(dataQuery);

          const axisData: Array<{ value: number }> = [];
          for (const row of dataResults) {
            axisData.push({ value: row[dataAxisName] as number });
          }

          const serie: IBarSerie = {
            draggedId: dataAxisValue.draggedId,
            name: trendField?.columnDisplayName || '',
            type: dataAxisValue.type,
            smooth: dataAxisValue.smooth,
            step: dataAxisValue.step,
            emphasis: {
              focus: 'series',
              itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' },
            },
            label: dataAxisValue.label || {},
            lineStyle: dataAxisValue.lineStyle,
            barGap: dataAxisValue.barGap,
            color: dataAxisValue.color,
            barWidth: dataAxisValue.barWidth,
            symbolSize: dataAxisValue.symbolSize,
            showSymbol: dataAxisValue.showSymbol,
            areaStyle: null,
            xAxisIndex: labelIdx,
            yAxisIndex: dataIndex,
            labelLine: { show: true },
            data: axisData,
          };

          if (dataAxisValue.filled) {
            serie.areaStyle = { opacity: dataAxisValue.areaGradient ? 0.5 : 1 };
          }
          if (dataAxisValue.stacked) {
            serie.stack = 'total';
          }

          seriesArray.push(serie);
          dataAxisValue.serieIndexes = [seriesArray.length - 1];
        } else {
          // Exploded
          const explodedField = generateResult.fieldsArray.find((f) => f.draggedId === dataAxisValue.explodeBy);
          if (!explodedField) continue;

          const dataQuery = `SELECT ${mainTable}.\`${explodedField.columnDisplayName}\` AS explode, ${labelCorrected}, ${dataCorrected} FROM (${generateResult.query}) AS ${mainTable} GROUP BY ${selectionColumn}, ${mainTable}.\`${explodedField.columnDisplayName}\` ORDER BY ${mainTable}.\`${explodedField.columnDisplayName}\`, ${selectionColumn}`;
          const dataResults = await legacyDataDb.query<Record<string, unknown>>(dataQuery);

          for (const row of dataResults) {
            explode.add(row['explode'] as string);
          }

          for (const explodeBy of explode) {
            const dataSet: Array<{ value: number }> = [];
            const explodedData = dataResults.filter((row) => row['explode'] === explodeBy);
            const labelAxisData = labelAxis['data'] as unknown[];

            for (const labelValue of labelAxisData) {
              const match = explodedData.find((row) => row[labelAxisName] === labelValue);
              dataSet.push({ value: !isUndefinedOrNull(match) ? (match[dataAxisName] as number) : 0 });
            }

            const serie: IBarSerie = {
              draggedId: dataAxisValue.draggedId,
              name: `${explodeBy} - ${trendField?.columnDisplayName}`,
              type: dataAxisValue.type,
              smooth: dataAxisValue.smooth,
              step: dataAxisValue.step,
              emphasis: {
                focus: 'series',
                itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' },
              },
              label: dataAxisValue.label || {},
              lineStyle: dataAxisValue.lineStyle,
              barGap: dataAxisValue.barGap,
              color: dataAxisValue.color,
              barWidth: dataAxisValue.barWidth,
              symbolSize: dataAxisValue.symbolSize,
              showSymbol: dataAxisValue.showSymbol,
              areaStyle: null,
              xAxisIndex: labelIdx,
              yAxisIndex: dataIndex,
              data: dataSet,
              labelLine: { show: true },
            };

            if (dataAxisValue.filled) {
              serie.areaStyle = { opacity: dataAxisValue.areaGradient ? 0.5 : 1 };
            }
            if (dataAxisValue.stacked) {
              serie.stack = 'total';
            }

            seriesArray.push(serie);
            if (dataAxisValue.serieIndexes) dataAxisValue.serieIndexes.push(seriesArray.length - 1);
          }
        }
      }
    }
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
  lib['xAxis'] = labelAxisArray;

  barLabelChanger(
    options.barLabel || '',
    seriesArray,
    true,
    options.barLabelBackgroundColor || '',
    options.barLabelRotation || 0,
  );

  return chartObject;
}
