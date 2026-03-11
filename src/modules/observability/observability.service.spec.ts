import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ObservabilityService } from './observability.service';
import { ObservabilityUtilService } from './services/observability-util.service';
import { ObservabilityQueryService } from './services/observability-query.service';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { CoreObservabilityMetrics } from '../../database/entities/core-observability-metrics.entity';
import { CoreObservabilityMetricsModule } from '../../database/entities/core-observability-metrics-module.entity';
import { CoreObservabilityMetricsUsedTables } from '../../database/entities/core-observability-metrics-used-tables.entity';
import { CoreObservabilityMetricsFilters } from '../../database/entities/core-observability-metrics-filters.entity';
import { CoreObservabilityMetricsThresholds } from '../../database/entities/core-observability-metrics-thresholds.entity';
import { CoreObservabilityMetricsAlerts } from '../../database/entities/core-observability-metrics-alerts.entity';
import { CoreObservabilityMetricsTypes } from '../../database/entities/core-observability-metrics-types.entity';
import { CoreObservabilityCharts } from '../../database/entities/core-observability-charts.entity';
import { CoreObservabilityMetricCharts } from '../../database/entities/core-observability-metric-charts.entity';
import { CoreObservabilityDashboard } from '../../database/entities/core-observability-dashboard.entity';
import { CoreObservabilityDashboardCharts } from '../../database/entities/core-observability-dashboard-charts.entity';
import { CoreObservabilityDashboardError } from '../../database/entities/core-observability-dashboard-error.entity';
import { CoreObservabilityNotificationSent } from '../../database/entities/core-observability-notification-sent.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { MetricChartFilters, ObservabilityThresholdStatus } from '../../shared/enums/observability.enum';

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockRepo() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockResolvedValue({}),
    insert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false),
    }),
  };
}

const mockManager = {
  save: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
  insert: jest.fn().mockResolvedValue({}),
};

const mockDataSource = {
  query: jest.fn(),
  transaction: jest
    .fn()
    .mockImplementation(async (cb: (manager: typeof mockManager) => Promise<void>) => cb(mockManager)),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'DB_CORE_NAME') return 'iMonitorV3_1';
    if (key === 'DB_DATA_NAME') return 'iMonitorData';
    return null;
  }),
};

const mockLegacyDataDb = {
  query: jest.fn(),
};

const mockDateHelper = {
  formatDate: jest.fn().mockReturnValue('2026-03-11 12:00:00'),
};

const mockSystemConfig = {
  get: jest.fn(),
};

const mockUtilService = {
  fetchMetricField: jest.fn(),
  fetchExplodedField: jest.fn(),
  fetchThresholdData: jest.fn(),
  getIconForAlarmType: jest.fn(),
};

const mockQueryService = {
  generateObservability: jest.fn(),
};

// ─── Test Data ───────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-001';
const TEST_METRIC_ID = 'metric-001';
const TEST_CHART_ID = 'chart-001';
const TEST_DASHBOARD_ID = 'dash-001';

const sampleMetric = {
  id: TEST_METRIC_ID,
  name: 'Test Metric',
  ownerId: TEST_USER_ID,
  isFavorite: 0,
  isExploded: 0,
  limit: null,
  chartsPerRow: null,
  type: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  tables: JSON.stringify([
    { id: 'tbl-1', fields: [{ columnName: 'value', isMetric: true, columnDisplayName: 'Value' }] },
  ]),
  globalFilter: null,
  orderBy: null,
  control: null,
  compare: null,
  operation: null,
  options: null,
  nodeIds: JSON.stringify(['node-1']),
  metricField: JSON.stringify({ columnName: 'value', isMetric: true, columnDisplayName: 'Value' }),
  explodedField: null,
  metricQuery: null,
};

const sampleChart = {
  id: TEST_CHART_ID,
  name: 'Test Chart',
  type: 'vertical_status_panel',
  data: JSON.stringify({ metrics: [] }),
  isFavorite: 0,
  isConnectivity: 0,
  nodeIds: null,
  createdAt: new Date(),
  createdBy: TEST_USER_ID,
};

