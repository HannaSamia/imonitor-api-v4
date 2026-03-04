import {
  deepCopy,
  normalizeChartValue,
  numberFormatter,
  humanReadableLargeNumber,
  emptyReportChartByType,
  barLabelChanger,
  IBarSerie,
} from './chart-helpers';
import { ChartTypes, BarLabelValues } from '../enums';
import { IChartData } from '../dto/report-interfaces';
import { FieldFunctions } from '../services/query-builder.service';

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
