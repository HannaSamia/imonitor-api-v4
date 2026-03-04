import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';

// ─── Mock Service ─────────────────────────────────────────────────────────

const mockReportsService = {
  privilegedStatisticTables: jest.fn(),
  list: jest.fn(),
  getSharedReportById: jest.fn(),
  getReportById: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  rename: jest.fn(),
  favorite: jest.fn(),
  changeReportOwner: jest.fn(),
  deleteReport: jest.fn(),
  share: jest.fn(),
  saveSharedReport: jest.fn(),
  closeTab: jest.fn(),
  executeQuery: jest.fn(),
  generatedQuery: jest.fn(),
  generatePie: jest.fn(),
  generateDoughnut: jest.fn(),
  generateTrend: jest.fn(),
  generateVerticalBar: jest.fn(),
  generateHorizontalBar: jest.fn(),
  generateProgress: jest.fn(),
  generateExplodedProgress: jest.fn(),
  generateChartByType: jest.fn(),
  exportCSV: jest.fn(),
  exportJSON: jest.fn(),
  exportHTML: jest.fn(),
  exportPDF: jest.fn(),
  exportPNG: jest.fn(),
  exportJPEG: jest.fn(),
  exportExcel: jest.fn(),
  exportTabHTML: jest.fn(),
  exportTabPDF: jest.fn(),
  exportTabPNG: jest.fn(),
  exportTabJPEG: jest.fn(),
};

// ─── Test Data ────────────────────────────────────────────────────────────

const USER_ID = 'user-123';
const REPORT_ID = 'report-456';
const CHART_ID = 'chart-789';

const EXPORT_PARAMS = {
  reportId: REPORT_ID,
  status: 'active',
  fromdate: '2026-01-01',
  todate: '2026-01-31',
  interval: 'hourly',
};

const TAB_EXPORT_PARAMS = {
  ...EXPORT_PARAMS,
  chartId: CHART_ID,
};

// ─── Test Suite ───────────────────────────────────────────────────────────

