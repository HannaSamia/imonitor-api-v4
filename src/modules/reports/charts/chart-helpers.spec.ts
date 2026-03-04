import {
  deepCopy,
  normalizeChartValue,
  numberFormatter,
  humanReadableLargeNumber,
  emptyReportChartByType,
  barLabelChanger,
  kpiCalculator,
  hotkeyTransform,
  isUndefinedOrNull,
  IBarSerie,
} from './chart-helpers';
import { ChartTypes, BarLabelValues } from '../enums';
import { IChartData, IFieldsArrayEntry } from '../dto/report-interfaces';
import { CustomColumnType, FieldFunctions } from '../services/query-builder.service';
import { BadRequestException } from '@nestjs/common';

// ─── deepCopy ────────────────────────────────────────────────────────────────

describe('deepCopy', () => {
  it('should deep copy a plain object', () => {
    const original = { a: 1, b: { c: 2 } };
    const copy = deepCopy(original);

    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.b).not.toBe(original.b);
  });

  it('should deep copy an array', () => {
    const original = [1, [2, 3], { a: 4 }];
    const copy = deepCopy(original);

    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy[1]).not.toBe(original[1]);
  });

  it('should return primitives as-is', () => {
    expect(deepCopy(42)).toBe(42);
    expect(deepCopy('hello')).toBe('hello');
    expect(deepCopy(null)).toBe(null);
    expect(deepCopy(undefined)).toBe(undefined);
    expect(deepCopy(true)).toBe(true);
  });
});

// ─── normalizeChartValue ──────────────────────────────────────────────────────

describe('normalizeChartValue', () => {
  it('should return value when below max', () => {
    expect(normalizeChartValue(100)).toBe(100);
  });

  it('should cap value at maxValue', () => {
    expect(normalizeChartValue(250)).toBe(200);
  });

  it('should use custom maxValue', () => {
    expect(normalizeChartValue(150, 100)).toBe(100);
  });

  it('should return exactly maxValue when equal', () => {
    expect(normalizeChartValue(200, 200)).toBe(200);
  });
});

// ─── numberFormatter ──────────────────────────────────────────────────────────

describe('numberFormatter', () => {
  it('should truncate to specified decimal places', () => {
    expect(numberFormatter(3.14159, FieldFunctions.truncate, 2)).toBe(3.14);
  });

  it('should round to specified decimal places', () => {
    expect(numberFormatter(3.14559, FieldFunctions.round, 2)).toBe(3.15);
  });

  it('should return number as-is for unknown type', () => {
    expect(numberFormatter(3.14, 'unknown', 2)).toBe(3.14);
  });

  it('should return number when fewer decimals than places', () => {
    expect(numberFormatter(3.1, FieldFunctions.truncate, 3)).toBe(3.1);
  });
});

// ─── humanReadableLargeNumber ─────────────────────────────────────────────────

describe('humanReadableLargeNumber', () => {
  it('should return number as-is below trillion', () => {
    expect(humanReadableLargeNumber(999999999999)).toBe('999999999999');
  });

  it('should format trillions', () => {
    expect(humanReadableLargeNumber(1.5e12)).toBe('1.50 trillion');
  });

  it('should format quadrillions', () => {
    expect(humanReadableLargeNumber(2.5e15)).toBe('2.50 quadrillion');
  });

  it('should handle negative numbers', () => {
    // Negative trillions: abs value >= 1e12, so it gets formatted
    const result = humanReadableLargeNumber(-1.5e12);
    expect(result).toBe('-1.50 trillion');
  });
});

// ─── emptyReportChartByType ───────────────────────────────────────────────────

