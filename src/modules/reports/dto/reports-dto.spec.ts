import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SaveReportDto } from './save-report.dto';
import { EditReportDto } from './edit-report.dto';
import { RenameReportDto } from './rename-report.dto';
import { ChangeReportOwnerDto } from './change-report-owner.dto';
import { ShareReportDto } from './share-report.dto';
import { GenerateReportDto } from './generate-report.dto';
import { GenerateChartByTypeDto } from './generate-chart-by-type.dto';
import { ExportReportParamsDto, ExportTabParamsDto } from './export-report-params.dto';
import { GenerateChartDto } from './generate-chart.dto';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDto<T extends object>(cls: new (...args: unknown[]) => T, partial: Partial<T>): T {
  return plainToInstance(cls, partial);
}

// ─── SaveReportDto ───────────────────────────────────────────────────────────

describe('SaveReportDto', () => {
  const VALID: Partial<SaveReportDto> = {
    name: 'Test Report',
    timeFilter: 'hourly',
    globalFilter: { condition: 'AND', rules: [] },
    options: { threshold: {}, isFooterAggregation: false, globalFieldIndex: 0 },
    fromDate: '2026-01-01',
    toDate: '2026-01-31',
    limit: 100,
    tables: [],
    orderBy: [],
    control: [],
    operation: [],
    compare: [],
    globalOrderIndex: 0,
    charts: [],
  };

  it('should pass with valid data', async () => {
    const errors = await validate(toDto(SaveReportDto, VALID));
    expect(errors).toHaveLength(0);
  });

  it('should fail when name is missing', async () => {
    const { name: _, ...rest } = VALID;
    const errors = await validate(toDto(SaveReportDto, rest));
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail when timeFilter is empty', async () => {
    const errors = await validate(toDto(SaveReportDto, { ...VALID, timeFilter: '' }));
    expect(errors.some((e) => e.property === 'timeFilter')).toBe(true);
  });

  it('should fail when limit is negative', async () => {
    const errors = await validate(toDto(SaveReportDto, { ...VALID, limit: -1 }));
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('should fail when tables is not an array', async () => {
    const errors = await validate(toDto(SaveReportDto, { ...VALID, tables: 'invalid' as any }));
    expect(errors.some((e) => e.property === 'tables')).toBe(true);
  });
});

// ─── EditReportDto ───────────────────────────────────────────────────────────

describe('EditReportDto', () => {
  const VALID: Partial<EditReportDto> = {
    id: 'report-1',
    name: 'Edited Report',
    ownerId: 'user-1',
    timeFilter: 'daily',
    globalFilter: { condition: 'AND', rules: [] },
    options: { threshold: {}, isFooterAggregation: false, globalFieldIndex: 0 },
    fromDate: '2026-01-01',
    toDate: '2026-01-31',
    limit: 50,
    tables: [],
    orderBy: [],
    control: [],
    operation: [],
    compare: [],
    charts: [],
    globalOrderIndex: 0,
    chartsStatus: {},
  };

  it('should pass with valid data', async () => {
    const errors = await validate(toDto(EditReportDto, VALID));
    expect(errors).toHaveLength(0);
  });

  it('should fail when id is missing', async () => {
    const { id: _, ...rest } = VALID;
    const errors = await validate(toDto(EditReportDto, rest));
    expect(errors.some((e) => e.property === 'id')).toBe(true);
  });

  it('should fail when chartsStatus is not an object', async () => {
    const errors = await validate(toDto(EditReportDto, { ...VALID, chartsStatus: 'invalid' as any }));
    expect(errors.some((e) => e.property === 'chartsStatus')).toBe(true);
  });
});

// ─── RenameReportDto ─────────────────────────────────────────────────────────

describe('RenameReportDto', () => {
  it('should pass with valid data', async () => {
    const errors = await validate(toDto(RenameReportDto, { reportId: 'r1', name: 'New Name' }));
    expect(errors).toHaveLength(0);
  });

  it('should fail when reportId is empty', async () => {
    const errors = await validate(toDto(RenameReportDto, { reportId: '', name: 'New Name' }));
    expect(errors.some((e) => e.property === 'reportId')).toBe(true);
  });

  it('should fail when name is missing', async () => {
    const errors = await validate(toDto(RenameReportDto, { reportId: 'r1' }));
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});

// ─── ChangeReportOwnerDto ────────────────────────────────────────────────────

describe('ChangeReportOwnerDto', () => {
  it('should pass with valid data', async () => {
    const errors = await validate(toDto(ChangeReportOwnerDto, { reportId: 'r1', newOwnerId: 'u2' }));
    expect(errors).toHaveLength(0);
  });

  it('should fail when newOwnerId is empty', async () => {
    const errors = await validate(toDto(ChangeReportOwnerDto, { reportId: 'r1', newOwnerId: '' }));
    expect(errors.some((e) => e.property === 'newOwnerId')).toBe(true);
  });
});

// ─── ShareReportDto ──────────────────────────────────────────────────────────

describe('ShareReportDto', () => {
  it('should pass with valid user IDs', async () => {
    const errors = await validate(toDto(ShareReportDto, { userIds: ['u1', 'u2'] }));
    expect(errors).toHaveLength(0);
  });

  it('should fail when userIds is empty', async () => {
    const errors = await validate(toDto(ShareReportDto, { userIds: [] }));
    expect(errors.some((e) => e.property === 'userIds')).toBe(true);
  });

  it('should fail when userIds is missing', async () => {
    const errors = await validate(toDto(ShareReportDto, {}));
    expect(errors.some((e) => e.property === 'userIds')).toBe(true);
  });
});

// ─── GenerateReportDto ───────────────────────────────────────────────────────

describe('GenerateReportDto', () => {
  const VALID: Partial<GenerateReportDto> = {
    fromDate: '2026-01-01',
    toDate: '2026-01-31',
    timeFilter: 'hourly',
    orderBy: [],
    globalFilter: { condition: 'AND', rules: [] },
    tables: [],
    compare: [],
    operation: [],
    control: [],
  };

  it('should pass with valid data', async () => {
    const errors = await validate(toDto(GenerateReportDto, VALID));
    expect(errors).toHaveLength(0);
  });

  it('should pass with optional limit', async () => {
    const errors = await validate(toDto(GenerateReportDto, { ...VALID, limit: 100 }));
    expect(errors).toHaveLength(0);
  });

  it('should fail when fromDate is missing', async () => {
    const { fromDate: _, ...rest } = VALID;
    const errors = await validate(toDto(GenerateReportDto, rest));
    expect(errors.some((e) => e.property === 'fromDate')).toBe(true);
  });

  it('should fail when tables is not an array', async () => {
    const errors = await validate(toDto(GenerateReportDto, { ...VALID, tables: 'bad' as any }));
    expect(errors.some((e) => e.property === 'tables')).toBe(true);
  });
});

// ─── GenerateChartDto ────────────────────────────────────────────────────────

describe('GenerateChartDto', () => {
  it('should pass with valid tabular and chart', async () => {
    const errors = await validate(
      toDto(GenerateChartDto, {
        tabular: {
          fromDate: '2026-01-01',
          toDate: '2026-01-31',
          timeFilter: 'hourly',
          orderBy: [],
          globalFilter: { condition: 'AND', rules: [] },
          tables: [],
          compare: [],
          operation: [],
          control: [],
        },
        chart: { id: 'c1', name: 'Pie', type: 'pie', orderIndex: 0 },
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('should fail when tabular is missing', async () => {
    const errors = await validate(
      toDto(GenerateChartDto, {
        chart: { id: 'c1', name: 'Pie', type: 'pie', orderIndex: 0 },
      }),
    );
    expect(errors.some((e) => e.property === 'tabular')).toBe(true);
  });
});

// ─── GenerateChartByTypeDto ──────────────────────────────────────────────────

describe('GenerateChartByTypeDto', () => {
  const VALID: Partial<GenerateChartByTypeDto> = {
    reportId: 'r1',
    chartId: 'c1',
    fromDate: '2026-01-01',
    toDate: '2026-01-31',
    interval: 'hourly',
  };

  it('should pass with valid data', async () => {
    const errors = await validate(toDto(GenerateChartByTypeDto, VALID));
    expect(errors).toHaveLength(0);
  });

  it('should fail when reportId is missing', async () => {
    const { reportId: _, ...rest } = VALID;
    const errors = await validate(toDto(GenerateChartByTypeDto, rest));
    expect(errors.some((e) => e.property === 'reportId')).toBe(true);
  });

  it('should fail when interval is empty', async () => {
    const errors = await validate(toDto(GenerateChartByTypeDto, { ...VALID, interval: '' }));
    expect(errors.some((e) => e.property === 'interval')).toBe(true);
  });
});

// ─── ExportReportParamsDto ───────────────────────────────────────────────────

describe('ExportReportParamsDto', () => {
  const VALID: Partial<ExportReportParamsDto> = {
    reportId: 'r1',
    status: 'active',
    fromdate: '2026-01-01',
    todate: '2026-01-31',
    interval: 'hourly',
  };

  it('should pass with valid data', async () => {
    const errors = await validate(toDto(ExportReportParamsDto, VALID));
    expect(errors).toHaveLength(0);
  });

  it('should fail when reportId is missing', async () => {
    const { reportId: _, ...rest } = VALID;
    const errors = await validate(toDto(ExportReportParamsDto, rest));
    expect(errors.some((e) => e.property === 'reportId')).toBe(true);
  });
});

// ─── ExportTabParamsDto ──────────────────────────────────────────────────────

describe('ExportTabParamsDto', () => {
  const VALID: Partial<ExportTabParamsDto> = {
    reportId: 'r1',
    status: 'active',
    chartId: 'c1',
    fromdate: '2026-01-01',
    todate: '2026-01-31',
    interval: 'hourly',
  };

  it('should pass with valid data', async () => {
    const errors = await validate(toDto(ExportTabParamsDto, VALID));
    expect(errors).toHaveLength(0);
  });

  it('should fail when chartId is missing', async () => {
    const { chartId: _, ...rest } = VALID;
    const errors = await validate(toDto(ExportTabParamsDto, rest));
    expect(errors.some((e) => e.property === 'chartId')).toBe(true);
  });
});
