// Partially mock `fs` while preserving the real module so that path-scurry
// (used by typeorm's glob dependency) can still access fs.native bindings.
// Using jest.mock with a factory that spreads the real module and overrides
// only the specific methods under test.
jest.mock('fs', () => {
  const actualFs = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
    createReadStream: jest.fn(),
  };
});
jest.mock('fast-csv', () => ({ parse: jest.fn() }));
jest.mock('csv-writer', () => ({
  createObjectCsvWriter: jest.fn(() => ({
    writeRecords: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('exceljs', () => ({
  Workbook: jest.fn().mockImplementation(() => ({
    addWorksheet: jest.fn().mockReturnValue({
      addRow: jest.fn(),
      addTable: jest.fn(),
      getRow: jest.fn().mockReturnValue({ font: {} }),
      getColumn: jest.fn().mockReturnValue({}),
    }),
    xlsx: { writeFile: jest.fn().mockResolvedValue(undefined) },
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BulkEdaReportService } from './bulk-eda-report.service';
import { CoreBulkEdaReports } from '../../database/entities/core-bulk-eda-reports.entity';
import { CustomerCareService } from '../customer-care/customer-care.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { BulkProcessFileType } from '../bulk-processing/enums/bulk-process.enum';

const TEST_USER_ID = 'user-1';
const TEST_PROCESS_ID = 'process-abc-123';

function makeRawManyQueryBuilder(result: any[]) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(result),
  };
}

describe('BulkEdaReportService', () => {
  let service: BulkEdaReportService;
  let bulkEdaRepo: any;
  let mockCustomerCareService: any;
  let mockSystemConfigService: any;

  beforeEach(async () => {
    bulkEdaRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };

    mockCustomerCareService = {
      getHLR: jest.fn().mockResolvedValue({ body: [{}] }),
      getHSS: jest.fn().mockResolvedValue({ body: [{}] }),
      getSob: jest.fn().mockResolvedValue({ balance: '0', serviceName: 'basic' }),
      getOffers: jest.fn().mockResolvedValue({ body: [] }),
      getDedicatedAccounts: jest.fn().mockResolvedValue({ body: [] }),
    };

    mockSystemConfigService = {
      getConfigValue: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkEdaReportService,
        { provide: getRepositoryToken(CoreBulkEdaReports), useValue: bulkEdaRepo },
        { provide: CustomerCareService, useValue: mockCustomerCareService },
        { provide: SystemConfigService, useValue: mockSystemConfigService },
        { provide: DateHelperService, useValue: {} },
      ],
    }).compile();

    service = module.get<BulkEdaReportService>(BulkEdaReportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('list()', () => {
    it('should return results from createQueryBuilder.getRawMany', async () => {
      const expected = [{ id: 'p-1', name: 'file.csv', status: 'finished' }];
      bulkEdaRepo.createQueryBuilder.mockReturnValue(makeRawManyQueryBuilder(expected));

      const result = await service.list();

      expect(result).toEqual(expected);
      expect(bulkEdaRepo.createQueryBuilder).toHaveBeenCalledWith('p');
    });

    it('should use default date format when config returns null', async () => {
      mockSystemConfigService.getConfigValue.mockResolvedValue(null);
      bulkEdaRepo.createQueryBuilder.mockReturnValue(makeRawManyQueryBuilder([]));

      await service.list();

      expect(mockSystemConfigService.getConfigValue).toHaveBeenCalled();
    });
  });

  describe('uploadCSV()', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'document',
      originalname: 'test.csv',
      encoding: '7bit',
      mimetype: 'text/csv',
      buffer: Buffer.from('phoneNumber\n70000000\n'),
      size: 20,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    it('should throw BadRequestException when CSV has more than 50 rows', async () => {
      const rows51 = Array.from({ length: 51 }, (_, i) => ({ phoneNumber: `7000000${i}` }));
      jest.spyOn(service as any, 'readCsv').mockResolvedValue(rows51);

      await expect(service.uploadCSV(TEST_USER_ID, mockFile)).rejects.toThrow(BadRequestException);
      await expect(service.uploadCSV(TEST_USER_ID, mockFile)).rejects.toThrow(
        ErrorMessages.EDA_UPLOAD_FAILED_MAX_50_ROWS,
      );
    });

    it('should save record and return processId for a valid CSV upload', async () => {
      const rows = [{ phoneNumber: '70000000' }];
      jest.spyOn(service as any, 'readCsv').mockResolvedValue(rows);

      const createReadStream = require('fs').createReadStream;
      const parse = require('fast-csv').parse;
      const mockStream = {
        pipe: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation(function (this: any, event: string, handler: Function) {
          if (event === 'end') handler();
          return this;
        }),
      };
      createReadStream.mockReturnValue(mockStream);
      parse.mockReturnValue(mockStream);

      const result = await service.uploadCSV(TEST_USER_ID, mockFile);

      expect(typeof result).toBe('string');
      expect(bulkEdaRepo.save).toHaveBeenCalled();
      expect(bulkEdaRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: result }),
        expect.objectContaining({ status: 'finished' }),
      );
    });

    it('should call CustomerCare services for each phone number', async () => {
      const rows = [{ phoneNumber: '70000001' }];
      jest.spyOn(service as any, 'readCsv').mockResolvedValue(rows);

      const createReadStream = require('fs').createReadStream;
      const parse = require('fast-csv').parse;
      const mockStream = {
        pipe: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation(function (this: any, event: string, handler: Function) {
          if (event === 'end') handler();
          return this;
        }),
      };
      createReadStream.mockReturnValue(mockStream);
      parse.mockReturnValue(mockStream);

      await service.uploadCSV(TEST_USER_ID, mockFile);

      expect(mockCustomerCareService.getHLR).toHaveBeenCalledWith('70000001');
      expect(mockCustomerCareService.getHSS).toHaveBeenCalledWith('70000001');
      expect(mockCustomerCareService.getSob).toHaveBeenCalledWith('70000001', false);
      expect(mockCustomerCareService.getOffers).toHaveBeenCalledWith('70000001', false);
      expect(mockCustomerCareService.getDedicatedAccounts).toHaveBeenCalledWith('70000001', false);
    });
  });

  describe('download()', () => {
    it('should throw NotFoundException when record is not found', async () => {
      bulkEdaRepo.findOne.mockResolvedValue(null);

      await expect(service.download(TEST_PROCESS_ID, BulkProcessFileType.INPUT)).rejects.toThrow(NotFoundException);
      await expect(service.download(TEST_PROCESS_ID, BulkProcessFileType.INPUT)).rejects.toThrow(
        ErrorMessages.EDA_PROCESS_NOT_FOUND,
      );
    });

    it('should return input file path when type is INPUT', async () => {
      bulkEdaRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        inputFile: 'input.csv',
        outputFile: 'output.xlsx',
        status: 'finished',
      });

      const result = await service.download(TEST_PROCESS_ID, BulkProcessFileType.INPUT);

      expect(result).toContain('input.csv');
    });

    it('should return output file path when type is OUTPUT', async () => {
      bulkEdaRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        inputFile: 'input.csv',
        outputFile: 'output.xlsx',
        status: 'finished',
      });

      const result = await service.download(TEST_PROCESS_ID, BulkProcessFileType.OUTPUT);

      expect(result).toContain('output.xlsx');
    });

    it('should throw BadRequestException when type is INPUT but inputFile is missing', async () => {
      bulkEdaRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        inputFile: null,
        outputFile: 'output.xlsx',
        status: 'finished',
      });

      await expect(service.download(TEST_PROCESS_ID, BulkProcessFileType.INPUT)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for an invalid file type', async () => {
      bulkEdaRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        inputFile: 'input.csv',
        outputFile: 'output.xlsx',
        status: 'finished',
      });

      await expect(service.download(TEST_PROCESS_ID, 'invalid' as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete()', () => {
    it('should throw BadRequestException when record is not found', async () => {
      bulkEdaRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(TEST_USER_ID, TEST_PROCESS_ID)).rejects.toThrow(BadRequestException);
      await expect(service.delete(TEST_USER_ID, TEST_PROCESS_ID)).rejects.toThrow(
        ErrorMessages.EDA_UNAUTHORIZED_NOT_OWNER,
      );
    });

    it('should throw BadRequestException when user is not the owner', async () => {
      bulkEdaRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        createdBy: 'other-user',
        inputFile: 'input.csv',
        outputFile: 'output.xlsx',
      });

      await expect(service.delete(TEST_USER_ID, TEST_PROCESS_ID)).rejects.toThrow(BadRequestException);
      await expect(service.delete(TEST_USER_ID, TEST_PROCESS_ID)).rejects.toThrow(
        ErrorMessages.EDA_UNAUTHORIZED_NOT_OWNER,
      );
    });

    it('should delete files and record when user is the owner', async () => {
      bulkEdaRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        createdBy: TEST_USER_ID,
        inputFile: 'input.csv',
        outputFile: 'output.xlsx',
      });

      const result = await service.delete(TEST_USER_ID, TEST_PROCESS_ID);

      expect(bulkEdaRepo.delete).toHaveBeenCalledWith({ id: TEST_PROCESS_ID });
      expect(result).toBe(ErrorMessages.EDA_PROCESS_SUCCESSFULLY_DELETED);
    });

    it('should still delete record even when input file does not exist on disk', async () => {
      const fsPromises = require('fs').promises;
      fsPromises.unlink.mockRejectedValueOnce(new Error('ENOENT'));

      bulkEdaRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        createdBy: TEST_USER_ID,
        inputFile: 'input.csv',
        outputFile: null,
      });

      const result = await service.delete(TEST_USER_ID, TEST_PROCESS_ID);

      expect(result).toBe(ErrorMessages.EDA_PROCESS_SUCCESSFULLY_DELETED);
      expect(bulkEdaRepo.delete).toHaveBeenCalledWith({ id: TEST_PROCESS_ID });
    });
  });
});