describe('emptyReportChartByType', () => {
  it('should empty vertical bar chart series and xAxis', () => {
    const chart = {
      id: '1',
      name: 'Bar',
      type: ChartTypes.VERTICAL_BAR,
      orderIndex: 0,
      lib: { xAxis: [{ data: [1, 2, 3] }], series: [{ data: [1] }] },
    } as unknown as IChartData;

    const result = emptyReportChartByType(chart);

    expect((result as any).lib.series).toEqual([]);
    expect((result as any).lib.xAxis[0].data).toEqual([]);
  });

  it('should empty pie chart series data', () => {
    const chart = {
      id: '1',
      name: 'Pie',
      type: ChartTypes.PIE,
      orderIndex: 0,
      lib: { series: { data: [{ name: 'a', value: 1 }] } },
    } as unknown as IChartData;

    const result = emptyReportChartByType(chart);

    expect((result as any).lib.series.data).toEqual([]);
  });

  it('should empty exploded progress chart data', () => {
    const chart = {
      id: '1',
      name: 'EP',
      type: ChartTypes.EXPLODED_PROGRESS,
      orderIndex: 0,
      explodedData: [1, 2, 3],
    } as unknown as IChartData;

    const result = emptyReportChartByType(chart);

    expect((result as any).explodedData).toEqual([]);
  });

  it('should return chart as-is for unknown type', () => {
    const chart = {
      id: '1',
      name: 'Unknown',
      type: 'unknown',
      orderIndex: 0,
    } as IChartData;

    const result = emptyReportChartByType(chart);

    expect(result).toBe(chart);
  });
});

// ─── barLabelChanger ──────────────────────────────────────────────────────────

describe('barLabelChanger', () => {
  it('should hide labels for NONE', () => {
    const series: IBarSerie[] = [{ name: 's1', type: 'bar', data: [] }];

    barLabelChanger(BarLabelValues.NONE, series, true, '#fff');

    expect(series[0].label).toEqual({ show: false });
  });

  it('should show value labels for VALUE (vertical)', () => {
    const series: IBarSerie[] = [{ name: 's1', type: 'bar', data: [] }];

    barLabelChanger(BarLabelValues.VALUE, series, true, '#fff');

    expect(series[0].label).toEqual(expect.objectContaining({ show: true, formatter: '{c}', align: 'center' }));
  });

  it('should show value labels for VALUE (horizontal)', () => {
    const series: IBarSerie[] = [{ name: 's1', type: 'bar', data: [] }];

    barLabelChanger(BarLabelValues.VALUE, series, false, '#fff');

    expect(series[0].label).toEqual(expect.objectContaining({ show: true, formatter: '{c}', align: 'left' }));
  });

  it('should show serie_value labels with proper formatter', () => {
    const series: IBarSerie[] = [{ name: 's1', type: 'bar', data: [] }];

    barLabelChanger(BarLabelValues.SERIE_VALUE, series, true, '#fff');

    expect(series[0].label).toEqual(expect.objectContaining({ show: true, formatter: '{b}\n({c})' }));
  });
});

// ─── isUndefinedOrNull ──────────────────────────────────────────────────────

describe('isUndefinedOrNull', () => {
  it('should return true for null', () => {
    expect(isUndefinedOrNull(null)).toBe(true);
  });

  it('should return true for undefined', () => {
    expect(isUndefinedOrNull(undefined)).toBe(true);
  });

  it('should return false for zero', () => {
    expect(isUndefinedOrNull(0)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isUndefinedOrNull('')).toBe(false);
  });

  it('should return false for false', () => {
    expect(isUndefinedOrNull(false)).toBe(false);
  });

  it('should return false for objects', () => {
    expect(isUndefinedOrNull({})).toBe(false);
  });
});

// ─── kpiCalculator ──────────────────────────────────────────────────────────