const sampleDashboard = {
  id: TEST_DASHBOARD_ID,
  name: 'Test Dashboard',
  ownerId: TEST_USER_ID,
  isFavorite: 0,
  title: null,
  createdAt: new Date(),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('ObservabilityService', () => {
  let service: ObservabilityService;
  let metricsRepo: ReturnType<typeof createMockRepo>;
  let metricsModuleRepo: ReturnType<typeof createMockRepo>;
  let metricsUsedTablesRepo: ReturnType<typeof createMockRepo>;
  let metricsFiltersRepo: ReturnType<typeof createMockRepo>;
  let metricsThresholdsRepo: ReturnType<typeof createMockRepo>;
  let metricsAlertsRepo: ReturnType<typeof createMockRepo>;
  let metricsTypesRepo: ReturnType<typeof createMockRepo>;
  let chartsRepo: ReturnType<typeof createMockRepo>;
  let metricChartsRepo: ReturnType<typeof createMockRepo>;
  let dashboardRepo: ReturnType<typeof createMockRepo>;
  let dashboardChartsRepo: ReturnType<typeof createMockRepo>;
  let dashboardErrorRepo: ReturnType<typeof createMockRepo>;
  let notificationSentRepo: ReturnType<typeof createMockRepo>;
  let modulesRepo: ReturnType<typeof createMockRepo>;
  let modulesTablesRepo: ReturnType<typeof createMockRepo>;

  beforeEach(async () => {
    metricsRepo = createMockRepo();
    metricsModuleRepo = createMockRepo();
    metricsUsedTablesRepo = createMockRepo();
    metricsFiltersRepo = createMockRepo();
    metricsThresholdsRepo = createMockRepo();
    metricsAlertsRepo = createMockRepo();
    metricsTypesRepo = createMockRepo();
    chartsRepo = createMockRepo();
    metricChartsRepo = createMockRepo();
    dashboardRepo = createMockRepo();
    dashboardChartsRepo = createMockRepo();
    dashboardErrorRepo = createMockRepo();
    notificationSentRepo = createMockRepo();
    modulesRepo = createMockRepo();
    modulesTablesRepo = createMockRepo();

    jest.clearAllMocks();

    // Re-wire transaction mock after clearAllMocks
    mockDataSource.transaction.mockImplementation(async (cb: (manager: typeof mockManager) => Promise<void>) =>
      cb(mockManager),
    );
    mockManager.save.mockResolvedValue({});
    mockManager.update.mockResolvedValue({});
    mockManager.delete.mockResolvedValue({});
    mockManager.insert.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservabilityService,
        { provide: getRepositoryToken(CoreObservabilityMetrics), useValue: metricsRepo },
        { provide: getRepositoryToken(CoreObservabilityMetricsModule), useValue: metricsModuleRepo },
        { provide: getRepositoryToken(CoreObservabilityMetricsUsedTables), useValue: metricsUsedTablesRepo },
        { provide: getRepositoryToken(CoreObservabilityMetricsFilters), useValue: metricsFiltersRepo },
        { provide: getRepositoryToken(CoreObservabilityMetricsThresholds), useValue: metricsThresholdsRepo },
        { provide: getRepositoryToken(CoreObservabilityMetricsAlerts), useValue: metricsAlertsRepo },
        { provide: getRepositoryToken(CoreObservabilityMetricsTypes), useValue: metricsTypesRepo },
        { provide: getRepositoryToken(CoreObservabilityCharts), useValue: chartsRepo },
        { provide: getRepositoryToken(CoreObservabilityMetricCharts), useValue: metricChartsRepo },
        { provide: getRepositoryToken(CoreObservabilityDashboard), useValue: dashboardRepo },
        { provide: getRepositoryToken(CoreObservabilityDashboardCharts), useValue: dashboardChartsRepo },
        { provide: getRepositoryToken(CoreObservabilityDashboardError), useValue: dashboardErrorRepo },
        { provide: getRepositoryToken(CoreObservabilityNotificationSent), useValue: notificationSentRepo },
        { provide: getRepositoryToken(CoreModules), useValue: modulesRepo },
        { provide: getRepositoryToken(CoreModulesTables), useValue: modulesTablesRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LegacyDataDbService, useValue: mockLegacyDataDb },
        { provide: DateHelperService, useValue: mockDateHelper },
        { provide: SystemConfigService, useValue: mockSystemConfig },
        { provide: ObservabilityUtilService, useValue: mockUtilService },
        { provide: ObservabilityQueryService, useValue: mockQueryService },
      ],
    }).compile();

    service = module.get<ObservabilityService>(ObservabilityService);
  });

  // ─── fetchNodes() ─────────────────────────────────────────────────────────

  describe('fetchNodes()', () => {
    it('should return module nodes via TypeORM repo where isNode=true', async () => {
      const nodes = [{ id: 'node-1', name: 'SDP Node' }];
      modulesRepo.find.mockResolvedValue(nodes);

      const result = await service.fetchNodes();

      expect(result).toEqual([{ id: 'node-1', name: 'SDP Node' }]);
      expect(modulesRepo.find).toHaveBeenCalledWith({
        where: { isNode: true },
        select: { id: true, name: true },
      });
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  // ─── fetchFieldsByNode() ──────────────────────────────────────────────────

  describe('fetchFieldsByNode()', () => {
    it('should return empty result when no IDs provided', async () => {
      const result = await service.fetchFieldsByNode([]);

      expect(result).toEqual({ refTable: null, tables: [] });
      expect(modulesTablesRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query tables by module IDs via TypeORM QueryBuilder', async () => {
      const entities = [{ id: 'tbl-1', displayName: 'Stats Table' }];
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(entities),
      };
      modulesTablesRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.fetchFieldsByNode([1, 2]);

      expect(result).toEqual({ tables: [{ id: 'tbl-1', displayName: 'Stats Table' }] });
      expect(modulesTablesRepo.createQueryBuilder).toHaveBeenCalledWith('mt');
      expect(mockQb.where).toHaveBeenCalledWith('mt.tableType = :type', { type: 'statistics' });
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  // ─── getMetricsByNodeIds() ────────────────────────────────────────────────

  describe('getMetricsByNodeIds()', () => {
    it('should return empty array when nodeIds is empty', async () => {
      const result = await service.getMetricsByNodeIds({ nodeIds: [] });

      expect(result).toEqual([]);
      expect(metricsRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query metrics by nodeIds via TypeORM QueryBuilder', async () => {
      const entities = [{ id: TEST_METRIC_ID, name: 'Test Metric' }];
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(entities),
      };
      metricsRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getMetricsByNodeIds({ nodeIds: ['node-1', 'node-2'] });

      expect(result).toEqual([{ id: TEST_METRIC_ID, name: 'Test Metric' }]);
      expect(metricsRepo.createQueryBuilder).toHaveBeenCalledWith('m');
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  // ─── listMetrics() ────────────────────────────────────────────────────────

  describe('listMetrics()', () => {
    it('should return list of metrics from raw query', async () => {
      const rows = [{ id: TEST_METRIC_ID, name: 'Metric 1', ownerId: TEST_USER_ID, isFavorite: 0 }];
      mockDataSource.query.mockResolvedValue(rows);

      const result = await service.listMetrics();

      expect(result).toEqual(rows);
      expect(mockDataSource.query).toHaveBeenCalledWith(expect.stringContaining('core_observability_metrics'));
    });
  });

  // ─── listMetricsForCharts() ───────────────────────────────────────────────

  describe('listMetricsForCharts()', () => {
    it('should return all metrics when filter is ALL', async () => {
      const rows = [{ id: TEST_METRIC_ID, name: 'Metric 1', isExploded: 0 }];
      mockDataSource.query.mockResolvedValue(rows);

      const result = await service.listMetricsForCharts(MetricChartFilters.ALL);

      expect(result).toEqual(rows);
      const callArg = mockDataSource.query.mock.calls[0][0] as string;
      expect(callArg).not.toContain('WHERE');
    });

    it('should filter for exploded metrics when filter is EXPLODED', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.listMetricsForCharts(MetricChartFilters.EXPLODED);

      const callArg = mockDataSource.query.mock.calls[0][0] as string;
      expect(callArg).toContain('isExploded = 1');
    });

    it('should filter for normal metrics when filter is NORMAL', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.listMetricsForCharts(MetricChartFilters.NORMAL);

      const callArg = mockDataSource.query.mock.calls[0][0] as string;
      expect(callArg).toContain('isExploded = 0');
    });
  });

  // ─── getMetricById() ─────────────────────────────────────────────────────

  describe('getMetricById()', () => {
    it('should return parsed metric by ID', async () => {
      metricsRepo.findOne.mockResolvedValue(sampleMetric);
      metricsFiltersRepo.find.mockResolvedValue([]);
      metricsAlertsRepo.find.mockResolvedValue([]);

      const result = (await service.getMetricById(TEST_METRIC_ID)) as Record<string, unknown>;

      expect(result.id).toBe(TEST_METRIC_ID);
      expect(result.name).toBe('Test Metric');
      expect(metricsRepo.findOne).toHaveBeenCalledWith({ where: { id: TEST_METRIC_ID } });
    });

    it('should throw NotFoundException when metric does not exist', async () => {
      metricsRepo.findOne.mockResolvedValue(null);

      await expect(service.getMetricById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should include threshold and alarms in the result', async () => {
      metricsRepo.findOne.mockResolvedValue(sampleMetric);
      metricsFiltersRepo.find.mockResolvedValue([]);
      metricsAlertsRepo.find.mockResolvedValue([]);

      const result = (await service.getMetricById(TEST_METRIC_ID)) as Record<string, unknown>;

      expect(result).toHaveProperty('threshold');
      expect(result).toHaveProperty('alarms');
    });
  });

  // ─── saveMetric() ────────────────────────────────────────────────────────

  describe('saveMetric()', () => {
    const saveDto = {
      name: 'New Metric',
      tables: [{ id: 'tbl-1', fields: [{ columnName: 'val', isMetric: true }] }],
      nodeIds: ['node-1'],
      isExploded: false,
    } as any;

    it('should save a new metric and return its ID', async () => {
      mockUtilService.fetchMetricField.mockReturnValue({ columnName: 'val', isMetric: true });
      mockUtilService.fetchExplodedField.mockReturnValue(null);
      mockQueryService.generateObservability.mockResolvedValue({ query: 'SELECT 1', header: [] });

      const result = await service.saveMetric(saveDto, TEST_USER_ID);

      expect(typeof result).toBe('string');
      expect(result).toHaveLength(36); // UUID format
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when no metric field is found', async () => {
      mockUtilService.fetchMetricField.mockReturnValue(null);

      await expect(service.saveMetric(saveDto, TEST_USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('should handle query generation failure gracefully', async () => {
      mockUtilService.fetchMetricField.mockReturnValue({ columnName: 'val', isMetric: true });
      mockUtilService.fetchExplodedField.mockReturnValue(null);
      mockQueryService.generateObservability.mockRejectedValue(new Error('Query gen failed'));

      // Should still succeed despite query gen error
      const result = await service.saveMetric(saveDto, TEST_USER_ID);

      expect(typeof result).toBe('string');
    });

    it('should throw BadRequestException when transaction fails', async () => {
      mockUtilService.fetchMetricField.mockReturnValue({ columnName: 'val', isMetric: true });
      mockUtilService.fetchExplodedField.mockReturnValue(null);
      mockQueryService.generateObservability.mockResolvedValue({ query: 'SELECT 1', header: [] });
      mockDataSource.transaction.mockRejectedValue(new Error('DB error'));

      await expect(service.saveMetric(saveDto, TEST_USER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateMetric() ───────────────────────────────────────────────────────

  describe('updateMetric()', () => {
    const updateDto = {
      id: TEST_METRIC_ID,
      name: 'Updated Metric',
      tables: [{ id: 'tbl-1', fields: [{ columnName: 'val', isMetric: true }] }],
      nodeIds: ['node-1'],
      isExploded: false,
    } as any;

    it('should update existing metric successfully', async () => {
      metricsRepo.findOne.mockResolvedValue({ ...sampleMetric });
      metricChartsRepo.count.mockResolvedValue(0);
      mockUtilService.fetchMetricField.mockReturnValue({ columnName: 'val', isMetric: true });
      mockUtilService.fetchExplodedField.mockReturnValue(null);
      mockQueryService.generateObservability.mockResolvedValue({ query: 'SELECT 1', header: [] });

      await expect(service.updateMetric(TEST_USER_ID, updateDto)).resolves.toBeUndefined();

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when metric does not exist', async () => {
      metricsRepo.findOne.mockResolvedValue(null);

      await expect(service.updateMetric(TEST_USER_ID, updateDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-owner attempts to update metric', async () => {
      metricsRepo.findOne.mockResolvedValue({ ...sampleMetric, ownerId: 'other-user-id' });

      await expect(service.updateMetric(TEST_USER_ID, updateDto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when exploded status changed with existing charts', async () => {
      metricsRepo.findOne.mockResolvedValue({ ...sampleMetric, isExploded: 0 });
      metricChartsRepo.count.mockResolvedValue(3);

      const dtoWithExplodedChange = { ...updateDto, isExploded: true };

      await expect(service.updateMetric(TEST_USER_ID, dtoWithExplodedChange)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no metric field is found', async () => {
      metricsRepo.findOne.mockResolvedValue({ ...sampleMetric });
      metricChartsRepo.count.mockResolvedValue(0);
      mockUtilService.fetchMetricField.mockReturnValue(null);

      await expect(service.updateMetric(TEST_USER_ID, updateDto)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── favorite() (metric) ─────────────────────────────────────────────────

  describe('favorite() [metric]', () => {
    it('should toggle metric favorite from false to true', async () => {
      metricsRepo.findOne.mockResolvedValue({ id: TEST_METRIC_ID, isFavorite: 0 });
      metricsRepo.update.mockResolvedValue({});

      const result = await service.favorite(TEST_METRIC_ID);

      expect(result).toBe(true);
      expect(metricsRepo.update).toHaveBeenCalledWith({ id: TEST_METRIC_ID }, { isFavorite: 1 });
    });

    it('should toggle metric favorite from true to false', async () => {
      metricsRepo.findOne.mockResolvedValue({ id: TEST_METRIC_ID, isFavorite: 1 });
      metricsRepo.update.mockResolvedValue({});

      const result = await service.favorite(TEST_METRIC_ID);

      expect(result).toBe(false);
      expect(metricsRepo.update).toHaveBeenCalledWith({ id: TEST_METRIC_ID }, { isFavorite: 0 });
    });

    it('should throw NotFoundException when metric does not exist', async () => {
      metricsRepo.findOne.mockResolvedValue(null);

      await expect(service.favorite('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── goToReport() ─────────────────────────────────────────────────────────

  describe('goToReport()', () => {
    it('should return parsed report fields from metric', async () => {
      metricsRepo.findOne.mockResolvedValue(sampleMetric);

      const result = (await service.goToReport(TEST_METRIC_ID)) as unknown as Record<string, unknown>;

      expect(result).toHaveProperty('tables');
      expect(result).toHaveProperty('globalFilter');
      expect(result).toHaveProperty('orderBy');
      expect(result).toHaveProperty('options');
      expect(result).toHaveProperty('control');
      expect(result).toHaveProperty('compare');
      expect(result).toHaveProperty('operation');
      expect(metricsRepo.findOne).toHaveBeenCalledWith({ where: { id: TEST_METRIC_ID } });
    });

    it('should throw NotFoundException when metric does not exist', async () => {
      metricsRepo.findOne.mockResolvedValue(null);

      await expect(service.goToReport('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── executeQuery() ───────────────────────────────────────────────────────

  describe('executeQuery()', () => {
    const tabularObject = {
      tables: [{ id: 'tbl-1' }],
      fromDate: '2026-01-01',
      toDate: '2026-03-11',
      timeFrame: 'current',
    } as any;

    it('should execute query and return header and body', async () => {
      mockQueryService.generateObservability.mockResolvedValue({
        query: 'SELECT * FROM stats',
        header: ['Col1', 'Col2'],
      });
      mockLegacyDataDb.query.mockResolvedValue([{ Col1: 'a', Col2: 'b' }]);

      const result = await service.executeQuery(tabularObject);

      expect(result.header).toEqual(['Col1', 'Col2']);
      expect(result.body).toHaveLength(1);
      expect(mockLegacyDataDb.query).toHaveBeenCalledWith('SELECT * FROM stats');
    });

    it('should return empty header and body when query is empty', async () => {
      mockQueryService.generateObservability.mockResolvedValue({ query: '', header: [] });

      const result = await service.executeQuery(tabularObject);

      expect(result).toEqual({ header: [], body: [] });
      expect(mockLegacyDataDb.query).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when legacy DB query fails', async () => {
      mockQueryService.generateObservability.mockResolvedValue({
        query: 'SELECT * FROM stats',
        header: [],
      });
      mockLegacyDataDb.query.mockRejectedValue(new Error('DB error'));

      await expect(service.executeQuery(tabularObject)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── executeMetricQuery() ─────────────────────────────────────────────────

  describe('executeMetricQuery()', () => {
    const baseTabularObject = {
      tables: [{ fields: [{ columnDisplayName: 'Value', isMetric: true }] }],
      isExploded: false,
      metricId: TEST_METRIC_ID,
      fromDate: '2026-01-01',
      toDate: '2026-03-11',
      timeFrame: 'current' as const,
    } as any;

    it('should return summed metric value with threshold color for non-exploded metric', async () => {
      mockQueryService.generateObservability.mockResolvedValue({
        query: 'SELECT 1',
        header: ['Value'],
      });
      mockLegacyDataDb.query.mockResolvedValue([{ Value: 10 }, { Value: 5 }]);
      mockUtilService.fetchMetricField.mockReturnValue({ columnDisplayName: 'Value', isMetric: true });
      metricsRepo.findOne.mockResolvedValue(sampleMetric);
      metricsFiltersRepo.find.mockResolvedValue([]);
      mockUtilService.fetchThresholdData.mockReturnValue({ color: '#dc3545', type: 'critical' });

      const result = (await service.executeMetricQuery(baseTabularObject)) as Record<string, unknown>;

      expect(result.metricValue).toBe(15);
      expect(result.color).toBe('#dc3545');
    });

    it('should return default green color when no threshold configured', async () => {
      mockQueryService.generateObservability.mockResolvedValue({
        query: 'SELECT 1',
        header: ['Value'],
      });
      mockLegacyDataDb.query.mockResolvedValue([{ Value: 5 }]);
      mockUtilService.fetchMetricField.mockReturnValue({ columnDisplayName: 'Value', isMetric: true });
      metricsRepo.findOne.mockResolvedValue(null);

      const result = (await service.executeMetricQuery({ ...baseTabularObject, metricId: undefined })) as Record<
        string,
        unknown
      >;

      expect(result.color).toBe('#28a745');
    });

    it('should return grouped data for exploded metric', async () => {
      mockQueryService.generateObservability.mockResolvedValue({
        query: 'SELECT 1',
        header: ['Node', 'Value'],
      });
      mockLegacyDataDb.query.mockResolvedValue([
        { Node: 'NodeA', Value: 10 },
        { Node: 'NodeB', Value: 20 },
        { Node: 'NodeA', Value: 5 },
      ]);
      mockUtilService.fetchExplodedField.mockReturnValue({ columnDisplayName: 'Node', isExplodedBy: true });
      mockUtilService.fetchMetricField.mockReturnValue({ columnDisplayName: 'Value', isMetric: true });

      const explodedObject = { ...baseTabularObject, isExploded: true };
      const result = (await service.executeMetricQuery(explodedObject)) as Record<string, unknown>;

      expect(result).toHaveProperty('data');
      const data = result.data as Array<{ name: string; value: number }>;
      const nodeA = data.find((d) => d.name === 'NodeA');
      expect(nodeA?.value).toBe(15);
    });

    it('should throw BadRequestException when generate returns empty query', async () => {
      mockQueryService.generateObservability.mockResolvedValue({ query: '', header: [] });

      await expect(service.executeMetricQuery(baseTabularObject)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── saveChart() ─────────────────────────────────────────────────────────

  describe('saveChart()', () => {
    const saveChartDto = {
      name: 'New Chart',
      type: 'vertical_status_panel',
      data: { metrics: [] },
      isConnectivity: false,
    } as any;

    it('should save a new chart and return its ID', async () => {
      const result = await service.saveChart(saveChartDto, TEST_USER_ID);

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when transaction fails', async () => {
      mockDataSource.transaction.mockRejectedValue(new Error('DB failure'));

      await expect(service.saveChart(saveChartDto, TEST_USER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── listCharts() ─────────────────────────────────────────────────────────

  describe('listCharts()', () => {
    it('should return list of charts from raw query', async () => {
      const rows = [{ id: TEST_CHART_ID, name: 'Chart 1', type: 'vertical_status_panel', isFavorite: 0 }];
      mockDataSource.query.mockResolvedValue(rows);

      const result = await service.listCharts();

      expect(result).toEqual(rows);
      expect(mockDataSource.query).toHaveBeenCalledWith(expect.stringContaining('core_observability_charts'));
    });
  });

  // ─── getChartById() ───────────────────────────────────────────────────────

  describe('getChartById()', () => {
    it('should return parsed chart by ID', async () => {
      chartsRepo.findOne.mockResolvedValue(sampleChart);

      const result = (await service.getChartById(TEST_CHART_ID)) as Record<string, unknown>;

      expect(result.id).toBe(TEST_CHART_ID);
      expect(result.name).toBe('Test Chart');
      expect(chartsRepo.findOne).toHaveBeenCalledWith({ where: { id: TEST_CHART_ID } });
    });

    it('should throw NotFoundException when chart does not exist', async () => {
      chartsRepo.findOne.mockResolvedValue(null);

      await expect(service.getChartById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateChart() ────────────────────────────────────────────────────────

  describe('updateChart()', () => {
    const updateChartDto = {
      id: TEST_CHART_ID,
      name: 'Updated Chart',
      type: 'vertical_status_panel',
      data: { metrics: [] },
    } as any;

    it('should update existing chart and return its ID', async () => {
      chartsRepo.findOne.mockResolvedValue(sampleChart);

      const result = await service.updateChart(updateChartDto, TEST_USER_ID);

      expect(result).toBe(TEST_CHART_ID);
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.update).toHaveBeenCalled();
      expect(mockManager.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when chart does not exist', async () => {
      chartsRepo.findOne.mockResolvedValue(null);

      await expect(service.updateChart(updateChartDto, TEST_USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── favoriteChart() ──────────────────────────────────────────────────────

  describe('favoriteChart()', () => {
    it('should toggle chart favorite from false to true', async () => {
      chartsRepo.findOne.mockResolvedValue({ id: TEST_CHART_ID, isFavorite: 0 });
      chartsRepo.update.mockResolvedValue({});

      const result = await service.favoriteChart(TEST_CHART_ID);

      expect(result).toBe(true);
      expect(chartsRepo.update).toHaveBeenCalledWith({ id: TEST_CHART_ID }, { isFavorite: 1 });
    });

    it('should toggle chart favorite from true to false', async () => {
      chartsRepo.findOne.mockResolvedValue({ id: TEST_CHART_ID, isFavorite: 1 });
      chartsRepo.update.mockResolvedValue({});

      const result = await service.favoriteChart(TEST_CHART_ID);

      expect(result).toBe(false);
      expect(chartsRepo.update).toHaveBeenCalledWith({ id: TEST_CHART_ID }, { isFavorite: 0 });
    });

    it('should throw NotFoundException when chart does not exist', async () => {
      chartsRepo.findOne.mockResolvedValue(null);

      await expect(service.favoriteChart('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── saveDashboard() ──────────────────────────────────────────────────────

  describe('saveDashboard()', () => {
    const saveDashboardDto = {
      name: 'New Dashboard',
      charts: [{ chartId: TEST_CHART_ID, cols: 6, rows: 4, x: 0, y: 0, isTitle: false }],
    } as any;

    it('should save a new dashboard and return its ID', async () => {
      const result = await service.saveDashboard(saveDashboardDto, TEST_USER_ID);

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalled();
      expect(mockManager.insert).toHaveBeenCalled();
    });

    it('should handle title charts separately and not insert them as chart associations', async () => {
      const dtoWithTitle = {
        name: 'Dashboard With Title',
        charts: [
          { chartId: '', cols: 12, rows: 1, x: 0, y: 0, isTitle: true, value: 'My Title' },
          { chartId: TEST_CHART_ID, cols: 6, rows: 4, x: 0, y: 1, isTitle: false },
        ],
      } as any;

      await service.saveDashboard(dtoWithTitle, TEST_USER_ID);

      // insert should be called once for the actual chart (not the title)
      expect(mockManager.insert).toHaveBeenCalledTimes(1);
    });

    it('should not call insert when all charts are title placeholders', async () => {
      const titleOnlyDto = {
        name: 'Title Only',
        charts: [{ chartId: '', cols: 12, rows: 1, x: 0, y: 0, isTitle: true, value: 'Title' }],
      } as any;

      await service.saveDashboard(titleOnlyDto, TEST_USER_ID);

      expect(mockManager.insert).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when transaction fails', async () => {
      mockDataSource.transaction.mockRejectedValue(new Error('DB failure'));

      await expect(service.saveDashboard(saveDashboardDto, TEST_USER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── listDashboards() ─────────────────────────────────────────────────────

  describe('listDashboards()', () => {
    it('should return list of dashboards from raw query', async () => {
      const rows = [{ id: TEST_DASHBOARD_ID, name: 'Dashboard 1', ownerId: TEST_USER_ID, isFavorite: 0 }];
      mockDataSource.query.mockResolvedValue(rows);

      const result = await service.listDashboards();

      expect(result).toEqual(rows);
      expect(mockDataSource.query).toHaveBeenCalledWith(expect.stringContaining('core_observability_dashboard'));
    });
  });

  // ─── getDashboardById() ───────────────────────────────────────────────────

  describe('getDashboardById()', () => {
    it('should return dashboard with chart layout', async () => {
      dashboardRepo.findOne.mockResolvedValue(sampleDashboard);
      dashboardChartsRepo.find.mockResolvedValue([
        { chartId: TEST_CHART_ID, options: JSON.stringify({ cols: 6, rows: 4, x: 0, y: 0 }) },
      ]);

      const result = await service.getDashboardById(TEST_DASHBOARD_ID);

      expect(result.id).toBe(TEST_DASHBOARD_ID);
      expect(result.name).toBe('Test Dashboard');
      expect(result.charts).toHaveLength(1);
      expect((result.charts[0] as Record<string, unknown>).chartId).toBe(TEST_CHART_ID);
      expect(dashboardRepo.findOne).toHaveBeenCalledWith({ where: { id: TEST_DASHBOARD_ID } });
    });

    it('should throw NotFoundException when dashboard does not exist', async () => {
      dashboardRepo.findOne.mockResolvedValue(null);

      await expect(service.getDashboardById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateDashboard() ────────────────────────────────────────────────────

  describe('updateDashboard()', () => {
    const updateDashboardDto = {
      id: TEST_DASHBOARD_ID,
      name: 'Updated Dashboard',
      charts: [{ chartId: TEST_CHART_ID, cols: 6, rows: 4, x: 0, y: 0, isTitle: false }],
    } as any;

    it('should update existing dashboard and return its ID', async () => {
      dashboardRepo.findOne.mockResolvedValue(sampleDashboard);

      const result = await service.updateDashboard(TEST_USER_ID, updateDashboardDto);

      expect(result).toBe(TEST_DASHBOARD_ID);
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.update).toHaveBeenCalled();
      expect(mockManager.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when dashboard does not exist', async () => {
      dashboardRepo.findOne.mockResolvedValue(null);

      await expect(service.updateDashboard(TEST_USER_ID, updateDashboardDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when transaction fails', async () => {
      dashboardRepo.findOne.mockResolvedValue(sampleDashboard);
      mockDataSource.transaction.mockRejectedValue(new Error('DB failure'));

      await expect(service.updateDashboard(TEST_USER_ID, updateDashboardDto)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── favoriteDashboard() ──────────────────────────────────────────────────

  describe('favoriteDashboard()', () => {
    it('should toggle dashboard favorite from false to true', async () => {
      dashboardRepo.findOne.mockResolvedValue({ id: TEST_DASHBOARD_ID, isFavorite: 0 });
      dashboardRepo.update.mockResolvedValue({});

      const result = await service.favoriteDashboard(TEST_DASHBOARD_ID);

      expect(result).toBe(true);
      expect(dashboardRepo.update).toHaveBeenCalledWith({ id: TEST_DASHBOARD_ID }, { isFavorite: 1 });
    });

    it('should toggle dashboard favorite from true to false', async () => {
      dashboardRepo.findOne.mockResolvedValue({ id: TEST_DASHBOARD_ID, isFavorite: 1 });
      dashboardRepo.update.mockResolvedValue({});

      const result = await service.favoriteDashboard(TEST_DASHBOARD_ID);

      expect(result).toBe(false);
      expect(dashboardRepo.update).toHaveBeenCalledWith({ id: TEST_DASHBOARD_ID }, { isFavorite: 0 });
    });

    it('should throw NotFoundException when dashboard does not exist', async () => {
      dashboardRepo.findOne.mockResolvedValue(null);

      await expect(service.favoriteDashboard('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});

// ─── ObservabilityUtilService ─────────────────────────────────────────────────

describe('ObservabilityUtilService', () => {
  let utilService: ObservabilityUtilService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ObservabilityUtilService],
    }).compile();

    utilService = module.get<ObservabilityUtilService>(ObservabilityUtilService);
  });

  // ─── fetchMetricField() ───────────────────────────────────────────────────

  describe('fetchMetricField()', () => {
    it('should return metric field from tables when isMetric=true', () => {
      const data = {
        tables: [{ fields: [{ columnName: 'value', isMetric: true }] }],
      };

      const result = utilService.fetchMetricField(data);

      expect(result).toEqual({ columnName: 'value', isMetric: true });
    });

    it('should return null when no isMetric field exists', () => {
      const data = {
        tables: [{ fields: [{ columnName: 'name', isMetric: false }] }],
      };

      const result = utilService.fetchMetricField(data);

      expect(result).toBeNull();
    });

    it('should search compare array when no metric found in tables', () => {
      const data = {
        tables: [],
        compare: [{ columnName: 'cmpVal', isMetric: true }],
      };

      const result = utilService.fetchMetricField(data);

      expect(result).toEqual({ columnName: 'cmpVal', isMetric: true });
    });

    it('should search operation array when not found in tables or compare', () => {
      const data = {
        operation: [{ columnName: 'opVal', isMetric: true }],
      };

      const result = utilService.fetchMetricField(data);

      expect(result).toEqual({ columnName: 'opVal', isMetric: true });
    });

    it('should return null when all arrays are empty', () => {
      const result = utilService.fetchMetricField({});

      expect(result).toBeNull();
    });
  });

  // ─── fetchExplodedField() ─────────────────────────────────────────────────

  describe('fetchExplodedField()', () => {
    it('should return exploded field from tables when isExplodedBy=true', () => {
      const data = {
        tables: [{ fields: [{ columnName: 'node_name', isExplodedBy: true }] }],
      };

      const result = utilService.fetchExplodedField(data);

      expect(result).toEqual({ columnName: 'node_name', isExplodedBy: true });
    });

    it('should return null when no exploded field exists', () => {
      const data = {
        tables: [{ fields: [{ columnName: 'value', isMetric: true }] }],
      };

      const result = utilService.fetchExplodedField(data);

      expect(result).toBeNull();
    });

    it('should search control array when not found in tables', () => {
      const data = {
        control: [{ columnName: 'ctrlNode', isExplodedBy: true }],
      };

      const result = utilService.fetchExplodedField(data);

      expect(result).toEqual({ columnName: 'ctrlNode', isExplodedBy: true });
    });
  });

  // ─── fetchThresholdData() ─────────────────────────────────────────────────

  describe('fetchThresholdData()', () => {
    it('should return null when threshold is null', () => {
      const result = utilService.fetchThresholdData(null as any, 50);

      expect(result).toBeNull();
    });

    it('should return critical color when value exceeds maximum alternative threshold', () => {
      const threshold = {
        alternativeTimeFilters: {
          maximum: { type: ObservabilityThresholdStatus.CRITICAL, value: 100 },
        },
      };

      const result = utilService.fetchThresholdData(threshold, 150);

      expect(result).toEqual({ color: '#dc3545', type: ObservabilityThresholdStatus.CRITICAL });
    });

    it('should return warning color when value is below minimum alternative threshold', () => {
      const threshold = {
        alternativeTimeFilters: {
          minimum: { type: ObservabilityThresholdStatus.WARNING, value: 10 },
        },
      };

      const result = utilService.fetchThresholdData(threshold, 5);

      expect(result).toEqual({ color: '#ffc107', type: ObservabilityThresholdStatus.WARNING });
    });

    it('should return normal color when value is within alternative threshold range', () => {
      const threshold = {
        alternativeTimeFilters: {
          minimum: { type: ObservabilityThresholdStatus.WARNING, value: 5 },
          maximum: { type: ObservabilityThresholdStatus.CRITICAL, value: 100 },
        },
      };

      const result = utilService.fetchThresholdData(threshold, 50);

      expect(result).toEqual({ color: '#28a745', type: ObservabilityThresholdStatus.NORMAL });
    });

    it('should return null when no matching time filter exists for current time', () => {
      const threshold = {
        timeFilters: [
          {
            startTime: '99:00',
            endTime: '99:59',
            thresholds: [{ min: 0, max: 100, type: ObservabilityThresholdStatus.NORMAL }],
          },
        ],
      };

      // Time filter window is impossible — should never match
      const result = utilService.fetchThresholdData(threshold, 50);

      expect(result).toBeNull();
    });
  });

  // ─── getIconForAlarmType() ────────────────────────────────────────────────

  describe('getIconForAlarmType()', () => {
    it('should return check-circle for normal status', () => {
      expect(utilService.getIconForAlarmType(ObservabilityThresholdStatus.NORMAL)).toBe('check-circle');
    });

    it('should return exclamation-triangle for warning status', () => {
      expect(utilService.getIconForAlarmType(ObservabilityThresholdStatus.WARNING)).toBe('exclamation-triangle');
    });

    it('should return xmark-circle for critical status', () => {
      expect(utilService.getIconForAlarmType(ObservabilityThresholdStatus.CRITICAL)).toBe('xmark-circle');
    });

    it('should return check-circle for unknown status', () => {
      expect(utilService.getIconForAlarmType('unknown')).toBe('check-circle');
    });
  });
});
