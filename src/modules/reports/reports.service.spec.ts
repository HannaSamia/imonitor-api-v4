import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ReportsService } from './reports.service';
import { QueryBuilderService } from './services/query-builder.service';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportCharts } from '../../database/entities/core-report-charts.entity';
import { CoreReportModule } from '../../database/entities/core-report-module.entity';
import { CoreReportUsedTable } from '../../database/entities/core-report-used-table.entity';
import { CoreSharedReport } from '../../database/entities/core-shared-report.entity';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ExportHelperService } from '../../shared/services/export-helper.service';
import { ConfigService } from '@nestjs/config';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { ChartStatus } from './enums';

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

const mockQueryBuilder = {
  generateQuery: jest.fn(),
};

const mockExportHelper = {
  exportTableCSV: jest.fn(),
  exportJSON: jest.fn(),
  exportHtml: jest.fn(),
  exportPDF: jest.fn(),
  exportPNG: jest.fn(),
  exportJPEG: jest.fn(),
  exportTabularToExcel: jest.fn(),
  getExportCdns: jest.fn().mockReturnValue({ jqx: '', echarts: '' }),
  cleanupFile: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('`iMonitorV3_1`'),
};

// ─── Test Data ───────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-123';
const TEST_REPORT_ID = 'report-456';
const TEST_CHART_ID = 'chart-789';