describe('kpiCalculator', () => {
  const makeField = (overrides: Partial<IFieldsArrayEntry> = {}): IFieldsArrayEntry => ({
    type: 'number',
    draggedId: 'field-1',
    isCustomColumn: false,
    columnDisplayName: 'col1',
    ...overrides,
  });

  it('should return fallback when field is not found in fieldsArray', () => {
    const result = kpiCalculator(1, [], [], 'unknown-id', 'chartT', 'AS alias');
    expect(result).toBe('chartT.`unknown-id` AS alias');
  });

  it('should wrap regular numeric field with its operation', () => {
    const fields: IFieldsArrayEntry[] = [makeField({ operation: 'sum' })];
    const result = kpiCalculator(1, fields, [], 'field-1', 'chartT', 'AS col');
    expect(result).toBe('sum(chartT.`col1`) AS col');
  });

  it('should return field without operation when withOperation is false', () => {
    const fields: IFieldsArrayEntry[] = [makeField({ operation: 'sum' })];
    const result = kpiCalculator(1, fields, [], 'field-1', 'chartT', 'AS col', false);
    expect(result).toBe('chartT.`col1` AS col');
  });

  it('should handle OPERATION custom column by replacing table aliases', () => {
    const fields: IFieldsArrayEntry[] = [
      makeField({
        isCustomColumn: true,
        customColumnType: CustomColumnType.OPERATION,
        builtString: 't0.`a` + t1.`b`',
      }),
    ];
    const result = kpiCalculator(2, fields, [], 'field-1', 'chartT', 'AS res');
    expect(result).toBe('chartT.`a` + chartT.`b` AS res');
  });

  it('should replace CASE custom column builtStrings inside OPERATION column', () => {
    const caseField = makeField({
      draggedId: 'case-1',
      isCustomColumn: true,
      customColumnType: CustomColumnType.CASE,
      builtString: 'CASE WHEN x THEN 1 END',
      columnDisplayName: 'caseCol',
    });
    const opField = makeField({
      draggedId: 'op-1',
      isCustomColumn: true,
      customColumnType: CustomColumnType.OPERATION,
      builtString: 'CASE WHEN x THEN 1 END + 10',
    });
    const fields = [caseField, opField];
    const result = kpiCalculator(1, fields, [], 'op-1', 'chartT', 'AS res');
    expect(result).toBe('sum(chartT.`caseCol`) + 10 AS res');
  });

  it('should replace COMPARE custom column builtStrings inside OPERATION column', () => {
    const compareField = makeField({
      draggedId: 'cmp-1',
      isCustomColumn: true,
      customColumnType: CustomColumnType.COMPARE,
      builtString: 'sum(t0.`val`)',
      operation: 'avg',
      columnDisplayName: 'cmpCol',
    });
    const opField = makeField({
      draggedId: 'op-1',
      isCustomColumn: true,
      customColumnType: CustomColumnType.OPERATION,
      builtString: 'sum(t0.`val`) * 2',
    });
    const fields = [compareField, opField];
    const result = kpiCalculator(1, fields, [], 'op-1', 'chartT', 'AS res');
    expect(result).toBe('avg(chartT.`cmpCol`) * 2 AS res');
  });

  it('should replace refTable alias in OPERATION columns', () => {
    const fields: IFieldsArrayEntry[] = [
      makeField({
        isCustomColumn: true,
        customColumnType: CustomColumnType.OPERATION,
        builtString: 'refTable.`x` + refTable.`y`',
      }),
    ];
    const result = kpiCalculator(0, fields, [], 'field-1', 'chartT', 'AS res');
    expect(result).toBe('chartT.`x` + chartT.`y` AS res');
  });

  it('should apply truncate when configured on operation column', () => {
    const fields: IFieldsArrayEntry[] = [
      makeField({
        isCustomColumn: true,
        customColumnType: CustomColumnType.OPERATION,
        builtString: 't0.`a`',
      }),
    ];
    const operationColumns = [
      {
        draggedId: 'field-1',
        trunc: true,
        trValue: 2,
      },
    ];
    const result = kpiCalculator(1, fields, operationColumns as any, 'field-1', 'chartT', 'AS res');
    expect(result).toContain('truncate(');
  });

  it('should apply round when configured on operation column', () => {
    const fields: IFieldsArrayEntry[] = [
      makeField({
        isCustomColumn: true,
        customColumnType: CustomColumnType.OPERATION,
        builtString: 't0.`a`',
      }),
    ];
    const operationColumns = [
      {
        draggedId: 'field-1',
        round: true,
        trValue: 3,
      },
    ];
    const result = kpiCalculator(1, fields, operationColumns as any, 'field-1', 'chartT', 'AS res');
    expect(result).toContain('round(');
  });
});

