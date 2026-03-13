import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CoreBillRunProcess } from '../../database/entities/core-bill-run-process.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { BillRunService } from './bill-run.service';
import { BillRunFileType, BillRunStatus } from './enums/bill-run.enum';

jest.mock('fast-csv', () => ({ parse: jest.fn() }))
jest.mock('../../shared/utils/worker.util', () => ({ runWorker: jest.fn().mockResolvedValue(undefined) }))
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    ...jest.requireActual<typeof import('fs')>('fs').promises,
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined),
  },
  createReadStream: jest.fn(),
}))

// ─── Mock Factories ────────────────────────────────────────────────────────────

function createMockQueryBuilder(result: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(result),
  };
}

function createMockBillRunRepo(qbResult: unknown[] = []) {
  const qb = createMockQueryBuilder(qbResult);
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockResolvedValue({}),
    findOne: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    _qb: qb,
  };
}

const mockDateHelper = {
  getFirstOfMonthAndDMinus1: jest.fn().mockReturnValue({ startDate: '20260301', endDate: '20260312' }),
};

const mockSystemConfig = {
  getConfigValue: jest.fn().mockResolvedValue(null),
};

// ─── Test Data ─────────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-abc-123';
const TEST_PROCESS_ID = 'proc-uuid-001';

function makeCsvFile(originalname = 'msisdns.csv'): Express.Multer.File {
  return {
    originalname,
    buffer: Buffer.from('msisdn_key\n70123456'),
    mimetype: 'text/csv',
    fieldname: 'document',
    encoding: '7bit',
    size: 20,
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  };
}

