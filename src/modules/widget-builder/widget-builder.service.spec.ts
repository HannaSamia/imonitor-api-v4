import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WidgetBuilderService } from './widget-builder.service';
import { CoreWidgetBuilder } from '../../database/entities/core-widget-builder.entity';
import { CoreWidgetBuilderCharts } from '../../database/entities/core-widget-builder-charts.entity';
import { CoreWidgetBuilderModule } from '../../database/entities/core-widget-builder-module.entity';
import { CoreWidgetBuilderUsedTables } from '../../database/entities/core-widget-builder-used-tables.entity';
import { CoreSharedWidgetBuilder } from '../../database/entities/core-shared-widget-builder.entity';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { WidgetBuilderQueryService } from './services/widget-builder-query.service';
import { QueryBuilderService } from '../reports/services/query-builder.service';

// ─── Mock Factories ─────────────────────────────────────────────────────────

function createMockRepo() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockResolvedValue({}),
    insert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    findOne: jest.fn(),
    insert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  },
  query: jest.fn(),
};

const mockDataSource = {
  query: jest.fn(),
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockLegacyDataDb = {
  query: jest.fn(),
};

const mockDateHelper = {
  formatDate: jest.fn().mockReturnValue('2026-03-04 12:00:00'),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('`iMonitorV3_1`'),
};

const mockWbQueryService = {
  generateWidgetBuilderQuery: jest.fn(),
};

const mockQueryBuilderService = {
  generate: jest.fn(),
  generateWidgetBuilderQuery: jest.fn(),
};

// ─── Test Data ───────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-123';
const TEST_WB_ID = 'wb-456';
const TEST_CHART_ID = 'chart-789';

const MOCK_DB_WB: Partial<CoreWidgetBuilder> = {
  id: TEST_WB_ID,
  name: 'Test Widget Builder',
  ownerId: TEST_USER_ID,
  isFavorite: false,
  isDefault: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: null,
  limit: 100,
  tables: JSON.stringify([{ id: 'table-1', displayName: 'Table One', fields: [] }]),
  globalFilter: JSON.stringify({ condition: 'AND', rules: [] }),
  orderBy: JSON.stringify([]),
  control: JSON.stringify([]),
  operation: JSON.stringify([]),
  compare: JSON.stringify([]),
  priority: JSON.stringify([]),
  inclusion: JSON.stringify([]),
  options: JSON.stringify({ threshold: {}, isFooterAggregation: false, globalFieldIndex: 0 }),
  globalOrderIndex: 0,
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('WidgetBuilderService', () => {
  let service: WidgetBuilderService;
  let wbRepo: ReturnType<typeof createMockRepo>;
  let chartsRepo: ReturnType<typeof createMockRepo>;
  let wbModuleRepo: ReturnType<typeof createMockRepo>;
  let sharedWbRepo: ReturnType<typeof createMockRepo>;
  let usersRepo: ReturnType<typeof createMockRepo>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WidgetBuilderService,
        { provide: getRepositoryToken(CoreWidgetBuilder), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreWidgetBuilderCharts), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreWidgetBuilderModule), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreWidgetBuilderUsedTables), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreSharedWidgetBuilder), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreModulesTables), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreTablesField), useValue: createMockRepo() },
        { provide: getRepositoryToken(CorePrivileges), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreApplicationUsers), useValue: createMockRepo() },
        { provide: DataSource, useValue: mockDataSource },
        { provide: LegacyDataDbService, useValue: mockLegacyDataDb },
        { provide: DateHelperService, useValue: mockDateHelper },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WidgetBuilderQueryService, useValue: mockWbQueryService },
        { provide: QueryBuilderService, useValue: mockQueryBuilderService },
      ],
    }).compile();

    service = module.get<WidgetBuilderService>(WidgetBuilderService);
    wbRepo = module.get(getRepositoryToken(CoreWidgetBuilder));
    chartsRepo = module.get(getRepositoryToken(CoreWidgetBuilderCharts));
    wbModuleRepo = module.get(getRepositoryToken(CoreWidgetBuilderModule));
    sharedWbRepo = module.get(getRepositoryToken(CoreSharedWidgetBuilder));
    usersRepo = module.get(getRepositoryToken(CoreApplicationUsers));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── privilegedStatisticTables ──────────────────────────────────────────────

  describe('privilegedStatisticTables', () => {
    it('should return tables with ref table when user has privileges', async () => {
      const sideTables = [{ id: 'mt-1', displayName: 'SDP Stats', role: 'admin' }];
      const fields = [{ id: 'f-1', node: 'hash1', columnDisplayName: 'Col1', type: 'number', operation: 'sum' }];
      const refTable = [{ id: 'mt-ref', displayName: 'Parameters', role: 'admin' }];

      mockDataSource.query
        .mockResolvedValueOnce(sideTables) // privileged tables
        .mockResolvedValueOnce(fields) // fields for mt-1
        .mockResolvedValueOnce(refTable) // ref table
        .mockResolvedValueOnce(fields); // fields for ref table

      const result = await service.privilegedStatisticTables(TEST_USER_ID);

      expect(result.tables).toHaveLength(2); // ref + 1 stat table
      expect(result.tables[0].id).toBe('mt-ref');
      expect(result.tables[1].id).toBe('mt-1');
      expect(result.tables[1].fields).toHaveLength(1);
    });

    it('should throw BadRequestException when user has no privileged tables', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.privilegedStatisticTables(TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.NO_PRIVILEGED_TABLES),
      );
    });
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return widget builders list', async () => {
      const wbs = [
        { id: 'wb1', name: 'WB 1', isShared: false, ownerId: TEST_USER_ID },
        { id: 'wb2', name: 'WB 2', isShared: true, ownerId: TEST_USER_ID },
      ];

      mockDataSource.query
        .mockResolvedValueOnce(wbs) // main list
        .mockResolvedValueOnce([{ privilegedTables: '"table-1","table-2"' }]) // privileged tables
        .mockResolvedValueOnce([{ usedTables: '"table-1"' }]); // used tables for wb1

      const result = await service.list(TEST_USER_ID);

      expect(result).toHaveLength(2);
    });

    it('should remove widget builders where user lacks table privilege', async () => {
      const wbs = [{ id: 'wb1', name: 'WB 1', isShared: false, ownerId: TEST_USER_ID }];

      mockDataSource.query
        .mockResolvedValueOnce(wbs)
        .mockResolvedValueOnce([{ privilegedTables: '"table-1"' }])
        .mockResolvedValueOnce([{ usedTables: '"table-99"' }]);

      const result = await service.list(TEST_USER_ID);

      expect(result).toHaveLength(0);
    });
  });

  // ─── getById ──────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return widget builder with parsed JSON and charts', async () => {
      wbRepo.findOne.mockResolvedValue(MOCK_DB_WB);
      mockDataSource.query.mockResolvedValueOnce([
        { data: JSON.stringify({ id: TEST_CHART_ID, name: 'Pie', type: 'pie', orderIndex: 0 }) },
      ]);

      const result = await service.getById(TEST_WB_ID, TEST_USER_ID);

      expect(result.id).toBe(TEST_WB_ID);
      expect(result.name).toBe('Test Widget Builder');
      expect(result.tables).toEqual([{ id: 'table-1', displayName: 'Table One', fields: [] }]);
      expect(result.charts).toHaveLength(1);
      expect(result.charts[0].id).toBe(TEST_CHART_ID);
    });

    it('should throw BadRequestException if widget builder does not exist', async () => {
      wbRepo.findOne.mockResolvedValue(null);

      await expect(service.getById(TEST_WB_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST),
      );
    });

    it('should throw BadRequestException if user lacks access', async () => {
      wbRepo.findOne.mockResolvedValue({
        ...MOCK_DB_WB,
        ownerId: 'other-user',
        isDefault: false,
      });

      await expect(service.getById(TEST_WB_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.ACCESS_DENIED),
      );
    });

    it('should allow access to default widget builders regardless of owner', async () => {
      wbRepo.findOne.mockResolvedValue({
        ...MOCK_DB_WB,
        ownerId: 'other-user',
        isDefault: true,
      });
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getById(TEST_WB_ID, TEST_USER_ID);

      expect(result.isDefault).toBe(true);
    });

    it('should skip access check when checkAccess is false', async () => {
      wbRepo.findOne.mockResolvedValue({
        ...MOCK_DB_WB,
        ownerId: 'other-user',
        isDefault: false,
      });
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getById(TEST_WB_ID, TEST_USER_ID, false);

      expect(result.id).toBe(TEST_WB_ID);
    });
  });

  // ─── getSharedById ────────────────────────────────────────────────────────

  describe('getSharedById', () => {
    it('should return shared widget builder with parsed JSON', async () => {
      const sharedRow = {
        id: 'shared-1',
        widgetBuilderId: TEST_WB_ID,
        name: 'Shared WB',
        ownerId: TEST_USER_ID,
        isFavorite: 0,
        isDefault: 0,
        createdAt: '2026-01-01',
        updatedAt: null,
        limit: 50,
        tables: JSON.stringify([]),
        globalFilter: JSON.stringify({ condition: 'AND', rules: [] }),
        orderBy: null,
        control: null,
        operation: null,
        compare: null,
        priority: null,
        inclusion: null,
        options: null,
        globalOrderIndex: 0,
      };

      mockDataSource.query
        .mockResolvedValueOnce([sharedRow]) // shared WB query
        .mockResolvedValueOnce([]); // charts query

      const result = await service.getSharedById('shared-1');

      expect(result.id).toBe('shared-1');
      expect(result.name).toBe('Shared WB');
      expect(result.charts).toEqual([]);
    });

    it('should throw BadRequestException if shared widget builder does not exist', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getSharedById('nonexistent')).rejects.toThrow(
        new BadRequestException(ErrorMessages.SHARED_WIDGET_BUILDER_DOES_NOT_EXIST),
      );
    });
  });

  // ─── save ──────────────────────────────────────────────────────────────────

  describe('save', () => {
    const saveDto = {
      name: 'New WB',
      globalFilter: { condition: 'AND', rules: [] },
      options: { threshold: {}, isFooterAggregation: false, globalFieldIndex: 0 },
      limit: 100,
      tables: [{ id: 'table-1', displayName: 'Table One', fields: [] }],
      orderBy: [],
      control: [],
      operation: [],
      compare: [],
      globalOrderIndex: 0,
      charts: [{ id: 'c1', name: 'Pie', type: 'pie', orderIndex: 0 }],
    };

    it('should save and return a new widget builder ID', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({ mId: 'mod-1' });
      mockQueryRunner.query.mockResolvedValue([{ name: 'admin' }]);

      const result = await service.save(saveDto as any, TEST_USER_ID);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback and throw if user has only "user" role on module', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({ mId: 'mod-1' });
      mockQueryRunner.query.mockResolvedValue([{ name: 'user' }]);

      await expect(service.save(saveDto as any, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_NOT_PRIVILEGED_TO_SAVE),
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should rollback on unexpected errors', async () => {
      mockQueryRunner.manager.findOne.mockRejectedValue(new Error('DB down'));

      await expect(service.save(saveDto as any, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_WIDGETBUILDER),
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    const updateDto = {
      id: TEST_WB_ID,
      name: 'Updated WB',
      globalFilter: { condition: 'AND', rules: [] },
      options: { threshold: {} },
      limit: 200,
      tables: [{ id: 'table-1', displayName: 'Table One', fields: [] }],
      orderBy: [],
      control: [],
      operation: [],
      compare: [],
      globalOrderIndex: 1,
      charts: [],
      chartsStatus: {},
    };

    it('should update successfully when user is owner', async () => {
      wbRepo.findOne.mockResolvedValue({ ownerId: TEST_USER_ID });

      const modulesTablesRepo = service['modulesTablesRepo'] as any;
      modulesTablesRepo.findOne = jest.fn().mockResolvedValue({ mId: 'mod-1' });

      await service.update(updateDto as any, TEST_USER_ID);

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw if widget builder does not exist', async () => {
      wbRepo.findOne.mockResolvedValue(null);

      await expect(service.update(updateDto as any, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST),
      );
    });

    it('should throw if user is not the owner', async () => {
      wbRepo.findOne.mockResolvedValue({ ownerId: 'other-user' });

      await expect(service.update(updateDto as any, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_NOT_PRIVILEGED_TO_SAVE),
      );
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete when user is admin on modules', async () => {
      wbRepo.findOne.mockResolvedValue({ id: TEST_WB_ID });
      wbModuleRepo.find.mockResolvedValue([{ moduleId: 'mod-1' }]);
      mockDataSource.query
        .mockResolvedValueOnce([{ 1: 1 }]) // admin check
        .mockResolvedValueOnce([{ dashboardNames: null }]); // no dashboards

      const result = await service.delete(TEST_USER_ID, TEST_WB_ID);

      expect(result).toBe(ErrorMessages.WIDGET_BUILDER_DELETED);
      expect(wbRepo.delete).toHaveBeenCalledWith({ id: TEST_WB_ID });
    });

    it('should throw NotFoundException if widget builder does not exist', async () => {
      wbRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(TEST_USER_ID, TEST_WB_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw if widget builder has no modules', async () => {
      wbRepo.findOne.mockResolvedValue({ id: TEST_WB_ID });
      wbModuleRepo.find.mockResolvedValue([]);

      await expect(service.delete(TEST_USER_ID, TEST_WB_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.WIDGET_DOES_NOT_HAVE_MODULES),
      );
    });

    it('should throw if widget builder is used in dashboards', async () => {
      wbRepo.findOne.mockResolvedValue({ id: TEST_WB_ID });
      wbModuleRepo.find.mockResolvedValue([{ moduleId: 'mod-1' }]);
      mockDataSource.query
        .mockResolvedValueOnce([{ 1: 1 }]) // admin check
        .mockResolvedValueOnce([{ dashboardNames: '"Dash 1"' }]); // used in dashboard

      await expect(service.delete(TEST_USER_ID, TEST_WB_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── share ─────────────────────────────────────────────────────────────────

  describe('share', () => {
    it('should share widget builder with users', async () => {
      wbRepo.findOne.mockResolvedValue({ id: TEST_WB_ID });

      await service.share(TEST_WB_ID, { userIds: ['u1', 'u2'] });

      expect(sharedWbRepo.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ widgetBuilderId: TEST_WB_ID, ownerId: 'u1' }),
          expect.objectContaining({ widgetBuilderId: TEST_WB_ID, ownerId: 'u2' }),
        ]),
      );
    });

    it('should throw if widget builder does not exist', async () => {
      wbRepo.findOne.mockResolvedValue(null);

      await expect(service.share(TEST_WB_ID, { userIds: ['u1'] })).rejects.toThrow(
        new BadRequestException(ErrorMessages.WIDGET_BUILDER_DOES_NOT_EXIST),
      );
    });
  });

  // ─── favorite ──────────────────────────────────────────────────────────────

  describe('favorite', () => {
    it('should toggle favorite on own widget builder', async () => {
      wbRepo.findOne.mockResolvedValue({ isFavorite: false });

      const result = await service.favorite(TEST_WB_ID, false);

      expect(result).toBe(true);
      expect(wbRepo.update).toHaveBeenCalledWith({ id: TEST_WB_ID }, { isFavorite: true });
    });

    it('should toggle favorite on shared widget builder', async () => {
      sharedWbRepo.findOne.mockResolvedValue({ isFavorite: true });

      const result = await service.favorite(TEST_WB_ID, true);

      expect(result).toBe(false);
      expect(sharedWbRepo.update).toHaveBeenCalledWith({ id: TEST_WB_ID }, { isFavorite: false });
    });
  });

  // ─── rename ────────────────────────────────────────────────────────────────

  describe('rename', () => {
    it('should rename when user is admin on modules', async () => {
      wbModuleRepo.find.mockResolvedValue([{ moduleId: 'mod-1' }]);
      mockDataSource.query.mockResolvedValueOnce([{ 1: 1 }]); // admin check

      const result = await service.rename({ widgetBuilderId: TEST_WB_ID, name: 'New Name' }, TEST_USER_ID);

      expect(result).toBe(ErrorMessages.WIDGET_BUILDER_NAME_UPDATED);
      expect(wbRepo.update).toHaveBeenCalledWith({ id: TEST_WB_ID }, { name: 'New Name' });
    });

    it('should throw if widget builder has no modules', async () => {
      wbModuleRepo.find.mockResolvedValue([]);

      await expect(service.rename({ widgetBuilderId: TEST_WB_ID, name: 'X' }, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.WIDGET_DOES_NOT_HAVE_MODULES),
      );
    });
  });

  // ─── changeOwner ──────────────────────────────────────────────────────────

  describe('changeOwner', () => {
    it('should transfer ownership successfully', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'new-owner' });
      wbRepo.findOne.mockResolvedValue({ ownerId: TEST_USER_ID });
      wbModuleRepo.find.mockResolvedValue([{ moduleId: 'mod-1' }]);
      mockDataSource.query
        .mockResolvedValueOnce([{ 1: 1 }]) // admin check
        .mockResolvedValueOnce([]); // dashboard cleanup

      const result = await service.changeOwner({ widgetBuilderId: TEST_WB_ID, newOwnerId: 'new-owner' }, TEST_USER_ID);

      expect(result).toBe(ErrorMessages.WIDGET_OWNER_UPDATED);
      expect(wbRepo.update).toHaveBeenCalledWith({ id: TEST_WB_ID }, { ownerId: 'new-owner' });
    });

    it('should throw if new owner does not exist', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.changeOwner({ widgetBuilderId: TEST_WB_ID, newOwnerId: 'ghost' }, TEST_USER_ID),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.USER_NOT_FOUND));
    });

    it('should throw if user already owns the widget builder', async () => {
      usersRepo.findOne.mockResolvedValue({ id: TEST_USER_ID });
      wbRepo.findOne.mockResolvedValue({ ownerId: TEST_USER_ID });
      wbModuleRepo.find.mockResolvedValue([{ moduleId: 'mod-1' }]);
      mockDataSource.query.mockResolvedValueOnce([{ 1: 1 }]); // admin check

      await expect(
        service.changeOwner({ widgetBuilderId: TEST_WB_ID, newOwnerId: TEST_USER_ID }, TEST_USER_ID),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.USER_ALREADY_OWNS_WIDGET_BUILDER));
    });
  });

  // ─── hasAccess ─────────────────────────────────────────────────────────────

  describe('hasAccess', () => {
    it('should return own widget builder access', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ widgetBuilderId: TEST_WB_ID, shared: false }]);

      const result = await service.hasAccess(TEST_WB_ID, TEST_USER_ID);

      expect(result.widgetBuilderId).toBe(TEST_WB_ID);
      expect(result.shared).toBe(false);
    });

    it('should return shared widget builder access', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([]) // no own
        .mockResolvedValueOnce([{ widgetBuilderId: TEST_WB_ID, shared: true }]); // shared

      const result = await service.hasAccess(TEST_WB_ID, TEST_USER_ID);

      expect(result.shared).toBe(true);
    });

    it('should return default widget builder access', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([]) // no own
        .mockResolvedValueOnce([]) // no shared
        .mockResolvedValueOnce([{ widgetBuilderId: TEST_WB_ID, shared: false }]); // default

      const result = await service.hasAccess(TEST_WB_ID, TEST_USER_ID);

      expect(result.widgetBuilderId).toBe(TEST_WB_ID);
    });

    it('should throw BadRequestException if no access', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([]) // no own
        .mockResolvedValueOnce([]) // no shared
        .mockResolvedValueOnce([]); // no default

      await expect(service.hasAccess(TEST_WB_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.ACCESS_DENIED),
      );
    });
  });

  // ─── closeTab ──────────────────────────────────────────────────────────────

  describe('closeTab', () => {
    it('should delete the chart for the widget builder', async () => {
      wbRepo.findOne.mockResolvedValue({ id: TEST_WB_ID });

      await service.closeTab(TEST_WB_ID, TEST_CHART_ID);

      expect(chartsRepo.delete).toHaveBeenCalledWith({ id: TEST_CHART_ID, widgetBuilderId: TEST_WB_ID });
    });

    it('should throw NotFoundException if widget builder does not exist', async () => {
      wbRepo.findOne.mockResolvedValue(null);

      await expect(service.closeTab(TEST_WB_ID, TEST_CHART_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── executeQuery ──────────────────────────────────────────────────────────

  describe('executeQuery', () => {
    const tabularObject = {
      tables: [],
      globalFilter: { condition: 'AND', rules: [] },
      orderBy: [],
      control: [],
      operation: [],
      compare: [],
    } as any;

    it('should return header and body when query is not empty', async () => {
      const header = [{ text: 'Col1', datafield: 'col1' }];
      const queryResult = [{ col1: 'value1' }];
      mockWbQueryService.generateWidgetBuilderQuery.mockResolvedValue({
        header,
        query: 'SELECT * FROM t',
        fieldsArray: [],
      });
      mockLegacyDataDb.query.mockResolvedValue(queryResult);

      const result = await service.executeQuery(tabularObject);

      expect(result.header).toEqual(header);
      expect(result.body).toEqual(queryResult);
      expect(mockWbQueryService.generateWidgetBuilderQuery).toHaveBeenCalledWith(tabularObject);
      expect(mockLegacyDataDb.query).toHaveBeenCalledWith('SELECT * FROM t');
    });

    it('should return empty header and body when query is empty', async () => {
      mockWbQueryService.generateWidgetBuilderQuery.mockResolvedValue({
        header: [],
        query: '',
        fieldsArray: [],
      });

      const result = await service.executeQuery(tabularObject);

      expect(result).toEqual({ header: [], body: [] });
      expect(mockLegacyDataDb.query).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when DB query fails', async () => {
      mockWbQueryService.generateWidgetBuilderQuery.mockResolvedValue({
        header: [{ text: 'Col1' }],
        query: 'SELECT * FROM t',
        fieldsArray: [],
      });
      mockLegacyDataDb.query.mockRejectedValue(new Error('DB error'));

      await expect(service.executeQuery(tabularObject)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── generateChartByType ──────────────────────────────────────────────────

  describe('generateChartByType', () => {
    it('should throw NotFoundException when widget builder not found', async () => {
      wbRepo.findOne.mockResolvedValue(null);

      await expect(service.generateChartByType({ widgetBuilderId: 'bad-id', chartId: TEST_CHART_ID })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when chart not found', async () => {
      wbRepo.findOne.mockResolvedValue(MOCK_DB_WB);
      chartsRepo.findOne.mockResolvedValue(null);

      await expect(service.generateChartByType({ widgetBuilderId: TEST_WB_ID, chartId: 'bad-chart' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