// ─── hotkeyTransform ────────────────────────────────────────────────────────

describe('hotkeyTransform', () => {
  const mockLegacyDataDb = {
    query: jest.fn(),
  };

  const mockDateHelper = {
    formatDate: jest.fn(),
    parseISO: jest.fn((d: string) => new Date(d)),
    subtractDurationFromDate: jest.fn(() => new Date('2026-01-01')),
  };

  const coreDbName = '`iMonitorV3_1`';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return undefined when input string is undefined', async () => {
    const result = await hotkeyTransform(undefined, {}, mockLegacyDataDb as any, mockDateHelper as any, coreDbName);
    expect(result).toBeUndefined();
  });

  it('should return empty string when input is empty string', async () => {
    mockLegacyDataDb.query.mockResolvedValue([]);
    const result = await hotkeyTransform('', {}, mockLegacyDataDb as any, mockDateHelper as any, coreDbName);
    expect(result).toBe('');
  });

  it('should replace object.fromDate hotkey with date value', async () => {
    mockLegacyDataDb.query.mockResolvedValue([{ confKey: '{{startDate}}', confVal: 'object.fromDate' }]);
    mockDateHelper.formatDate.mockReturnValue('2026-01-01');

    const result = await hotkeyTransform(
      'From {{startDate}} to end',
      { fromDate: '2026-01-01' },
      mockLegacyDataDb as any,
      mockDateHelper as any,
      coreDbName,
    );

    expect(result).toBe('From 2026-01-01 to end');
  });

  it('should replace moment hotkey with current date', async () => {
    mockLegacyDataDb.query.mockResolvedValue([{ confKey: '{{now}}', confVal: 'moment' }]);
    mockDateHelper.formatDate.mockReturnValue('2026-03-04 12:00:59');

    const result = await hotkeyTransform(
      'As of {{now}}',
      {},
      mockLegacyDataDb as any,
      mockDateHelper as any,
      coreDbName,
    );

    expect(result).toBe('As of 2026-03-04 12:00:59');
  });

  it('should replace moment-1 hotkey with yesterday date', async () => {
    mockLegacyDataDb.query.mockResolvedValue([{ confKey: '{{yesterday}}', confVal: 'moment-1' }]);
    mockDateHelper.formatDate.mockReturnValue('2026-03-03 23:59:59');

    const result = await hotkeyTransform(
      'Yesterday: {{yesterday}}',
      {},
      mockLegacyDataDb as any,
      mockDateHelper as any,
      coreDbName,
    );

    expect(result).toBe('Yesterday: 2026-03-03 23:59:59');
    expect(mockDateHelper.subtractDurationFromDate).toHaveBeenCalledWith({ days: 1 });
  });

  it('should not replace hotkey when date value is null', async () => {
    mockLegacyDataDb.query.mockResolvedValue([{ confKey: '{{startDate}}', confVal: 'object.fromDate' }]);

    const result = await hotkeyTransform(
      'From {{startDate}}',
      { fromDate: null },
      mockLegacyDataDb as any,
      mockDateHelper as any,
      coreDbName,
    );

    expect(result).toBe('From {{startDate}}');
  });

  it('should throw BadRequestException when DB query fails', async () => {
    mockLegacyDataDb.query.mockRejectedValue(new Error('DB error'));

    await expect(
      hotkeyTransform('test', {}, mockLegacyDataDb as any, mockDateHelper as any, coreDbName),
    ).rejects.toThrow(BadRequestException);
  });
});