describe('ReportsController', () => {
  let controller: ReportsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockReportsService }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── CRUD & Sharing ─────────────────────────────────────────────────────

  describe('getPrivilegedTables', () => {
    it('should delegate to service.privilegedStatisticTables', () => {
      controller.getPrivilegedTables(USER_ID);
      expect(mockReportsService.privilegedStatisticTables).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('userReports', () => {
    it('should delegate to service.list', () => {
      controller.userReports(USER_ID);
      expect(mockReportsService.list).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('getSharedReportById', () => {
    it('should delegate to service.getSharedReportById with id and userId', () => {
      controller.getSharedReportById('shared-1', USER_ID);
      expect(mockReportsService.getSharedReportById).toHaveBeenCalledWith('shared-1', USER_ID);
    });
  });

  describe('getReportById', () => {
    it('should delegate to service.getReportById with id and userId', () => {
      controller.getReportById(REPORT_ID, USER_ID);
      expect(mockReportsService.getReportById).toHaveBeenCalledWith(REPORT_ID, USER_ID);
    });
  });

  describe('save', () => {
    it('should delegate to service.save with dto and userId', () => {
      const dto = { name: 'Test' } as any;
      controller.save(dto, USER_ID);
      expect(mockReportsService.save).toHaveBeenCalledWith(dto, USER_ID);
    });
  });

  describe('update', () => {
    it('should delegate to service.update with dto and userId', () => {
      const dto = { id: REPORT_ID, name: 'Updated' } as any;
      controller.update(dto, USER_ID);
      expect(mockReportsService.update).toHaveBeenCalledWith(dto, USER_ID);
    });
  });

  describe('rename', () => {
    it('should delegate to service.rename with dto and userId', () => {
      const dto = { reportId: REPORT_ID, name: 'New Name' } as any;
      controller.rename(dto, USER_ID);
      expect(mockReportsService.rename).toHaveBeenCalledWith(dto, USER_ID);
    });
  });

  describe('favorite', () => {
    it('should delegate to service.favorite with id and isShared=true', () => {
      controller.favorite(REPORT_ID, 'true');
      expect(mockReportsService.favorite).toHaveBeenCalledWith(REPORT_ID, true);
    });

    it('should pass isShared=false when query param is not "true"', () => {
      controller.favorite(REPORT_ID, 'false');
      expect(mockReportsService.favorite).toHaveBeenCalledWith(REPORT_ID, false);
    });
  });

  describe('changeReportOwner', () => {
    it('should delegate to service.changeReportOwner with dto and userId', () => {
      const dto = { reportId: REPORT_ID, newOwnerId: 'user-2' } as any;
      controller.changeReportOwner(dto, USER_ID);
      expect(mockReportsService.changeReportOwner).toHaveBeenCalledWith(dto, USER_ID);
    });
  });

  describe('deleteReport', () => {
    it('should delegate to service.deleteReport with userId and id', () => {
      controller.deleteReport(REPORT_ID, USER_ID);
      expect(mockReportsService.deleteReport).toHaveBeenCalledWith(USER_ID, REPORT_ID);
    });
  });

  describe('shareReport', () => {
    it('should delegate to service.share with id and dto', () => {
      const dto = { userIds: ['u1', 'u2'] } as any;
      controller.shareReport(REPORT_ID, dto);
      expect(mockReportsService.share).toHaveBeenCalledWith(REPORT_ID, dto);
    });
  });

  describe('saveSharedReport', () => {
    it('should delegate to service.saveSharedReport with id and userId', () => {
      controller.saveSharedReport('shared-1', USER_ID);
      expect(mockReportsService.saveSharedReport).toHaveBeenCalledWith('shared-1', USER_ID);
    });
  });

  describe('closeTab', () => {
    it('should delegate to service.closeTab with reportId and chartId', () => {
      controller.closeTab(REPORT_ID, CHART_ID);
      expect(mockReportsService.closeTab).toHaveBeenCalledWith(REPORT_ID, CHART_ID);
    });
  });

  // ─── Chart Generation ───────────────────────────────────────────────────

  describe('tabular', () => {
    it('should delegate to service.executeQuery', () => {
      const dto = { fromDate: '2026-01-01' } as any;
      controller.tabular(dto);
      expect(mockReportsService.executeQuery).toHaveBeenCalledWith(dto);
    });
  });

  describe('generatedQuery', () => {
    it('should delegate to service.generatedQuery', () => {
      const dto = { fromDate: '2026-01-01' } as any;
      controller.generatedQuery(dto);
      expect(mockReportsService.generatedQuery).toHaveBeenCalledWith(dto);
    });
  });

  describe('pie', () => {
    it('should delegate to service.generatePie with tabular and chart', () => {
      const dto = { tabular: { fromDate: '2026-01-01' }, chart: { id: 'c1' } } as any;
      controller.pie(dto);
      expect(mockReportsService.generatePie).toHaveBeenCalledWith(dto.tabular, dto.chart);
    });
  });

  describe('doughnut', () => {
    it('should delegate to service.generateDoughnut with tabular and chart', () => {
      const dto = { tabular: { fromDate: '2026-01-01' }, chart: { id: 'c1' } } as any;
      controller.doughnut(dto);
      expect(mockReportsService.generateDoughnut).toHaveBeenCalledWith(dto.tabular, dto.chart);
    });
  });

  describe('trend', () => {
    it('should delegate to service.generateTrend with tabular and chart', () => {
      const dto = { tabular: { fromDate: '2026-01-01' }, chart: { id: 'c1' } } as any;
      controller.trend(dto);
      expect(mockReportsService.generateTrend).toHaveBeenCalledWith(dto.tabular, dto.chart);
    });
  });

  describe('verticalChart', () => {
    it('should delegate to service.generateVerticalBar', () => {
      const dto = { tabular: { fromDate: '2026-01-01' }, chart: { id: 'c1' } } as any;
      controller.verticalChart(dto);
      expect(mockReportsService.generateVerticalBar).toHaveBeenCalledWith(dto.tabular, dto.chart);
    });
  });

  describe('horizontalChart', () => {
    it('should delegate to service.generateHorizontalBar', () => {
      const dto = { tabular: { fromDate: '2026-01-01' }, chart: { id: 'c1' } } as any;
      controller.horizontalChart(dto);
      expect(mockReportsService.generateHorizontalBar).toHaveBeenCalledWith(dto.tabular, dto.chart);
    });
  });

  describe('progress', () => {
    it('should delegate to service.generateProgress', () => {
      const dto = { tabular: { fromDate: '2026-01-01' }, chart: { id: 'c1' } } as any;
      controller.progress(dto);
      expect(mockReportsService.generateProgress).toHaveBeenCalledWith(dto.tabular, dto.chart);
    });
  });

  describe('explodedProgress', () => {
    it('should delegate to service.generateExplodedProgress', () => {
      const dto = { tabular: { fromDate: '2026-01-01' }, chart: { id: 'c1' } } as any;
      controller.explodedProgress(dto);
      expect(mockReportsService.generateExplodedProgress).toHaveBeenCalledWith(dto.tabular, dto.chart);
    });
  });

  describe('generateChartByType', () => {
    it('should delegate to service.generateChartByType with dto and userId', () => {
      const dto = { reportId: REPORT_ID, chartId: CHART_ID } as any;
      controller.generateChartByType(dto, USER_ID);
      expect(mockReportsService.generateChartByType).toHaveBeenCalledWith(dto, USER_ID);
    });
  });

  // ─── Full Report Exports ────────────────────────────────────────────────

  describe('exportTableCSV', () => {
    it('should delegate to service.exportCSV with correct params', () => {
      controller.exportTableCSV(EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportCSV).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });

  describe('exportTableJSON', () => {
    it('should delegate to service.exportJSON with correct params', () => {
      controller.exportTableJSON(EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportJSON).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });

  describe('exportReportHTML', () => {
    it('should delegate to service.exportHTML with correct params', () => {
      controller.exportReportHTML(EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportHTML).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });

  describe('exportReportPDF', () => {
    it('should delegate to service.exportPDF with correct params', () => {
      controller.exportReportPDF(EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportPDF).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });

  describe('exportReportPNG', () => {
    it('should delegate to service.exportPNG with correct params', () => {
      controller.exportReportPNG(EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportPNG).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });

  describe('exportReportJPEG', () => {
    it('should delegate to service.exportJPEG with correct params', () => {
      controller.exportReportJPEG(EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportJPEG).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });

  describe('exportExcel', () => {
    it('should delegate to service.exportExcel with correct params', () => {
      controller.exportExcel(EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportExcel).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });

  // ─── Per-Tab Exports ────────────────────────────────────────────────────

  describe('exportTabHTML', () => {
    it('should delegate to service.exportTabHTML with correct params', () => {
      controller.exportTabHTML(TAB_EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportTabHTML).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        CHART_ID,
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });

  describe('exportTabPDF', () => {
    it('should delegate to service.exportTabPDF with correct params', () => {
      controller.exportTabPDF(TAB_EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportTabPDF).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        CHART_ID,
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });

  describe('exportTabPNG', () => {
    it('should delegate to service.exportTabPNG with correct params', () => {
      controller.exportTabPNG(TAB_EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportTabPNG).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        CHART_ID,
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });

  describe('exportTabJPEG', () => {
    it('should delegate to service.exportTabJPEG with correct params', () => {
      controller.exportTabJPEG(TAB_EXPORT_PARAMS as any, USER_ID);
      expect(mockReportsService.exportTabJPEG).toHaveBeenCalledWith(
        REPORT_ID,
        'active',
        CHART_ID,
        '2026-01-01',
        '2026-01-31',
        'hourly',
        USER_ID,
      );
    });
  });
});
