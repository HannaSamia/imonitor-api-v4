import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataAnalysisService } from './data-analysis.service';
import { CoreDataAnalysis } from '../../database/entities/core-data-analysis.entity';
import { CoreDataAnalysisChart } from '../../database/entities/core-data-analysis-chart.entity';
import { CoreDataAnalysisReport } from '../../database/entities/core-data-analysis-report.entity';
import { CoreSharedDataAnalysis } from '../../database/entities/core-shared-data-analysis.entity';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportCharts } from '../../database/entities/core-report-charts.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ExportHelperService } from '../../shared/services/export-helper.service';
import { ReportsService } from '../reports/reports.service';
import { ErrorMessages } from '../../shared/constants/error-messages';

const TEST_USER_ID = 'user-1';
const TEST_DA_ID = 'da-1';
const TEST_REPORT_ID = 'report-1';
const TEST_CHART_ID = 'chart-1';
const TEST_SHARED_DA_ID = 'shared-da-1';

function createMockQueryBuilder(existsResult: boolean) {
  return {
    where: jest.fn().mockReturnThis(),
    getExists: jest.fn().mockResolvedValue(existsResult),
  };
}

describe('DataAnalysisService', () => {
  let service: DataAnalysisService;
  let daRepo: any;
  let daChartRepo: any;
  let daReportRepo: any;
  let sharedDaRepo: any;
  let reportRepo: any;
  let reportChartsRepo: any;
  let mockDataSource: any;
  let mockReportsService: any;
  let mockExportHelper: any;

  beforeEach(async () => {
    daRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn(),
    };

    daChartRepo = {};
    daReportRepo = {};

    sharedDaRepo = {
      findOne: jest.fn(),
      insert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };

    reportRepo = {
      findOne: jest.fn(),
    };

    reportChartsRepo = {
      findOne: jest.fn(),
    };

    const mockManager = {
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      insert: jest.fn().mockResolvedValue({}),
    };

    mockDataSource = {
      query: jest.fn().mockResolvedValue({}),
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockManager)),
    };

    mockReportsService = {
      duplicate: jest.fn(),
      cleanReports: jest.fn().mockResolvedValue(undefined),
      generateChartByType: jest.fn().mockResolvedValue({ name: 'Chart', type: 'trend', header: [], body: [] }),
    };

    mockExportHelper = {
      getExportCdns: jest.fn().mockReturnValue({ js: [], css: [] }),
      exportHtml: jest.fn().mockResolvedValue('/tmp/export.html'),
      exportPDF: jest.fn().mockResolvedValue('/tmp/export.pdf'),
      exportTabularToExcel: jest.fn().mockResolvedValue('/tmp/export.xlsx'),
      cleanupFile: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataAnalysisService,
        { provide: getRepositoryToken(CoreDataAnalysis), useValue: daRepo },
        { provide: getRepositoryToken(CoreDataAnalysisChart), useValue: daChartRepo },
        { provide: getRepositoryToken(CoreDataAnalysisReport), useValue: daReportRepo },
        { provide: getRepositoryToken(CoreSharedDataAnalysis), useValue: sharedDaRepo },
        { provide: getRepositoryToken(CoreReport), useValue: reportRepo },
        { provide: getRepositoryToken(CoreReportCharts), useValue: reportChartsRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: DateHelperService, useValue: { formatDate: jest.fn().mockReturnValue('2026-03-07 10:00:00') } },
        { provide: ExportHelperService, useValue: mockExportHelper },
        { provide: ReportsService, useValue: mockReportsService },
      ],
    }).compile();

    service = module.get(DataAnalysisService);
  });

  describe('save', () => {
    it('should create a data analysis and return its ID', async () => {
      reportRepo.findOne.mockResolvedValue({ id: TEST_REPORT_ID });
      reportChartsRepo.findOne.mockResolvedValue({ id: TEST_CHART_ID });

      const result = await service.save(
        {
          name: 'New DA',
          charts: [{ chartId: TEST_CHART_ID, reportId: TEST_REPORT_ID, cols: 6, rows: 4, x: 0, y: 0 }],
        },
        TEST_USER_ID,
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should throw if report does not exist', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      await expect(
        service.save(
          {
            name: 'New DA',
            charts: [{ chartId: TEST_CHART_ID, reportId: 'nonexistent', cols: 6, rows: 4, x: 0, y: 0 }],
          },
          TEST_USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if chart does not exist', async () => {
      reportRepo.findOne.mockResolvedValue({ id: TEST_REPORT_ID });
      reportChartsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.save(
          {
            name: 'New DA',
            charts: [{ chartId: 'nonexistent', reportId: TEST_REPORT_ID, cols: 6, rows: 4, x: 0, y: 0 }],
          },
          TEST_USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should skip chart validation for REPORT_TABLE_ID (tabular)', async () => {
      reportRepo.findOne.mockResolvedValue({ id: TEST_REPORT_ID });

      const result = await service.save(
        {
          name: 'Tabular DA',
          charts: [{ chartId: '0', reportId: TEST_REPORT_ID, cols: 12, rows: 6, x: 0, y: 0 }],
        },
        TEST_USER_ID,
      );

      expect(result).toBeDefined();
      expect(reportChartsRepo.findOne).not.toHaveBeenCalled();
    });

    it('should skip validation for title widgets', async () => {
      const result = await service.save(
        {
          name: 'Title DA',
          charts: [{ chartId: 'any', reportId: 'any', cols: 12, rows: 2, x: 0, y: 0, isTitle: true, value: 'Section' }],
        },
        TEST_USER_ID,
      );

      expect(result).toBeDefined();
      expect(reportRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update data analysis', async () => {
      daRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(true));
      reportRepo.findOne.mockResolvedValue({ id: TEST_REPORT_ID });
      reportChartsRepo.findOne.mockResolvedValue({ id: TEST_CHART_ID });

      await service.update(
        {
          id: TEST_DA_ID,
          name: 'Updated DA',
          charts: [{ chartId: TEST_CHART_ID, reportId: TEST_REPORT_ID, cols: 6, rows: 4, x: 0, y: 0 }],
        },
        TEST_USER_ID,
      );

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should throw if data analysis does not exist', async () => {
      daRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(false));

      await expect(service.update({ id: 'nonexistent', name: 'X', charts: [] }, TEST_USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('list', () => {
    it('should return data analyses for current user', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: TEST_DA_ID,
            name: 'My DA',
            ownerId: TEST_USER_ID,
            isFavorite: false,
            owner: 'admin',
            isShared: true,
            createdAt: '2026-03-07 10:00',
            updatedAt: null,
            isDefault: false,
          },
        ])
        .mockResolvedValueOnce([{ privilegedTables: '"table-1"' }]);

      const result = await service.list(TEST_USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(TEST_DA_ID);
    });

    it('should filter out data analyses without privilege', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: TEST_DA_ID,
            name: 'Restricted DA',
            ownerId: TEST_USER_ID,
            isFavorite: false,
            owner: 'admin',
            isShared: false,
            createdAt: '2026-03-07 10:00',
            updatedAt: null,
            isDefault: false,
          },
        ])
        .mockResolvedValueOnce([{ privilegedTables: '"table-1"' }])
        // Batch used tables query — returns a table the user doesn't have access to
        .mockResolvedValueOnce([{ dataAnalysisId: TEST_DA_ID, tableId: 'table-999' }]);

      const result = await service.list(TEST_USER_ID);

      expect(result).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('should return data analysis with parsed charts', async () => {
      daRepo.findOne.mockResolvedValue({
        name: 'Test DA',
        ownerId: TEST_USER_ID,
        options: JSON.stringify([{ chartId: TEST_CHART_ID, reportId: TEST_REPORT_ID }]),
        isDefault: false,
      });

      const result = await service.getById(TEST_DA_ID);

      expect(result.name).toBe('Test DA');
      expect(result.charts).toHaveLength(1);
      expect(result.charts[0].chartId).toBe(TEST_CHART_ID);
    });

    it('should throw if data analysis does not exist', async () => {
      daRepo.findOne.mockResolvedValue(null);

      await expect(service.getById('nonexistent')).rejects.toThrow(BadRequestException);
    });
  });

  describe('share', () => {
    it('should share data analysis with users', async () => {
      daRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(true));

      await service.share(TEST_DA_ID, ['user-2', 'user-3']);

      expect(sharedDaRepo.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ dataAnalysisId: TEST_DA_ID, ownerId: 'user-2' }),
          expect.objectContaining({ dataAnalysisId: TEST_DA_ID, ownerId: 'user-3' }),
        ]),
      );
    });

    it('should throw if data analysis does not exist', async () => {
      daRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(false));

      await expect(service.share('nonexistent', ['user-2'])).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSharedById', () => {
    it('should return shared data analysis', async () => {
      mockDataSource.query.mockResolvedValue([
        {
          id: TEST_SHARED_DA_ID,
          dataAnalysisId: TEST_DA_ID,
          ownerId: TEST_USER_ID,
          name: 'Shared DA',
          options: JSON.stringify([{ chartId: TEST_CHART_ID, reportId: TEST_REPORT_ID }]),
          isDefault: false,
        },
      ]);

      const result = await service.getSharedById(TEST_SHARED_DA_ID);

      expect(result.name).toBe('Shared DA');
      expect(result.charts).toHaveLength(1);
    });

    it('should throw if shared data analysis not found', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await expect(service.getSharedById('nonexistent')).rejects.toThrow(BadRequestException);
    });
  });

  describe('favorite', () => {
    it('should toggle favorite on owned data analysis', async () => {
      daRepo.findOne.mockResolvedValue({ isFavorite: false });

      const result = await service.favorite(TEST_DA_ID, false);

      expect(result).toBe(true);
      expect(daRepo.update).toHaveBeenCalledWith({ id: TEST_DA_ID }, { isFavorite: true });
    });

    it('should toggle favorite on shared data analysis', async () => {
      sharedDaRepo.findOne.mockResolvedValue({ isFavorite: true });

      const result = await service.favorite(TEST_SHARED_DA_ID, true);

      expect(result).toBe(false);
      expect(sharedDaRepo.update).toHaveBeenCalledWith({ id: TEST_SHARED_DA_ID }, { isFavorite: false });
    });
  });

  describe('saveShared', () => {
    it('should duplicate shared data analysis with reports', async () => {
      // Mock getSharedById
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: TEST_SHARED_DA_ID,
            dataAnalysisId: TEST_DA_ID,
            ownerId: TEST_USER_ID,
            name: 'Shared DA',
            options: JSON.stringify([
              { chartId: TEST_CHART_ID, reportId: TEST_REPORT_ID, cols: 6, rows: 4, x: 0, y: 0 },
            ]),
            isDefault: false,
          },
        ])
        // Mock privilege check queries
        .mockResolvedValueOnce([{ privilegedTables: '"table-1"' }])
        .mockResolvedValueOnce([{ usedTables: '"table-1"' }]);

      // checkUsedTablesPrivilege shared record lookup via TypeORM
      sharedDaRepo.findOne.mockResolvedValue({ dataAnalysisId: TEST_DA_ID });

      mockReportsService.duplicate.mockResolvedValue({
        reportId: 'dup-report-1',
        charts: { [TEST_CHART_ID]: 'dup-chart-1' },
      });

      const result = await service.saveShared(TEST_SHARED_DA_ID, TEST_USER_ID);

      expect(result).toBeDefined();
      expect(mockReportsService.duplicate).toHaveBeenCalledWith(TEST_REPORT_ID, TEST_USER_ID);
      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should rollback duplicated reports if report not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: TEST_SHARED_DA_ID,
          dataAnalysisId: TEST_DA_ID,
          ownerId: TEST_USER_ID,
          name: 'Shared DA',
          options: JSON.stringify([{ chartId: TEST_CHART_ID, reportId: TEST_REPORT_ID, cols: 6, rows: 4, x: 0, y: 0 }]),
          isDefault: false,
        },
      ]);

      mockReportsService.duplicate.mockResolvedValue(null);

      await expect(service.saveShared(TEST_SHARED_DA_ID, TEST_USER_ID)).rejects.toThrow(BadRequestException);
      expect(mockReportsService.cleanReports).toHaveBeenCalled();
    });
  });

  describe('saveDefault', () => {
    it('should duplicate default data analysis', async () => {
      daRepo.findOne.mockResolvedValue({
        name: 'Default DA',
        ownerId: 'admin',
        options: JSON.stringify([{ chartId: TEST_CHART_ID, reportId: TEST_REPORT_ID, cols: 6, rows: 4, x: 0, y: 0 }]),
        isDefault: true,
      });

      mockReportsService.duplicate.mockResolvedValue({
        reportId: 'dup-report-1',
        charts: { [TEST_CHART_ID]: 'dup-chart-1' },
      });

      // Privilege check
      mockDataSource.query
        .mockResolvedValueOnce([{ privilegedTables: '"table-1"' }])
        .mockResolvedValueOnce([{ usedTables: '"table-1"' }]);

      const result = await service.saveDefault(TEST_DA_ID, TEST_USER_ID);

      expect(result).toBeDefined();
      expect(mockReportsService.duplicate).toHaveBeenCalled();
      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should throw if data analysis is not default', async () => {
      daRepo.findOne.mockResolvedValue({
        name: 'Non-Default DA',
        ownerId: TEST_USER_ID,
        options: '[]',
        isDefault: false,
      });

      await expect(service.saveDefault(TEST_DA_ID, TEST_USER_ID)).rejects.toThrow(
        ErrorMessages.DATA_ANALYSIS_NOT_DEFAULT,
      );
    });
  });

  describe('exportHtml', () => {
    it('should generate HTML export', async () => {
      daRepo.findOne.mockResolvedValue({
        name: 'Export DA',
        ownerId: TEST_USER_ID,
        options: JSON.stringify([{ chartId: TEST_CHART_ID, reportId: TEST_REPORT_ID, cols: 6, rows: 4, x: 0, y: 0 }]),
        isDefault: false,
      });

      const result = await service.exportHtml(TEST_DA_ID, 'saved', '2026-01-01', '2026-03-01', 'daily', TEST_USER_ID);

      expect(result).toBe('/tmp/export.html');
      expect(mockReportsService.generateChartByType).toHaveBeenCalled();
      expect(mockExportHelper.exportHtml).toHaveBeenCalled();
    });
  });

  describe('exportPdf', () => {
    it('should generate PDF export via HTML', async () => {
      daRepo.findOne.mockResolvedValue({
        name: 'Export DA',
        ownerId: TEST_USER_ID,
        options: JSON.stringify([{ chartId: TEST_CHART_ID, reportId: TEST_REPORT_ID, cols: 6, rows: 4, x: 0, y: 0 }]),
        isDefault: false,
      });

      const result = await service.exportPdf(TEST_DA_ID, 'saved', '2026-01-01', '2026-03-01', 'daily', TEST_USER_ID);

      expect(result).toBe('/tmp/export.pdf');
      expect(mockExportHelper.exportPDF).toHaveBeenCalled();
      expect(mockExportHelper.cleanupFile).toHaveBeenCalled();
    });
  });

  describe('exportExcel', () => {
    it('should generate Excel export', async () => {
      daRepo.findOne.mockResolvedValue({
        name: 'Export DA',
        ownerId: TEST_USER_ID,
        options: JSON.stringify([{ chartId: TEST_CHART_ID, reportId: TEST_REPORT_ID, cols: 6, rows: 4, x: 0, y: 0 }]),
        isDefault: false,
      });

      const result = await service.exportExcel(TEST_DA_ID, 'saved', '2026-01-01', '2026-03-01', 'daily', TEST_USER_ID);

      expect(result).toBe('/tmp/export.xlsx');
      expect(mockReportsService.generateChartByType).toHaveBeenCalled();
      expect(mockExportHelper.exportTabularToExcel).toHaveBeenCalled();
    });
  });
});