function makeRecord(overrides: Partial<CoreBillRunProcess> = {}): CoreBillRunProcess {
  return {
    id: TEST_PROCESS_ID,
    name: 'Test Run',
    inputFilePath: '/assets/billRun/input/proc-uuid-001.csv',
    outputFilePath: '/assets/billRun/output/proc-uuid-001_output.xlsx',
    status: BillRunStatus.COMPLETED,
    msisdnCount: 1,
    startDate: '20260301',
    endDate: '20260312',
    cdrRecordCount: 0,
    daRecordCount: 0,
    createdBy: TEST_USER_ID,
    createdAt: new Date(),
    ...overrides,
  } as CoreBillRunProcess;
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('BillRunService', () => {
  let service: BillRunService;
  let billRunRepo: ReturnType<typeof createMockBillRunRepo>;

  beforeEach(async () => {
    billRunRepo = createMockBillRunRepo([]);
    jest.clearAllMocks();

    // Re-apply defaults after clearAllMocks
    mockDateHelper.getFirstOfMonthAndDMinus1.mockReturnValue({ startDate: '20260301', endDate: '20260312' });
    mockSystemConfig.getConfigValue.mockResolvedValue(null);
    const fsPromises = require('fs').promises as jest.Mocked<typeof import('fs').promises>;
    (fsPromises.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);
    (fsPromises.access as jest.Mock).mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillRunService,
        { provide: getRepositoryToken(CoreBillRunProcess), useValue: billRunRepo },
        { provide: DateHelperService, useValue: mockDateHelper },
        { provide: SystemConfigService, useValue: mockSystemConfig },
      ],
    }).compile();

    service = module.get<BillRunService>(BillRunService);
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('should return query builder getRawMany results for the current user', async () => {
      const expected = [{ id: TEST_PROCESS_ID, name: 'Test Run', status: BillRunStatus.COMPLETED }];
      billRunRepo._qb.getRawMany.mockResolvedValue(expected);

      const result = await service.list(TEST_USER_ID);

      expect(billRunRepo.createQueryBuilder).toHaveBeenCalledWith('p');
      expect(result).toEqual(expected);
    });
  });

  // ─── add() ────────────────────────────────────────────────────────────────

  describe('add()', () => {
    it('should throw BadRequestException BILLRUN_ONLY_CSV when file is not a csv', async () => {
      const file = makeCsvFile('report.xlsx');

      await expect(service.add(file, 'My Run', TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BILLRUN_ONLY_CSV),
      );
    });

    it('should throw BadRequestException BILLRUN_INVALID_MSISDNS when no valid MSISDNs are parsed', async () => {
      const file = makeCsvFile('msisdns.csv');
      jest.spyOn(service as any, '_parseMsisdns').mockResolvedValue([]);

      await expect(service.add(file, 'My Run', TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BILLRUN_INVALID_MSISDNS),
      );

      const fsPromises = require('fs').promises as jest.Mocked<typeof import('fs').promises>;
      expect(fsPromises.unlink).toHaveBeenCalled();
    });

    it('should create a record, call runWorker, and return the process id', async () => {
      const file = makeCsvFile('msisdns.csv');
      jest.spyOn(service as any, '_parseMsisdns').mockResolvedValue(['70123456']);

      const result = await service.add(file, 'My Run', TEST_USER_ID);

      expect(billRunRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BillRunStatus.PROCESSING,
          msisdnCount: 1,
          startDate: '20260301',
          endDate: '20260312',
          createdBy: TEST_USER_ID,
        }),
      );
      expect(billRunRepo.save).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
    });
  });

  // ─── download() ───────────────────────────────────────────────────────────

  describe('download()', () => {
    it('should throw NotFoundException BILLRUN_NOT_FOUND when record does not exist', async () => {
      billRunRepo.findOne.mockResolvedValue(null);

      await expect(service.download(TEST_PROCESS_ID, BillRunFileType.INPUT, TEST_USER_ID)).rejects.toThrow(
        new NotFoundException(ErrorMessages.BILLRUN_NOT_FOUND),
      );
    });

    it('should throw BadRequestException BILLRUN_NOT_COMPLETED when type is OUTPUT and status is PROCESSING', async () => {
      billRunRepo.findOne.mockResolvedValue(makeRecord({ status: BillRunStatus.PROCESSING }));

      await expect(service.download(TEST_PROCESS_ID, BillRunFileType.OUTPUT, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BILLRUN_NOT_COMPLETED),
      );
    });

    it('should return inputFilePath when type is INPUT', async () => {
      const record = makeRecord({ status: BillRunStatus.COMPLETED });
      billRunRepo.findOne.mockResolvedValue(record);

      const result = await service.download(TEST_PROCESS_ID, BillRunFileType.INPUT, TEST_USER_ID);

      expect(result).toBe(record.inputFilePath);
    });

    it('should return outputFilePath when type is OUTPUT and status is COMPLETED', async () => {
      const record = makeRecord({ status: BillRunStatus.COMPLETED });
      billRunRepo.findOne.mockResolvedValue(record);

      const result = await service.download(TEST_PROCESS_ID, BillRunFileType.OUTPUT, TEST_USER_ID);

      expect(result).toBe(record.outputFilePath);
    });

    it('should throw NotFoundException BILLRUN_FILE_NOT_FOUND when file is not on disk', async () => {
      const record = makeRecord({ status: BillRunStatus.COMPLETED });
      billRunRepo.findOne.mockResolvedValue(record);
      const fsPromises = require('fs').promises as jest.Mocked<typeof import('fs').promises>;
      (fsPromises.access as jest.Mock).mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(service.download(TEST_PROCESS_ID, BillRunFileType.INPUT, TEST_USER_ID)).rejects.toThrow(
        new NotFoundException(ErrorMessages.BILLRUN_FILE_NOT_FOUND),
      );
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should throw NotFoundException BILLRUN_NOT_FOUND when record does not exist', async () => {
      billRunRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(
        new NotFoundException(ErrorMessages.BILLRUN_NOT_FOUND),
      );
    });

    it('should throw BadRequestException BILLRUN_DELETE_RUNNING when status is PROCESSING', async () => {
      billRunRepo.findOne.mockResolvedValue(makeRecord({ status: BillRunStatus.PROCESSING }));

      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BILLRUN_DELETE_RUNNING),
      );
    });

    it('should call unlink on both files and delete the record on happy path', async () => {
      const record = makeRecord({ status: BillRunStatus.COMPLETED });
      billRunRepo.findOne.mockResolvedValue(record);
      const fsPromises = require('fs').promises as jest.Mocked<typeof import('fs').promises>;
      (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);

      await service.delete(TEST_PROCESS_ID, TEST_USER_ID);

      expect(fsPromises.unlink).toHaveBeenCalledWith(record.inputFilePath);
      expect(fsPromises.unlink).toHaveBeenCalledWith(record.outputFilePath);
      expect(billRunRepo.delete).toHaveBeenCalledWith({ id: TEST_PROCESS_ID });
    });
  });
});