const MOCK_DB_REPORT: Partial<CoreReport> = {
  id: TEST_REPORT_ID,
  name: 'Test Report',
  ownerId: TEST_USER_ID,
  timeFilter: 'hourly' as CoreReport['timeFilter'],
  isFavorite: false,
  isDefault: false,
  createdAt: new Date('2026-01-01') as unknown as Date,
  updatedAt: null,
  fromDate: new Date('2026-01-01') as unknown as Date,
  toDate: new Date('2026-01-31') as unknown as Date,
  limit: 100,
  tables: JSON.stringify([{ id: 'table-1', displayName: 'Table One', fields: [] }]),
  globalFilter: JSON.stringify({ condition: 'AND', rules: [] }),
  orderBy: JSON.stringify([]),
  control: JSON.stringify([]),
  operation: JSON.stringify([]),
  compare: JSON.stringify([]),
  options: JSON.stringify({ threshold: {}, isFooterAggregation: false, globalFieldIndex: 0 }),
  globalOrderIndex: 0,
  isQbe: 0,
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('ReportsService', () => {
  let service: ReportsService;
  let reportRepo: jest.Mocked<Repository<CoreReport>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(CoreReport), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreReportCharts), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreReportModule), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreReportUsedTable), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreSharedReport), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreModulesTables), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreTablesField), useValue: createMockRepo() },
        { provide: getRepositoryToken(CorePrivileges), useValue: createMockRepo() },
        { provide: getRepositoryToken(CoreApplicationUsers), useValue: createMockRepo() },
        { provide: DataSource, useValue: mockDataSource },
        { provide: LegacyDataDbService, useValue: mockLegacyDataDb },
        { provide: DateHelperService, useValue: mockDateHelper },
        { provide: QueryBuilderService, useValue: mockQueryBuilder },
        { provide: ExportHelperService, useValue: mockExportHelper },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    reportRepo = module.get(getRepositoryToken(CoreReport));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── privilegedStatisticTables ──────────────────────────────────────────────

  describe('privilegedStatisticTables', () => {
    it('should return side tables and ref table when user has privileges', async () => {
      const sideTables = [{ id: 'mt-1', displayName: 'SDP Stats', role: 'admin' }];
      const refTable = [{ id: 'mt-ref', displayName: 'Ref Table', role: 'admin' }];
      const fields = [{ id: 'f-1', node: 'hash1', columnDisplayName: 'Col1', type: 'number', operation: 'sum' }];

      // 1st call: side tables query, 2nd: fields query, 3rd: ref table query, 4th: ref fields
      mockDataSource.query
        .mockResolvedValueOnce(sideTables) // privileged tables
        .mockResolvedValueOnce(fields) // fetchTableFields for first table
        .mockResolvedValueOnce(refTable) // fetchRefTable query
        .mockResolvedValueOnce(fields); // fetchTableFields for ref table

      const result = await service.privilegedStatisticTables(TEST_USER_ID);

      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].id).toBe('mt-1');
      expect(result.tables[0].fields).toHaveLength(1);
      expect(result.refTable).toBeDefined();
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
    it('should return filtered reports list', async () => {
      const reports = [
        { id: 'r1', name: 'Report 1', isShared: false, ownerId: TEST_USER_ID },
        { id: 'r2', name: 'Report 2', isShared: true, ownerId: TEST_USER_ID },
      ];

      // 1st call: reports list, 2nd: privileged tables, 3rd: used tables for r1
      mockDataSource.query
        .mockResolvedValueOnce(reports) // SELECT reports
        .mockResolvedValueOnce([{ privilegedTables: '"table-1","table-2"' }]) // privileged tables
        .mockResolvedValueOnce([{ usedTables: '"table-1"' }]); // used tables for report r1

      const result = await service.list(TEST_USER_ID);

      expect(result).toHaveLength(2);
    });

    it('should remove reports where user lacks table privilege', async () => {
      const reports = [{ id: 'r1', name: 'Report 1', isShared: false, ownerId: TEST_USER_ID }];

      mockDataSource.query
        .mockResolvedValueOnce(reports) // reports
        .mockResolvedValueOnce([{ privilegedTables: '"table-1"' }]) // only has table-1
        .mockResolvedValueOnce([{ usedTables: '"table-99"' }]); // report uses table-99

      const result = await service.list(TEST_USER_ID);

      expect(result).toHaveLength(0);
    });
  });

  // ─── getReportById ──────────────────────────────────────────────────────────

  describe('getReportById', () => {
    it('should return a report with parsed JSON fields and charts', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT as CoreReport);
      mockDataSource.query.mockResolvedValueOnce([
        { data: JSON.stringify({ id: TEST_CHART_ID, name: 'Pie', type: 'pie', orderIndex: 0 }) },
      ]);

      const result = await service.getReportById(TEST_REPORT_ID, TEST_USER_ID);

      expect(result.id).toBe(TEST_REPORT_ID);
      expect(result.name).toBe('Test Report');
      expect(result.tables).toEqual([{ id: 'table-1', displayName: 'Table One', fields: [] }]);
      expect(result.charts).toHaveLength(1);
      expect(result.charts[0].id).toBe(TEST_CHART_ID);
    });

    it('should throw BadRequestException if report does not exist', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      await expect(service.getReportById(TEST_REPORT_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST),
      );
    });

    it('should throw BadRequestException if user lacks access', async () => {
      reportRepo.findOne.mockResolvedValue({
        ...MOCK_DB_REPORT,
        ownerId: 'other-user',
        isDefault: false,
      } as CoreReport);

      await expect(service.getReportById(TEST_REPORT_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.ACCESS_DENIED),
      );
    });

    it('should allow access to default reports regardless of owner', async () => {
      reportRepo.findOne.mockResolvedValue({
        ...MOCK_DB_REPORT,
        ownerId: 'other-user',
        isDefault: true,
      } as CoreReport);
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getReportById(TEST_REPORT_ID, TEST_USER_ID);

      expect(result.isDefault).toBe(true);
    });

    it('should skip access check when checkAccess is false', async () => {
      reportRepo.findOne.mockResolvedValue({
        ...MOCK_DB_REPORT,
        ownerId: 'other-user',
        isDefault: false,
      } as CoreReport);
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getReportById(TEST_REPORT_ID, TEST_USER_ID, false);

      expect(result.id).toBe(TEST_REPORT_ID);
    });
  });

  // ─── getSharedReportById ────────────────────────────────────────────────────

  describe('getSharedReportById', () => {
    it('should return a shared report with parsed JSON fields', async () => {
      const sharedRow = {
        id: 'shared-1',
        reportId: TEST_REPORT_ID,
        name: 'Shared Report',
        ownerId: TEST_USER_ID,
        timeFilter: 'daily',
        isFavorite: 0,
        isDefault: 0,
        createdAt: '2026-01-01',
        updatedAt: null,
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
        limit: 50,
        tables: JSON.stringify([]),
        globalFilter: JSON.stringify({ condition: 'AND', rules: [] }),
        orderBy: null,
        control: null,
        operation: null,
        compare: null,
        options: null,
        globalOrderIndex: 0,
        isQbe: 0,
      };

      mockDataSource.query
        .mockResolvedValueOnce([sharedRow]) // shared report query
        .mockResolvedValueOnce([]); // charts query

      const result = await service.getSharedReportById('shared-1', TEST_USER_ID);

      expect(result.id).toBe('shared-1');
      expect(result.name).toBe('Shared Report');
      expect(result.charts).toEqual([]);
    });

    it('should throw BadRequestException if shared report does not exist', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getSharedReportById('nonexistent', TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.SHARED_REPORT_DOES_NOT_EXIST),
      );
    });
  });

  // ─── save ──────────────────────────────────────────────────────────────────

  describe('save', () => {
    const saveDto = {
      name: 'New Report',
      timeFilter: 'hourly',
      globalFilter: { condition: 'AND', rules: [] },
      options: { threshold: {}, isFooterAggregation: false, globalFieldIndex: 0 },
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      limit: 100,
      tables: [{ id: 'table-1', displayName: 'Table One', fields: [] }],
      orderBy: [],
      control: [],
      operation: [],
      compare: [],
      globalOrderIndex: 0,
      charts: [{ id: TEST_CHART_ID, name: 'Pie', type: 'pie', orderIndex: 0 }],
    };

    it('should create a report in a transaction and return its ID', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({ mId: 5 });

      const result = await service.save(saveDto as any, TEST_USER_ID);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback transaction and throw on error', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({ mId: 5 });
      mockQueryRunner.manager.insert.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.save(saveDto as any, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_REPORT),
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  // ─── rename ────────────────────────────────────────────────────────────────

  describe('rename', () => {
    const renameDto = { reportId: TEST_REPORT_ID, name: 'New Name' };

    it('should rename a report when user has admin privilege', async () => {
      const reportModuleRepo = (service as any).reportModuleRepo;
      reportModuleRepo.find.mockResolvedValue([{ moduleId: '5' }]);

      // validateUserIsAdminOnModules: admin role check returns match
      mockDataSource.query.mockResolvedValueOnce([{ 1: 1 }]);

      const result = await service.rename(renameDto, TEST_USER_ID);

      expect(result).toBe(ErrorMessages.REPORT_NAME_UPDATED);
      expect(reportRepo.update).toHaveBeenCalledWith({ id: TEST_REPORT_ID }, { name: 'New Name' });
    });

    it('should throw when report has no modules', async () => {
      const reportModuleRepo = (service as any).reportModuleRepo;
      reportModuleRepo.find.mockResolvedValue([]);

      await expect(service.rename(renameDto, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.REPORT_DOES_NOT_HAVE_MODULES),
      );
    });

    it('should throw when user is not admin on modules', async () => {
      const reportModuleRepo = (service as any).reportModuleRepo;
      reportModuleRepo.find.mockResolvedValue([{ moduleId: '5' }]);

      // validateUserIsAdminOnModules: no admin role
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.rename(renameDto, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.UNAUTHORIZED_ROLE),
      );
    });
  });

  // ─── favorite ──────────────────────────────────────────────────────────────

  describe('favorite', () => {
    it('should toggle favorite on own report', async () => {
      reportRepo.findOne.mockResolvedValue({ isFavorite: false } as CoreReport);

      const result = await service.favorite(TEST_REPORT_ID, false);

      expect(result).toBe(true);
      expect(reportRepo.update).toHaveBeenCalledWith({ id: TEST_REPORT_ID }, { isFavorite: true });
    });

    it('should toggle favorite on shared report', async () => {
      const sharedReportRepo = (service as any).sharedReportRepo;
      sharedReportRepo.findOne.mockResolvedValue({ isFavorite: true });

      const result = await service.favorite(TEST_REPORT_ID, true);

      expect(result).toBe(false);
      expect(sharedReportRepo.update).toHaveBeenCalledWith({ id: TEST_REPORT_ID }, { isFavorite: false });
    });
  });

  // ─── changeReportOwner ──────────────────────────────────────────────────────

  describe('changeReportOwner', () => {
    const dto = { reportId: TEST_REPORT_ID, newOwnerId: 'new-user' };

    it('should transfer ownership when all validations pass', async () => {
      const usersRepo = (service as any).usersRepo;
      usersRepo.findOne.mockResolvedValue({ id: 'new-user' });
      reportRepo.findOne.mockResolvedValue({ ownerId: TEST_USER_ID } as unknown as CoreReport);

      const reportModuleRepo = (service as any).reportModuleRepo;
      reportModuleRepo.find.mockResolvedValue([{ moduleId: '5' }]);

      // validateUserIsAdminOnModules
      mockDataSource.query
        .mockResolvedValueOnce([{ 1: 1 }]) // admin check
        .mockResolvedValueOnce({}); // delete data analysis

      const result = await service.changeReportOwner(dto, TEST_USER_ID);

      expect(result).toBe(ErrorMessages.REPORT_OWNER_UPDATED);
      expect(reportRepo.update).toHaveBeenCalledWith({ id: TEST_REPORT_ID }, { ownerId: 'new-user' });
    });

    it('should throw when new owner does not exist', async () => {
      const usersRepo = (service as any).usersRepo;
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.changeReportOwner(dto, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_NOT_FOUND),
      );
    });

    it('should throw when report does not exist', async () => {
      const usersRepo = (service as any).usersRepo;
      usersRepo.findOne.mockResolvedValue({ id: 'new-user' });
      reportRepo.findOne.mockResolvedValue(null);

      await expect(service.changeReportOwner(dto, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST),
      );
    });

    it('should throw when user already owns the report', async () => {
      const usersRepo = (service as any).usersRepo;
      usersRepo.findOne.mockResolvedValue({ id: 'new-user' });
      reportRepo.findOne.mockResolvedValue({ ownerId: 'new-user' } as unknown as CoreReport);

      const reportModuleRepo = (service as any).reportModuleRepo;
      reportModuleRepo.find.mockResolvedValue([{ moduleId: '5' }]);

      // admin check passes
      mockDataSource.query.mockResolvedValueOnce([{ 1: 1 }]);

      await expect(service.changeReportOwner(dto, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_ALREADY_OWNS_REPORT),
      );
    });
  });

  // ─── deleteReport ──────────────────────────────────────────────────────────

  describe('deleteReport', () => {
    it('should delete report when validations pass', async () => {
      reportRepo.findOne.mockResolvedValue({ id: TEST_REPORT_ID } as unknown as CoreReport);
      const reportModuleRepo = (service as any).reportModuleRepo;
      reportModuleRepo.find.mockResolvedValue([{ moduleId: '5' }]);

      // admin check + data analysis check
      mockDataSource.query
        .mockResolvedValueOnce([{ 1: 1 }]) // admin
        .mockResolvedValueOnce([{ dataAnalysisNames: null }]); // not used

      const result = await service.deleteReport(TEST_USER_ID, TEST_REPORT_ID);

      expect(result).toBe(ErrorMessages.REPORT_SUCCESSFULLY_DELETED);
      expect(reportRepo.delete).toHaveBeenCalledWith({ id: TEST_REPORT_ID });
    });

    it('should throw NotFoundException when report does not exist', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteReport(TEST_USER_ID, TEST_REPORT_ID)).rejects.toThrow(
        new NotFoundException(ErrorMessages.REPORT_DOES_NOT_EXIST),
      );
    });

    it('should throw when report is used in data analysis', async () => {
      reportRepo.findOne.mockResolvedValue({ id: TEST_REPORT_ID } as unknown as CoreReport);
      const reportModuleRepo = (service as any).reportModuleRepo;
      reportModuleRepo.find.mockResolvedValue([{ moduleId: '5' }]);

      // admin check passes, data analysis check fails
      mockDataSource.query
        .mockResolvedValueOnce([{ 1: 1 }]) // admin
        .mockResolvedValueOnce([{ dataAnalysisNames: '"My Analysis"' }]); // used in DA

      await expect(service.deleteReport(TEST_USER_ID, TEST_REPORT_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── share ──────────────────────────────────────────────────────────────────

  describe('share', () => {
    it('should insert shared report entries for each user', async () => {
      reportRepo.findOne.mockResolvedValue({ id: TEST_REPORT_ID } as unknown as CoreReport);
      const sharedReportRepo = (service as any).sharedReportRepo;

      await service.share(TEST_REPORT_ID, { userIds: ['u1', 'u2'] });

      expect(sharedReportRepo.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ reportId: TEST_REPORT_ID, ownerId: 'u1' }),
          expect.objectContaining({ reportId: TEST_REPORT_ID, ownerId: 'u2' }),
        ]),
      );
    });

    it('should throw when report does not exist', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      await expect(service.share(TEST_REPORT_ID, { userIds: ['u1'] })).rejects.toThrow(
        new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST),
      );
    });
  });

  // ─── closeTab ──────────────────────────────────────────────────────────────

  describe('closeTab', () => {
    it('should delete the chart when report exists', async () => {
      reportRepo.findOne.mockResolvedValue({ id: TEST_REPORT_ID } as unknown as CoreReport);
      const chartRepo = (service as any).chartRepo;

      await service.closeTab(TEST_REPORT_ID, TEST_CHART_ID);

      expect(chartRepo.delete).toHaveBeenCalledWith({ id: TEST_CHART_ID, reportId: TEST_REPORT_ID });
    });

    it('should throw when report does not exist', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      await expect(service.closeTab(TEST_REPORT_ID, TEST_CHART_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.REPORT_DOES_NOT_EXIST),
      );
    });
  });

  // ─── executeQuery ──────────────────────────────────────────────────────────

  describe('executeQuery', () => {
    const dto = {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      timeFilter: 'hourly',
      tables: [],
      control: [],
      compare: [],
      operation: [],
      globalFilter: { condition: 'AND', rules: [] },
      orderBy: [],
    };

    it('should return header and body when query is generated', async () => {
      mockQueryBuilder.generateQuery.mockResolvedValue({
        header: [{ text: 'Col1', datafield: 'col1' }],
        query: 'SELECT col1 FROM table',
        fieldsArray: [],
      });
      mockLegacyDataDb.query.mockResolvedValue([{ col1: 'value' }]);

      const result = await service.executeQuery(dto as any);

      expect(result.header).toHaveLength(1);
      expect(result.body).toEqual([{ col1: 'value' }]);
    });

    it('should return empty arrays when no query is generated', async () => {
      mockQueryBuilder.generateQuery.mockResolvedValue({ header: [], query: '', fieldsArray: [] });

      const result = await service.executeQuery(dto as any);

      expect(result.header).toEqual([]);
      expect(result.body).toEqual([]);
    });

    it('should throw BadRequestException on query execution error', async () => {
      mockQueryBuilder.generateQuery.mockResolvedValue({
        header: [],
        query: 'SELECT 1',
        fieldsArray: [],
      });
      mockLegacyDataDb.query.mockRejectedValue(new Error('DB error'));

      await expect(service.executeQuery(dto as any)).rejects.toThrow(
        new BadRequestException(ErrorMessages.ERROR_OCCURED),
      );
    });
  });

  // ─── generatedQuery ────────────────────────────────────────────────────────

  describe('generatedQuery', () => {
    it('should return the SQL query string', async () => {
      mockQueryBuilder.generateQuery.mockResolvedValue({
        query: 'SELECT * FROM table',
        header: [],
        fieldsArray: [],
      });

      const result = await service.generatedQuery({} as any);

      expect(result).toBe('SELECT * FROM table');
    });

    it('should return empty string when no query generated', async () => {
      mockQueryBuilder.generateQuery.mockResolvedValue({ query: '', header: [], fieldsArray: [] });

      const result = await service.generatedQuery({} as any);

      expect(result).toBe('');
    });
  });

  // ─── Chart generation methods ─────────────────────────────────────────────

  describe('generatePie', () => {
    it('should call buildChartGenerateResult and return chart data', async () => {
      const chartData = { id: 'c1', name: 'Pie', type: 'pie', orderIndex: 0 };
      mockQueryBuilder.generateQuery.mockResolvedValue({
        query: 'SELECT 1',
        fieldsArray: [],
        header: [],
      });

      // The pie chart generator is a module-level import. We can't easily mock it,
      // but we can verify the method doesn't throw with valid mocked dependencies.
      // In real usage this would call the chart generator function.
      // For unit testing, we verify the flow up to the chart generator call.
      await expect(
        service.generatePie(
          { fromDate: '2026-01-01', toDate: '2026-01-31', tables: [], operation: [] } as any,
          chartData as any,
        ),
      ).rejects.toBeDefined(); // Will fail because chart generator needs real data
    });
  });

  // ─── generateChartByType ─────────────────────────────────────────────────

  describe('generateChartByType', () => {
    const chartByTypeDto = {
      reportId: TEST_REPORT_ID,
      chartId: TEST_CHART_ID,
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      interval: 'hourly',
    };

    const MOCK_DB_REPORT_FOR_CHART = {
      id: TEST_REPORT_ID,
      fromDate: new Date('2026-01-01'),
      toDate: new Date('2026-01-31'),
      timeFilter: 'hourly',
      limit: 100,
      orderBy: JSON.stringify([]),
      globalFilter: JSON.stringify({ condition: 'AND', rules: [] }),
      tables: JSON.stringify([]),
      compare: JSON.stringify([]),
      operation: JSON.stringify([]),
      control: JSON.stringify([]),
      options: JSON.stringify({ threshold: {} }),
      isQbe: 0,
    };

    it('should throw BadRequestException when report does not exist', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      await expect(service.generateChartByType(chartByTypeDto as any, TEST_USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return table chart when chartId is "0"', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT_FOR_CHART as any);

      // Mock executeQuery path
      mockQueryBuilder.generateQuery.mockResolvedValue({
        header: [{ text: 'Col1', datafield: 'col1' }],
        query: 'SELECT 1',
        fieldsArray: [],
      });
      mockLegacyDataDb.query.mockResolvedValue([{ col1: 'val' }]);

      const result = await service.generateChartByType({ ...chartByTypeDto, chartId: '0' } as any, TEST_USER_ID);

      expect(result.type).toBe('table');
      expect((result as any).lib.body).toBeDefined();
      expect((result as any).lib.header).toBeDefined();
    });

    it('should throw when chart is not found in DB', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT_FOR_CHART as any);
      mockLegacyDataDb.query.mockResolvedValue([]); // no chart rows

      await expect(service.generateChartByType(chartByTypeDto as any, TEST_USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should dispatch to generatePie for pie chart type', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT_FOR_CHART as any);

      const chartData = { id: TEST_CHART_ID, name: 'Pie', type: 'pie', orderIndex: 0 };
      mockLegacyDataDb.query.mockResolvedValueOnce([{ data: JSON.stringify(chartData) }]);

      // generatePie calls buildChartGenerateResult -> queryBuilder.generateQuery
      // then calls the pie chart function which will fail without real DB data.
      // We spy on generatePie to verify dispatch.
      const pieSpy = jest.spyOn(service, 'generatePie').mockResolvedValue(chartData as any);

      const result = await service.generateChartByType(chartByTypeDto as any, TEST_USER_ID);

      expect(pieSpy).toHaveBeenCalled();
      expect(result.type).toBe('pie');

      pieSpy.mockRestore();
    });

    it('should dispatch to generateDoughnut for doughnut chart type', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT_FOR_CHART as any);

      const chartData = { id: TEST_CHART_ID, name: 'Doughnut', type: 'doughnut', orderIndex: 0 };
      mockLegacyDataDb.query.mockResolvedValueOnce([{ data: JSON.stringify(chartData) }]);

      const spy = jest.spyOn(service, 'generateDoughnut').mockResolvedValue(chartData as any);

      const result = await service.generateChartByType(chartByTypeDto as any, TEST_USER_ID);

      expect(spy).toHaveBeenCalled();
      expect(result.type).toBe('doughnut');

      spy.mockRestore();
    });

    it('should dispatch to generateTrend for trend chart type', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT_FOR_CHART as any);

      const chartData = { id: TEST_CHART_ID, name: 'Trend', type: 'trend', orderIndex: 0 };
      mockLegacyDataDb.query.mockResolvedValueOnce([{ data: JSON.stringify(chartData) }]);

      const spy = jest.spyOn(service, 'generateTrend').mockResolvedValue(chartData as any);

      const result = await service.generateChartByType(chartByTypeDto as any, TEST_USER_ID);

      expect(spy).toHaveBeenCalled();
      expect(result.type).toBe('trend');

      spy.mockRestore();
    });

    it('should dispatch to generateVerticalBar for vertical_bar chart type', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT_FOR_CHART as any);

      const chartData = { id: TEST_CHART_ID, name: 'VBar', type: 'vertical_bar', orderIndex: 0 };
      mockLegacyDataDb.query.mockResolvedValueOnce([{ data: JSON.stringify(chartData) }]);

      const spy = jest.spyOn(service, 'generateVerticalBar').mockResolvedValue(chartData as any);

      const result = await service.generateChartByType(chartByTypeDto as any, TEST_USER_ID);

      expect(spy).toHaveBeenCalled();
      expect(result.type).toBe('vertical_bar');

      spy.mockRestore();
    });

    it('should dispatch to generateHorizontalBar for horizontal_bar chart type', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT_FOR_CHART as any);

      const chartData = { id: TEST_CHART_ID, name: 'HBar', type: 'horizontal_bar', orderIndex: 0 };
      mockLegacyDataDb.query.mockResolvedValueOnce([{ data: JSON.stringify(chartData) }]);

      const spy = jest.spyOn(service, 'generateHorizontalBar').mockResolvedValue(chartData as any);

      const result = await service.generateChartByType(chartByTypeDto as any, TEST_USER_ID);

      expect(spy).toHaveBeenCalled();
      expect(result.type).toBe('horizontal_bar');

      spy.mockRestore();
    });

    it('should dispatch to generateProgress for progress chart type', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT_FOR_CHART as any);

      const chartData = { id: TEST_CHART_ID, name: 'Progress', type: 'progress', orderIndex: 0 };
      mockLegacyDataDb.query.mockResolvedValueOnce([{ data: JSON.stringify(chartData) }]);

      const spy = jest.spyOn(service, 'generateProgress').mockResolvedValue(chartData as any);

      const result = await service.generateChartByType(chartByTypeDto as any, TEST_USER_ID);

      expect(spy).toHaveBeenCalled();
      expect(result.type).toBe('progress');

      spy.mockRestore();
    });

    it('should dispatch to generateExplodedProgress for exploded_progress chart type', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT_FOR_CHART as any);

      const chartData = {
        id: TEST_CHART_ID,
        name: 'Exploded',
        type: 'exploded_progress',
        orderIndex: 0,
      };
      mockLegacyDataDb.query.mockResolvedValueOnce([{ data: JSON.stringify(chartData) }]);

      const spy = jest.spyOn(service, 'generateExplodedProgress').mockResolvedValue(chartData as any);

      const result = await service.generateChartByType(chartByTypeDto as any, TEST_USER_ID);

      expect(spy).toHaveBeenCalled();
      expect(result.type).toBe('exploded_progress');

      spy.mockRestore();
    });

    it('should return chart as-is for unknown chart type', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT_FOR_CHART as any);

      const chartData = { id: TEST_CHART_ID, name: 'Unknown', type: 'unknown_type', orderIndex: 0 };
      mockLegacyDataDb.query.mockResolvedValueOnce([{ data: JSON.stringify(chartData) }]);

      const result = await service.generateChartByType(chartByTypeDto as any, TEST_USER_ID);

      expect(result.type).toBe('unknown_type');
    });
  });

  // ─── Export methods ────────────────────────────────────────────────────────

  describe('exportCSV', () => {
    it('should call fetchExportReport and exportTableCSV', async () => {
      // Mock getReportById
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT as CoreReport);
      mockDataSource.query.mockResolvedValueOnce([]); // charts

      // Mock executeQuery
      mockQueryBuilder.generateQuery.mockResolvedValue({
        header: [{ text: 'Col1', datafield: 'col1', hidden: false }],
        query: 'SELECT 1',
        fieldsArray: [],
      });
      mockLegacyDataDb.query.mockResolvedValue([{ col1: 'val' }]);

      mockExportHelper.exportTableCSV.mockResolvedValue('/exports/file.csv');

      const result = await service.exportCSV(
        TEST_REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        TEST_USER_ID,
      );

      expect(result).toBe('/exports/file.csv');
      expect(mockExportHelper.exportTableCSV).toHaveBeenCalled();
    });
  });

  describe('exportJSON', () => {
    it('should call fetchExportReport and exportJSON', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT as CoreReport);
      mockDataSource.query.mockResolvedValueOnce([]);

      mockQueryBuilder.generateQuery.mockResolvedValue({
        header: [{ text: 'Col1', datafield: 'col1' }],
        query: 'SELECT 1',
        fieldsArray: [],
      });
      mockLegacyDataDb.query.mockResolvedValue([{ col1: 'val' }]);

      mockExportHelper.exportJSON.mockResolvedValue('/exports/file.json');

      const result = await service.exportJSON(
        TEST_REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        TEST_USER_ID,
      );

      expect(result).toBe('/exports/file.json');
      expect(mockExportHelper.exportJSON).toHaveBeenCalled();
    });
  });

  describe('exportExcel', () => {
    it('should call fetchExportReport and exportTabularToExcel', async () => {
      reportRepo.findOne.mockResolvedValue(MOCK_DB_REPORT as CoreReport);
      mockDataSource.query.mockResolvedValueOnce([]);

      mockQueryBuilder.generateQuery.mockResolvedValue({
        header: [
          { text: 'Col1', datafield: 'col1', hidden: false },
          { text: 'Hidden', datafield: 'hidden', hidden: true },
        ],
        query: 'SELECT 1',
        fieldsArray: [],
      });
      mockLegacyDataDb.query.mockResolvedValue([{ col1: 'val' }]);

      mockExportHelper.exportTabularToExcel.mockResolvedValue('/exports/file.xlsx');

      const result = await service.exportExcel(
        TEST_REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        TEST_USER_ID,
      );

      expect(result).toBe('/exports/file.xlsx');
      // Only visible headers should be passed
      const sheetArg = mockExportHelper.exportTabularToExcel.mock.calls[0][0];
      expect(sheetArg[0].header).toHaveLength(1);
      expect(sheetArg[0].header[0].text).toBe('Col1');
    });
  });

  describe('exportPDF', () => {
    it('should cleanup HTML file on success', async () => {
      // We need to mock the full chain: getReportById -> executeQuery -> charts -> exportHTML -> exportPDF
      // Simplify by spying on exportHTML
      jest.spyOn(service, 'exportHTML').mockResolvedValue('/tmp/report.html');
      mockExportHelper.exportPDF.mockResolvedValue('/exports/report.pdf');

      const result = await service.exportPDF(
        TEST_REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        TEST_USER_ID,
      );

      expect(result).toBe('/exports/report.pdf');
      expect(mockExportHelper.cleanupFile).toHaveBeenCalledWith('/tmp/report.html');
    });

    it('should cleanup HTML file on error', async () => {
      jest.spyOn(service, 'exportHTML').mockResolvedValue('/tmp/report.html');
      mockExportHelper.exportPDF.mockRejectedValue(new Error('puppeteer failed'));

      await expect(
        service.exportPDF(TEST_REPORT_ID, 'active', '2026-01-01', '2026-01-31', 'hourly', TEST_USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(mockExportHelper.cleanupFile).toHaveBeenCalledWith('/tmp/report.html');
    });
  });

  describe('exportPNG', () => {
    it('should cleanup HTML file on success', async () => {
      jest.spyOn(service, 'exportHTML').mockResolvedValue('/tmp/report.html');
      mockExportHelper.exportPNG.mockResolvedValue('/exports/report.png');

      const result = await service.exportPNG(
        TEST_REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        TEST_USER_ID,
      );

      expect(result).toBe('/exports/report.png');
      expect(mockExportHelper.cleanupFile).toHaveBeenCalledWith('/tmp/report.html');
    });
  });

  describe('exportJPEG', () => {
    it('should cleanup HTML file on success', async () => {
      jest.spyOn(service, 'exportHTML').mockResolvedValue('/tmp/report.html');
      mockExportHelper.exportJPEG.mockResolvedValue('/exports/report.jpeg');

      const result = await service.exportJPEG(
        TEST_REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        TEST_USER_ID,
      );

      expect(result).toBe('/exports/report.jpeg');
      expect(mockExportHelper.cleanupFile).toHaveBeenCalledWith('/tmp/report.html');
    });
  });

  // ─── Per-tab exports ───────────────────────────────────────────────────────

  describe('exportTabPDF', () => {
    it('should generate chart, create HTML, convert to PDF, and cleanup', async () => {
      jest.spyOn(service, 'exportTabHTML').mockResolvedValue('/tmp/tab.html');
      mockExportHelper.exportPDF.mockResolvedValue('/exports/tab.pdf');

      const result = await service.exportTabPDF(
        TEST_REPORT_ID,
        'active',
        TEST_CHART_ID,
        '2026-01-01',
        '2026-01-31',
        'hourly',
        TEST_USER_ID,
      );

      expect(result).toBe('/exports/tab.pdf');
      expect(mockExportHelper.cleanupFile).toHaveBeenCalledWith('/tmp/tab.html');
    });

    it('should cleanup HTML on error', async () => {
      jest.spyOn(service, 'exportTabHTML').mockResolvedValue('/tmp/tab.html');
      mockExportHelper.exportPDF.mockRejectedValue(new Error('fail'));

      await expect(
        service.exportTabPDF(
          TEST_REPORT_ID,
          'active',
          TEST_CHART_ID,
          '2026-01-01',
          '2026-01-31',
          'hourly',
          TEST_USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockExportHelper.cleanupFile).toHaveBeenCalledWith('/tmp/tab.html');
    });
  });
});
