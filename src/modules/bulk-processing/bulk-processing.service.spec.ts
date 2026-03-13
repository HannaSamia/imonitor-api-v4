import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BulkProcessingService } from './bulk-processing.service';
import { CoreBulkProcess } from '../../database/entities/core-bulk-process.entity';
import { CoreBulkProcessMethod } from '../../database/entities/core-bulk-process-method.entity';
import { CoreBulkProcessFailure } from '../../database/entities/core-bulk-process-failure.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { BulkMethodsType, BulkProcessFileType, BulkProcessStatus } from './enums/bulk-process.enum';

jest.mock('../../shared/utils/worker.util', () => ({
  runWorker: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    ...jest.requireActual<typeof import('fs')>('fs').promises,
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));

const TEST_USER_ID = 'user-abc-123';
const TEST_PROCESS_ID = 'proc-uuid-001';
const TEST_METHOD_ID = 1;

function createMockQueryBuilder(rawResult: any[] = []) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawResult),
  };
}

function makeMockFile(originalname: string, buffer?: Buffer): Express.Multer.File {
  return {
    originalname,
    buffer: buffer ?? Buffer.from('col1,col2\nval1,val2'),
    fieldname: 'document',
    encoding: '7bit',
    mimetype: 'text/csv',
    size: 20,
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  };
}

