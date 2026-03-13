import { Test, TestingModule } from '@nestjs/testing';
import { BulkEdaReportController } from './bulk-eda-report.controller';
import { BulkEdaReportService } from './bulk-eda-report.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';

const mockBulkEdaReportService = {
  list: jest.fn(),
  uploadCSV: jest.fn(),
  download: jest.fn(),
  delete: jest.fn(),
};

const TEST_USER_ID = 'user-1';
const TEST_PROCESS_ID = 'process-abc-123';

describe('BulkEdaReportController', () => {
  let controller: BulkEdaReportController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BulkEdaReportController],
      providers: [{ provide: BulkEdaReportService, useValue: mockBulkEdaReportService }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BulkEdaReportController>(BulkEdaReportController);
  });

  describe('list()', () => {
    it('should return the list of EDA bulk processes', async () => {
      const records = [{ id: TEST_PROCESS_ID, name: 'test.csv', status: 'finished' }];
      mockBulkEdaReportService.list.mockResolvedValue(records);

      const result = await controller.list();

      expect(result).toEqual(records);
      expect(mockBulkEdaReportService.list).toHaveBeenCalled();
    });
  });

  describe('uploadCSV()', () => {
    it('should upload CSV and return the process ID', async () => {
      const mockFile = { originalname: 'test.csv', buffer: Buffer.from('') } as Express.Multer.File;
      mockBulkEdaReportService.uploadCSV.mockResolvedValue(TEST_PROCESS_ID);

      const result = await controller.uploadCSV(mockFile, TEST_USER_ID);

      expect(result).toBe(TEST_PROCESS_ID);
      expect(mockBulkEdaReportService.uploadCSV).toHaveBeenCalledWith(TEST_USER_ID, mockFile);
    });
  });

  describe('download()', () => {
    it('should resolve the file path and call res.download', async () => {
      const filePath = '/some/path/output.xlsx';
      mockBulkEdaReportService.download.mockResolvedValue(filePath);
      const mockRes = { download: jest.fn() };

      await controller.download(TEST_PROCESS_ID, 'out', mockRes as any);

      expect(mockBulkEdaReportService.download).toHaveBeenCalledWith(TEST_PROCESS_ID, 'out');
      expect(mockRes.download).toHaveBeenCalledWith(filePath);
    });
  });

  describe('delete()', () => {
    it('should delete the process and return the success message', async () => {
      const message = 'eda process was successfully deleted';
      mockBulkEdaReportService.delete.mockResolvedValue(message);

      const result = await controller.delete(TEST_PROCESS_ID, TEST_USER_ID);

      expect(result).toBe(message);
      expect(mockBulkEdaReportService.delete).toHaveBeenCalledWith(TEST_USER_ID, TEST_PROCESS_ID);
    });
  });
});
