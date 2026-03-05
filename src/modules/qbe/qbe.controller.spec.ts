import { Test, TestingModule } from '@nestjs/testing';
import { QbeController } from './qbe.controller';
import { QbeService } from './qbe.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';

// ─── Mock Service ─────────────────────────────────────────────────────────

const mockQbeService = {
  privilegedStatisticTables: jest.fn(),
  getSharedById: jest.fn(),
  getById: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  saveSharedQbe: jest.fn(),
  generateQbe: jest.fn(),
  generateChart: jest.fn(),
};

// ─── Test Data ────────────────────────────────────────────────────────────

const USER_ID = 'user-123';
const QBE_ID = 'qbe-456';
const SHARED_ID = 'shared-789';

const PROCESS_DTO = {
  timeFilter: 'hourly',
  fromDate: '2026-01-01T00:00:00',
  toDate: '2026-01-02T00:00:00',
  sql: 'SELECT * FROM table1 WHERE stat_date >= _fromDate_ AND stat_date <= _toDate_',
  isShared: false,
};

const SAVE_DTO = {
  name: 'Test QBE',
  timeFilter: 'hourly',
  fromDate: '2026-01-01T00:00:00',
  toDate: '2026-01-02T00:00:00',
  globalOrderIndex: 0,
  options: { threshold: {}, isFooterAggregation: false, globalFieldIndex: 0 },
  charts: [],
  sql: 'SELECT * FROM table1 WHERE stat_date >= _fromDate_ AND stat_date <= _toDate_',
};

const UPDATE_DTO = {
  ...SAVE_DTO,
  id: QBE_ID,
  chartsStatus: {},
};

const CHART_DTO = {
  tabular: PROCESS_DTO,
  chart: { id: 'chart-1', name: 'Test Pie', type: 'pie', orderIndex: 0, options: {}, lib: {} },
};

// ─── Test Suite ───────────────────────────────────────────────────────────

describe('QbeController', () => {
  let controller: QbeController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QbeController],
      providers: [{ provide: QbeService, useValue: mockQbeService }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<QbeController>(QbeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── GET Endpoints ─────────────────────────────────────────────────

  describe('getTables', () => {
    it('should call privilegedStatisticTables with userId', () => {
      const mockResult = [{ id: '1', name: 'table1', columns: [] }];
      mockQbeService.privilegedStatisticTables.mockResolvedValue(mockResult);

      const result = controller.getTables(USER_ID);

      expect(mockQbeService.privilegedStatisticTables).toHaveBeenCalledWith(USER_ID);
      return expect(result).resolves.toEqual(mockResult);
    });
  });

  describe('getSharedById', () => {
    it('should call getSharedById with sharedId and userId', () => {
      mockQbeService.getSharedById.mockResolvedValue({ id: SHARED_ID });

      const result = controller.getSharedById(SHARED_ID, USER_ID);

      expect(mockQbeService.getSharedById).toHaveBeenCalledWith(SHARED_ID, USER_ID);
      return expect(result).resolves.toEqual({ id: SHARED_ID });
    });
  });

  describe('getById', () => {
    it('should call getById with id and userId', () => {
      mockQbeService.getById.mockResolvedValue({ id: QBE_ID });

      const result = controller.getById(QBE_ID, USER_ID);

      expect(mockQbeService.getById).toHaveBeenCalledWith(QBE_ID, USER_ID);
      return expect(result).resolves.toEqual({ id: QBE_ID });
    });
  });

  // ─── Mutation Endpoints ────────────────────────────────────────────

  describe('save', () => {
    it('should call save with dto and userId', () => {
      mockQbeService.save.mockResolvedValue(QBE_ID);

      const result = controller.save(SAVE_DTO as any, USER_ID);

      expect(mockQbeService.save).toHaveBeenCalledWith(SAVE_DTO, USER_ID);
      return expect(result).resolves.toEqual(QBE_ID);
    });
  });

  describe('update', () => {
    it('should call update with id, dto, and userId', () => {
      mockQbeService.update.mockResolvedValue(undefined);

      const result = controller.update(QBE_ID, UPDATE_DTO as any, USER_ID);

      expect(mockQbeService.update).toHaveBeenCalledWith(QBE_ID, UPDATE_DTO, USER_ID);
      return expect(result).resolves.toBeUndefined();
    });
  });

  describe('saveSharedQbe', () => {
    it('should call saveSharedQbe with sharedId and userId', () => {
      mockQbeService.saveSharedQbe.mockResolvedValue('new-id');

      const result = controller.saveSharedQbe(SHARED_ID, USER_ID);

      expect(mockQbeService.saveSharedQbe).toHaveBeenCalledWith(SHARED_ID, USER_ID);
      return expect(result).resolves.toEqual('new-id');
    });
  });

  describe('run', () => {
    it('should call generateQbe with dto and userId', () => {
      const mockResult = { header: [], fields: [], body: [], query: '' };
      mockQbeService.generateQbe.mockResolvedValue(mockResult);

      const result = controller.run(PROCESS_DTO as any, USER_ID);

      expect(mockQbeService.generateQbe).toHaveBeenCalledWith(PROCESS_DTO, USER_ID);
      return expect(result).resolves.toEqual(mockResult);
    });
  });

  // ─── Chart Generation Endpoints ────────────────────────────────────

  const CHART_TYPES = [
    { method: 'pie', type: 'pie' },
    { method: 'doughnut', type: 'doughnut' },
    { method: 'trend', type: 'trend' },
    { method: 'verticalBar', type: 'vertical_bar' },
    { method: 'horizontalBar', type: 'horizontal_bar' },
    { method: 'progress', type: 'progress' },
    { method: 'explodedProgress', type: 'exploded_progress' },
  ];

  CHART_TYPES.forEach(({ method, type }) => {
    describe(method, () => {
      it(`should call generateChart with type '${type}'`, () => {
        const mockChart = { id: 'chart-1', name: 'result', type };
        mockQbeService.generateChart.mockResolvedValue(mockChart);

        const result = (controller as any)[method](CHART_DTO as any, USER_ID);

        expect(mockQbeService.generateChart).toHaveBeenCalledWith(type, CHART_DTO, USER_ID);
        return expect(result).resolves.toEqual(mockChart);
      });
    });
  });
});