describe('BulkProcessingService', () => {
  let service: BulkProcessingService;
  let bulkProcessRepo: any;
  let bulkMethodRepo: any;
  let bulkFailureRepo: any;
  let legacyDataDb: jest.Mocked<LegacyDataDbService>;
  let systemConfig: jest.Mocked<SystemConfigService>;
  let dateHelper: jest.Mocked<DateHelperService>;

  beforeEach(async () => {
    bulkProcessRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };

    bulkMethodRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    bulkFailureRepo = {
      find: jest.fn(),
    };

    const mockLegacyDataDb = {
      query: jest.fn(),
    };

    const mockSystemConfig = {
      getConfigValue: jest.fn(),
    };

    const mockDateHelper = {
      parseISO: jest.fn().mockReturnValue(new Date('2026-03-15T10:00:00.000Z')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkProcessingService,
        { provide: getRepositoryToken(CoreBulkProcess), useValue: bulkProcessRepo },
        { provide: getRepositoryToken(CoreBulkProcessMethod), useValue: bulkMethodRepo },
        { provide: getRepositoryToken(CoreBulkProcessFailure), useValue: bulkFailureRepo },
        { provide: LegacyDataDbService, useValue: mockLegacyDataDb },
        { provide: SystemConfigService, useValue: mockSystemConfig },
        { provide: DateHelperService, useValue: mockDateHelper },
      ],
    }).compile();

    service = module.get<BulkProcessingService>(BulkProcessingService);
    legacyDataDb = module.get(LegacyDataDbService);
    systemConfig = module.get(SystemConfigService);
    dateHelper = module.get(DateHelperService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────── list ───────────────────────

  describe('list', () => {
    it('should return raw results from the query builder', async () => {
      const expected = [
        { id: TEST_PROCESS_ID, name: 'Job A', status: 'now', method: 'GetBalanceAndDate' },
      ];
      systemConfig.getConfigValue.mockResolvedValue('%Y-%m-%d');
      bulkProcessRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(expected));

      const result = await service.list(BulkMethodsType.AIR, TEST_USER_ID);

      expect(result).toEqual(expected);
      expect(bulkProcessRepo.createQueryBuilder).toHaveBeenCalledWith('p');
    });

    it('should return an empty array when no records exist', async () => {
      systemConfig.getConfigValue.mockResolvedValue('%Y-%m-%d');
      bulkProcessRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));

      const result = await service.list(BulkMethodsType.EDA, TEST_USER_ID);

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────── listMethods ───────────────────────

  describe('listMethods', () => {
    it('should return methods from repo.find filtered by type', async () => {
      const methods = [
        { id: 1, name: 'GetBalanceAndDate', headerSample: 'msisdn' },
        { id: 2, name: 'AddOffer', headerSample: 'msisdn,offerId' },
      ];
      bulkMethodRepo.find.mockResolvedValue(methods);

      const result = await service.listMethods(BulkMethodsType.AIR, TEST_USER_ID);

      expect(result).toEqual(methods);
      expect(bulkMethodRepo.find).toHaveBeenCalledWith({
        where: { type: BulkMethodsType.AIR },
        select: { id: true, name: true, headerSample: true },
      });
    });
  });

  // ─────────────────────── listAirs ───────────────────────

  describe('listAirs', () => {
    it('should return empty array when system config value is empty string', async () => {
      systemConfig.getConfigValue.mockResolvedValue('');

      const result = await service.listAirs();

      expect(result).toEqual([]);
      expect(legacyDataDb.query).not.toHaveBeenCalled();
    });

    it('should return empty array when system config value is null', async () => {
      systemConfig.getConfigValue.mockResolvedValue(null as any);

      const result = await service.listAirs();

      expect(result).toEqual([]);
      expect(legacyDataDb.query).not.toHaveBeenCalled();
    });

    it('should query legacy db and map rows to {id, name} when IPs are configured', async () => {
      systemConfig.getConfigValue.mockResolvedValue('10.0.0.1, 10.0.0.2');
      legacyDataDb.query.mockResolvedValue([
        { id: '1', node_name: 'AIR_Node_1' },
        { id: '2', node_name: 'AIR_Node_2' },
      ]);

      const result = await service.listAirs();

      expect(legacyDataDb.query).toHaveBeenCalledTimes(1);
      expect(result).toEqual([
        { id: '1', name: 'AIR_Node_1' },
        { id: '2', name: 'AIR_Node_2' },
      ]);
    });

    it('should pass trimmed IP list as query parameters', async () => {
      systemConfig.getConfigValue.mockResolvedValue(' 10.0.0.1 , 10.0.0.2 ');
      legacyDataDb.query.mockResolvedValue([]);

      await service.listAirs();

      const callArgs = legacyDataDb.query.mock.calls[0];
      expect(callArgs[1]).toEqual(['10.0.0.1', '10.0.0.2']);
    });
  });

  // ─────────────────────── add ───────────────────────

  describe('add', () => {
    it('should throw BadRequestException with BULK_FILE_NOT_SUPPORTED when file is not csv', async () => {
      const file = makeMockFile('report.xlsx');
      const dto = { name: 'Test Job', methodId: TEST_METHOD_ID };

      await expect(service.add(file, dto, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BULK_FILE_NOT_SUPPORTED),
      );
    });

    it('should throw NotFoundException with BULK_PROCESS_NOT_FOUND when method does not exist', async () => {
      const file = makeMockFile('data.csv');
      const dto = { name: 'Test Job', methodId: 999 };
      bulkMethodRepo.findOne.mockResolvedValue(null);

      await expect(service.add(file, dto, TEST_USER_ID)).rejects.toThrow(
        new NotFoundException(ErrorMessages.BULK_PROCESS_NOT_FOUND),
      );
    });

    it('should create a bulk process record and fire worker on happy path', async () => {
      const { runWorker } = jest.requireMock('../../shared/utils/worker.util');
      const file = makeMockFile('data.csv');
      const dto = { name: 'My Bulk Job', methodId: TEST_METHOD_ID };
      const method = { id: TEST_METHOD_ID, name: 'GetBalanceAndDate', type: BulkMethodsType.AIR };
      bulkMethodRepo.findOne.mockResolvedValue(method);
      bulkProcessRepo.save.mockResolvedValue({});

      await service.add(file, dto, TEST_USER_ID);

      expect(bulkProcessRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Bulk Job',
          method: 'GetBalanceAndDate',
          status: BulkProcessStatus.NOW,
          createdBy: TEST_USER_ID,
        }),
      );
      expect(bulkProcessRepo.save).toHaveBeenCalledTimes(1);
      expect(runWorker).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────── schedule ───────────────────────

  describe('schedule', () => {
    it('should throw BadRequestException when file is not csv', async () => {
      const file = makeMockFile('data.pdf');
      const dto = { name: 'Scheduled Job', methodId: TEST_METHOD_ID, date: '2026-03-15 10:00:00' };

      await expect(service.schedule(file, dto, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BULK_FILE_NOT_SUPPORTED),
      );
    });

    it('should throw NotFoundException when method does not exist', async () => {
      const file = makeMockFile('data.csv');
      const dto = { name: 'Scheduled Job', methodId: 999, date: '2026-03-15 10:00:00' };
      bulkMethodRepo.findOne.mockResolvedValue(null);

      await expect(service.schedule(file, dto, TEST_USER_ID)).rejects.toThrow(
        new NotFoundException(ErrorMessages.BULK_PROCESS_NOT_FOUND),
      );
    });

    it('should create a PENDING record without firing worker on happy path', async () => {
      const { runWorker } = jest.requireMock('../../shared/utils/worker.util');
      runWorker.mockClear();
      const file = makeMockFile('data.csv');
      const dto = { name: 'Scheduled Job', methodId: TEST_METHOD_ID, date: '2026-03-15 10:00:00' };
      const method = { id: TEST_METHOD_ID, name: 'AddOffer', type: BulkMethodsType.AIR };
      bulkMethodRepo.findOne.mockResolvedValue(method);
      bulkProcessRepo.save.mockResolvedValue({});

      await service.schedule(file, dto, TEST_USER_ID);

      expect(bulkProcessRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Scheduled Job',
          status: BulkProcessStatus.PENDING,
          createdBy: TEST_USER_ID,
        }),
      );
      expect(bulkProcessRepo.save).toHaveBeenCalledTimes(1);
      expect(runWorker).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────── update ───────────────────────

  describe('update', () => {
    it('should throw NotFoundException with BULK_PROCESS_NOT_FOUND when process does not exist', async () => {
      bulkProcessRepo.findOne.mockResolvedValue(null);
      const dto = { id: TEST_PROCESS_ID, name: 'Updated Name' };

      await expect(service.update(dto, TEST_USER_ID)).rejects.toThrow(
        new NotFoundException(ErrorMessages.BULK_PROCESS_NOT_FOUND),
      );
    });

    it('should throw BadRequestException with BULK_UPDATE_NOT_PENDING when status is processing', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.PROCESSING,
      });
      const dto = { id: TEST_PROCESS_ID, name: 'Updated Name' };

      await expect(service.update(dto, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BULK_UPDATE_NOT_PENDING),
      );
    });

    it('should throw BadRequestException with BULK_UPDATE_NOT_PENDING when status is finished', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.FINISHED,
      });
      const dto = { id: TEST_PROCESS_ID, name: 'Updated Name' };

      await expect(service.update(dto, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BULK_UPDATE_NOT_PENDING),
      );
    });

    it('should call repo.update on happy path when status is PENDING', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.PENDING,
      });
      bulkProcessRepo.update.mockResolvedValue({});
      const dto = { id: TEST_PROCESS_ID, name: 'Updated Name' };

      await service.update(dto, TEST_USER_ID);

      expect(bulkProcessRepo.update).toHaveBeenCalledWith(
        { id: TEST_PROCESS_ID },
        expect.objectContaining({ name: 'Updated Name', updatedBy: TEST_USER_ID }),
      );
    });
  });

  // ─────────────────────── delete ───────────────────────

  describe('delete', () => {
    it('should throw NotFoundException when process does not exist', async () => {
      bulkProcessRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException with BULK_WAIT_TILL_FINISHED when status is now', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.NOW,
      });

      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BULK_WAIT_TILL_FINISHED),
      );
    });

    it('should throw BadRequestException with BULK_WAIT_TILL_FINISHED when status is processing', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.PROCESSING,
      });

      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BULK_WAIT_TILL_FINISHED),
      );
    });

    it('should soft-delete the record on happy path when status is pending', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.PENDING,
      });
      bulkProcessRepo.update.mockResolvedValue({});

      await service.delete(TEST_PROCESS_ID, TEST_USER_ID);

      expect(bulkProcessRepo.update).toHaveBeenCalledWith(
        { id: TEST_PROCESS_ID },
        expect.objectContaining({ isDeleted: 1, deletedBy: TEST_USER_ID }),
      );
    });

    it('should soft-delete the record on happy path when status is finished', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.FINISHED,
      });
      bulkProcessRepo.update.mockResolvedValue({});

      await service.delete(TEST_PROCESS_ID, TEST_USER_ID);

      expect(bulkProcessRepo.update).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────── download ───────────────────────

  describe('download', () => {
    it('should throw NotFoundException when process does not exist', async () => {
      bulkProcessRepo.findOne.mockResolvedValue(null);

      await expect(service.download(TEST_PROCESS_ID, BulkProcessFileType.INPUT)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return the input file path when type is INPUT', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.FINISHED,
        inputFile: 'input-file.csv',
        outputFile: 'output-file.csv',
      });

      const result = await service.download(TEST_PROCESS_ID, BulkProcessFileType.INPUT);

      expect(result).toContain('input-file.csv');
      expect(result).toContain('bulk/input');
    });

    it('should return the output file path when type is OUTPUT and status is FINISHED', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.FINISHED,
        inputFile: 'input-file.csv',
        outputFile: 'output-file.csv',
      });

      const result = await service.download(TEST_PROCESS_ID, BulkProcessFileType.OUTPUT);

      expect(result).toContain('output-file.csv');
      expect(result).toContain('bulk/output');
    });

    it('should return the output file path when type is OUTPUT and status is INCOMPLETE', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.INCOMPLETE,
        inputFile: 'input-file.csv',
        outputFile: 'output-file.csv',
      });

      const result = await service.download(TEST_PROCESS_ID, BulkProcessFileType.OUTPUT);

      expect(result).toContain('output-file.csv');
    });

    it('should throw BadRequestException with BULK_PROCESS_NOT_FINISHED when type is OUTPUT and status is PENDING', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.PENDING,
        inputFile: 'input-file.csv',
        outputFile: null,
      });

      await expect(service.download(TEST_PROCESS_ID, BulkProcessFileType.OUTPUT)).rejects.toThrow(
        new BadRequestException(ErrorMessages.BULK_PROCESS_NOT_FINISHED),
      );
    });

    it('should throw BadRequestException with BULK_WRONG_FILE_TYPE when type is unrecognized', async () => {
      bulkProcessRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: BulkProcessStatus.FINISHED,
        inputFile: 'input-file.csv',
        outputFile: 'output-file.csv',
      });

      await expect(service.download(TEST_PROCESS_ID, 'invalid-type')).rejects.toThrow(
        new BadRequestException(ErrorMessages.BULK_WRONG_FILE_TYPE),
      );
    });
  });

  // ─────────────────────── bulkChargingCsv ───────────────────────

  describe('bulkChargingCsv', () => {
    it('should call runWorker as fire-and-forget', async () => {
      const { runWorker } = jest.requireMock('../../shared/utils/worker.util');
      runWorker.mockClear();
      const file = makeMockFile('balance.csv');

      await service.bulkChargingCsv(file);

      expect(runWorker).toHaveBeenCalledTimes(1);
      expect(runWorker).toHaveBeenCalledWith(
        expect.stringContaining('bulkProcess.worker'),
        expect.objectContaining({ method: 'GetBalanceAndDate', type: BulkMethodsType.AIR }),
      );
    });
  });
});
