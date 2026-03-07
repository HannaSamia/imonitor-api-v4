import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';
import { CoreDashboard } from '../../database/entities/core-dashboard.entity';
import { CoreDashboardWidgetBuilder } from '../../database/entities/core-dashboard-widget-builder.entity';
import { CoreDashboardChart } from '../../database/entities/core-dashboard-chart.entity';
import { CoreDashboardError } from '../../database/entities/core-dashboard-error.entity';
import { CoreSharedDashboard } from '../../database/entities/core-shared-dashboard.entity';
import { CoreWidgetBuilder } from '../../database/entities/core-widget-builder.entity';
import { CoreWidgetBuilderCharts } from '../../database/entities/core-widget-builder-charts.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { WidgetBuilderService } from '../widget-builder/widget-builder.service';

// ─── Mock Factories ─────────────────────────────────────────────────────────

function createMockRepo() {
  const qb = {
    where: jest.fn().mockReturnThis(),
    getExists: jest.fn().mockResolvedValue(false),
  };
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockResolvedValue({}),
    insert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
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

const mockDateHelper = {
  formatDate: jest.fn().mockReturnValue('2026-03-07 12:00:00'),
};

const mockWidgetBuilderService = {
  duplicate: jest.fn(),
  cleanWidgetBuilders: jest.fn(),
};

// ─── Test Data ───────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-123';
const TEST_DASHBOARD_ID = 'dash-456';
const TEST_WB_ID = 'wb-789';
const TEST_CHART_ID = 'chart-001';

const sampleChart = {
  chartId: TEST_CHART_ID,
  widgetBuilderId: TEST_WB_ID,
  cols: 6,
  rows: 4,
  x: 0,
  y: 0,
};

const titleChart = {
  chartId: '',
  widgetBuilderId: '',
  cols: 12,
  rows: 1,
  x: 0,
  y: 0,
  isTitle: true,
  value: 'My Title',
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('DashboardService', () => {
  let service: DashboardService;
  let dashboardRepo: ReturnType<typeof createMockRepo>;
  let dashboardWbRepo: ReturnType<typeof createMockRepo>;
  let dashboardChartRepo: ReturnType<typeof createMockRepo>;
  let dashboardErrorRepo: ReturnType<typeof createMockRepo>;
  let sharedDashboardRepo: ReturnType<typeof createMockRepo>;
  let widgetBuilderRepo: ReturnType<typeof createMockRepo>;
  let wbChartsRepo: ReturnType<typeof createMockRepo>;

  beforeEach(async () => {
    dashboardRepo = createMockRepo();
    dashboardWbRepo = createMockRepo();
    dashboardChartRepo = createMockRepo();
    dashboardErrorRepo = createMockRepo();
    sharedDashboardRepo = createMockRepo();
    widgetBuilderRepo = createMockRepo();
    wbChartsRepo = createMockRepo();

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(CoreDashboard), useValue: dashboardRepo },
        { provide: getRepositoryToken(CoreDashboardWidgetBuilder), useValue: dashboardWbRepo },
        { provide: getRepositoryToken(CoreDashboardChart), useValue: dashboardChartRepo },
        { provide: getRepositoryToken(CoreDashboardError), useValue: dashboardErrorRepo },
        { provide: getRepositoryToken(CoreSharedDashboard), useValue: sharedDashboardRepo },
        { provide: getRepositoryToken(CoreWidgetBuilder), useValue: widgetBuilderRepo },
        { provide: getRepositoryToken(CoreWidgetBuilderCharts), useValue: wbChartsRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: DateHelperService, useValue: mockDateHelper },
        { provide: WidgetBuilderService, useValue: mockWidgetBuilderService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  // --- save() ---

  describe('save()', () => {
    it('should create a dashboard and return the ID', async () => {
      widgetBuilderRepo.findOne.mockResolvedValue({ id: TEST_WB_ID });
      wbChartsRepo.findOne.mockResolvedValue({ id: TEST_CHART_ID });
      // checkWidgetBuilderPrivilege: no used tables
      mockDataSource.query.mockResolvedValue([{ usedTables: null }]);

      const result = await service.save({ name: 'Test Dashboard', charts: [sampleChart] }, TEST_USER_ID);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should skip title widgets when validating', async () => {
      const result = await service.save({ name: 'Title Only', charts: [titleChart as any] }, TEST_USER_ID);

      expect(result).toBeDefined();
      expect(widgetBuilderRepo.findOne).not.toHaveBeenCalled();
    });

    it('should throw if widget builder does not exist', async () => {
      widgetBuilderRepo.findOne.mockResolvedValue(null);

      await expect(service.save({ name: 'Test', charts: [sampleChart] }, TEST_USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if chart does not exist', async () => {
      widgetBuilderRepo.findOne.mockResolvedValue({ id: TEST_WB_ID });
      mockDataSource.query.mockResolvedValue([{ usedTables: null }]);
      wbChartsRepo.findOne.mockResolvedValue(null);

      await expect(service.save({ name: 'Test', charts: [sampleChart] }, TEST_USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // --- update() ---

  describe('update()', () => {
    it('should update a dashboard', async () => {
      const qb = dashboardRepo.createQueryBuilder();
      qb.getExists.mockResolvedValue(true);
      widgetBuilderRepo.findOne.mockResolvedValue({ id: TEST_WB_ID });
      wbChartsRepo.findOne.mockResolvedValue({ id: TEST_CHART_ID });
      mockDataSource.query.mockResolvedValue([{ usedTables: null }]);

      await service.update({ id: TEST_DASHBOARD_ID, name: 'Updated', charts: [sampleChart] }, TEST_USER_ID);

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should throw if dashboard does not exist', async () => {
      const qb = dashboardRepo.createQueryBuilder();
      qb.getExists.mockResolvedValue(false);

      await expect(
        service.update({ id: TEST_DASHBOARD_ID, name: 'Updated', charts: [sampleChart] }, TEST_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // --- getById() ---

  describe('getById()', () => {
    it('should return dashboard by ID', async () => {
      dashboardRepo.findOne.mockResolvedValue({
        name: 'My Dashboard',
        ownerId: TEST_USER_ID,
        options: JSON.stringify([sampleChart]),
        isDefault: false,
      });

      const result = await service.getById(TEST_DASHBOARD_ID);

      expect(result.name).toBe('My Dashboard');
      expect(result.charts).toHaveLength(1);
      expect(result.charts[0].chartId).toBe(TEST_CHART_ID);
    });

    it('should throw if dashboard not found', async () => {
      dashboardRepo.findOne.mockResolvedValue(null);

      await expect(service.getById('nonexistent')).rejects.toThrow(BadRequestException);
    });
  });

  // --- getAnyById() ---

  describe('getAnyById()', () => {
    it('should return dashboard from union query', async () => {
      mockDataSource.query.mockResolvedValue([
        {
          id: TEST_DASHBOARD_ID,
          name: 'Any Dashboard',
          ownerId: TEST_USER_ID,
          options: JSON.stringify([sampleChart]),
          isDefault: false,
        },
      ]);

      const result = await service.getAnyById(TEST_DASHBOARD_ID);

      expect(result.name).toBe('Any Dashboard');
    });

    it('should throw if not found', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await expect(service.getAnyById('nonexistent')).rejects.toThrow(BadRequestException);
    });
  });

  // --- share() ---

  describe('share()', () => {
    it('should share dashboard with users', async () => {
      const qb = dashboardRepo.createQueryBuilder();
      qb.getExists.mockResolvedValue(true);

      await service.share(TEST_DASHBOARD_ID, ['user-1', 'user-2']);

      expect(sharedDashboardRepo.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ dashboardId: TEST_DASHBOARD_ID, ownerId: 'user-1' }),
          expect.objectContaining({ dashboardId: TEST_DASHBOARD_ID, ownerId: 'user-2' }),
        ]),
      );
    });

    it('should throw if dashboard does not exist', async () => {
      const qb = dashboardRepo.createQueryBuilder();
      qb.getExists.mockResolvedValue(false);

      await expect(service.share('nonexistent', ['user-1'])).rejects.toThrow(BadRequestException);
    });
  });

  // --- getSharedById() ---

  describe('getSharedById()', () => {
    it('should return shared dashboard', async () => {
      mockDataSource.query.mockResolvedValue([
        {
          id: 'shared-1',
          dashboardId: TEST_DASHBOARD_ID,
          ownerId: TEST_USER_ID,
          name: 'Shared Dashboard',
          options: JSON.stringify([sampleChart]),
          isDefault: false,
        },
      ]);

      const result = await service.getSharedById('shared-1');

      expect(result.name).toBe('Shared Dashboard');
    });

    it('should throw if shared dashboard not found', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await expect(service.getSharedById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // --- saveShared() ---

  describe('saveShared()', () => {
    it('should duplicate shared dashboard with widget builders', async () => {
      // getSharedById returns dashboard
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: 'shared-1',
            dashboardId: TEST_DASHBOARD_ID,
            ownerId: 'other-user',
            name: 'Shared',
            options: JSON.stringify([sampleChart]),
            isDefault: false,
          },
        ])
        // checkWidgetBuilderPrivilege: usedTables
        .mockResolvedValueOnce([{ usedTables: null }]);

      mockWidgetBuilderService.duplicate.mockResolvedValue({
        widgetBuilderId: 'new-wb-id',
        charts: { [TEST_CHART_ID]: 'new-chart-id' },
      });

      wbChartsRepo.findOne.mockResolvedValue({ id: 'new-chart-id' });

      const result = await service.saveShared('shared-1', TEST_USER_ID);

      expect(result).toBeDefined();
      expect(mockWidgetBuilderService.duplicate).toHaveBeenCalledWith(TEST_WB_ID, TEST_USER_ID);
      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should clean up widget builders if duplicate returns null', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'shared-1',
          dashboardId: TEST_DASHBOARD_ID,
          ownerId: 'other-user',
          name: 'Shared',
          options: JSON.stringify([sampleChart]),
          isDefault: false,
        },
      ]);

      mockWidgetBuilderService.duplicate.mockResolvedValue(null);

      await expect(service.saveShared('shared-1', TEST_USER_ID)).rejects.toThrow(BadRequestException);

      expect(mockWidgetBuilderService.cleanWidgetBuilders).toHaveBeenCalledWith([]);
    });
  });

  // --- saveDefault() ---

  describe('saveDefault()', () => {
    it('should throw if dashboard is not default', async () => {
      dashboardRepo.findOne.mockResolvedValue({
        name: 'Regular',
        ownerId: TEST_USER_ID,
        options: '[]',
        isDefault: false,
      });

      await expect(service.saveDefault(TEST_DASHBOARD_ID, TEST_USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('should duplicate a default dashboard', async () => {
      dashboardRepo.findOne.mockResolvedValue({
        name: 'Default Dashboard',
        ownerId: '0',
        options: JSON.stringify([sampleChart]),
        isDefault: true,
      });

      mockWidgetBuilderService.duplicate.mockResolvedValue({
        widgetBuilderId: 'new-wb-id',
        charts: { [TEST_CHART_ID]: 'new-chart-id' },
      });

      // checkWidgetBuilderPrivilege: usedTables
      mockDataSource.query.mockResolvedValueOnce([{ usedTables: null }]);

      wbChartsRepo.findOne.mockResolvedValue({ id: 'new-chart-id' });

      const result = await service.saveDefault(TEST_DASHBOARD_ID, TEST_USER_ID);

      expect(result).toBeDefined();
      expect(mockWidgetBuilderService.duplicate).toHaveBeenCalledWith(TEST_WB_ID, TEST_USER_ID);
      expect(mockDataSource.transaction).toHaveBeenCalled();
    });
  });

  // --- favorite() ---

  describe('favorite()', () => {
    it('should toggle favorite on own dashboard', async () => {
      dashboardRepo.findOne.mockResolvedValue({ isFavorite: false });
      dashboardRepo.update.mockResolvedValue({});

      const result = await service.favorite(TEST_DASHBOARD_ID, false);

      expect(result).toBe(true);
      expect(dashboardRepo.update).toHaveBeenCalledWith({ id: TEST_DASHBOARD_ID }, { isFavorite: true });
    });

    it('should toggle favorite on shared dashboard', async () => {
      sharedDashboardRepo.findOne.mockResolvedValue({ isFavorite: true });
      sharedDashboardRepo.update.mockResolvedValue({});

      const result = await service.favorite('shared-1', true);

      expect(result).toBe(false);
      expect(sharedDashboardRepo.update).toHaveBeenCalledWith({ id: 'shared-1' }, { isFavorite: false });
    });
  });

  // --- isSharedDashboard() ---

  describe('isSharedDashboard()', () => {
    it('should return true for shared dashboards', async () => {
      const qb = sharedDashboardRepo.createQueryBuilder();
      qb.getExists.mockResolvedValue(true);

      const result = await service.isSharedDashboard('shared-1');

      expect(result).toBe(true);
    });

    it('should return false for non-shared dashboards', async () => {
      const qb = sharedDashboardRepo.createQueryBuilder();
      qb.getExists.mockResolvedValue(false);

      const result = await service.isSharedDashboard(TEST_DASHBOARD_ID);

      expect(result).toBe(false);
    });
  });

  // --- logError() ---

  describe('logError()', () => {
    it('should log dashboard error without throwing', async () => {
      dashboardErrorRepo.save.mockResolvedValue({});

      await service.logError(TEST_DASHBOARD_ID, TEST_WB_ID, TEST_CHART_ID, 'some error');

      expect(dashboardErrorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboardId: TEST_DASHBOARD_ID,
          widgetBuilderId: TEST_WB_ID,
          chartId: TEST_CHART_ID,
          errorstack: 'some error',
        }),
      );
    });

    it('should not throw on save failure', async () => {
      dashboardErrorRepo.save.mockRejectedValue(new Error('DB down'));

      await expect(service.logError(TEST_DASHBOARD_ID, TEST_WB_ID, TEST_CHART_ID, 'error')).resolves.toBeUndefined();
    });
  });

  // --- list() ---

  describe('list()', () => {
    it('should return dashboards for user', async () => {
      mockDataSource.query
        // Main UNION query
        .mockResolvedValueOnce([
          {
            id: TEST_DASHBOARD_ID,
            name: 'My Dashboard',
            ownerId: TEST_USER_ID,
            isFavorite: false,
            owner: 'testuser',
            isShared: false,
            createdAt: '2026-03-07 12:00',
            updatedAt: '2026-03-07 12:00',
            isDefault: false,
          },
        ])
        // Privileged tables query
        .mockResolvedValueOnce([{ privilegedTables: '"table-1","table-2"' }])
        // Batch used tables query (returns individual rows)
        .mockResolvedValueOnce([{ dashboardId: TEST_DASHBOARD_ID, tableId: 'table-1' }]);

      const result = await service.list(TEST_USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('My Dashboard');
    });

    it('should include shared dashboards without privilege check', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: 'shared-1',
            name: 'Shared',
            ownerId: 'other',
            isFavorite: false,
            owner: 'other',
            isShared: true,
            createdAt: '2026-03-07 12:00',
            updatedAt: '2026-03-07 12:00',
            isDefault: false,
          },
        ])
        .mockResolvedValueOnce([{ privilegedTables: null }]);

      const result = await service.list(TEST_USER_ID);

      expect(result).toHaveLength(1);
    });
  });

  // --- hasPrivilege() ---

  describe('hasPrivilege()', () => {
    it('should check privilege on all widget builders', async () => {
      // dashboardWbRepo.find returns WB associations
      dashboardWbRepo.find.mockResolvedValue([{ widgetBuilderId: TEST_WB_ID }]);
      // checkWidgetBuilderPrivilege: usedTables
      mockDataSource.query.mockResolvedValueOnce([{ usedTables: null }]);

      await expect(service.hasPrivilege(TEST_DASHBOARD_ID, TEST_USER_ID)).resolves.toBeUndefined();
    });
  });
});
