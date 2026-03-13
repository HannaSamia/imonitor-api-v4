jest.mock('axios');
jest.mock('../../shared/helpers/common.helper', () => ({
  ...jest.requireActual('../../shared/helpers/common.helper'),
  generateGuid: jest.fn().mockReturnValue('test-guid-123'),
  fileExists: jest.fn().mockResolvedValue(true),
  isUndefinedOrNull: jest.fn().mockImplementation((v) => v === null || v === undefined),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CoreTarrifProcess } from '../../database/entities/core-tarrif-process.entity';
import { CoreTarrifRecords } from '../../database/entities/core-tarrif-records.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { fileExists } from '../../shared/helpers/common.helper';
import { TarrifLogService } from './tarrif-log.service';
import { TarrifProcessStatus } from './enums/tarrif-process.enum';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFileExists = fileExists as jest.MockedFunction<typeof fileExists>;

// ─── Mock Factories ────────────────────────────────────────────────────────────

function createMockProcessQb(result: unknown[] = []) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

function createMockRecordsQb(result: unknown[] = [{ formatedDate: '2026-03-01 00:00:00' }]) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(result),
  };
}

function createMockProcessRepo(qbResult: unknown[] = []) {
  const qb = createMockProcessQb(qbResult);
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockResolvedValue({}),
    exists: jest.fn().mockResolvedValue(true),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    _qb: qb,
  };
}

function createMockRecordsRepo(qbResult: unknown[] = [{ formatedDate: '2026-03-01 00:00:00' }]) {
  const qb = createMockRecordsQb(qbResult);
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    _qb: qb,
  };
}

const mockLegacyDataDb = {
  query: jest.fn().mockResolvedValue([{ id: 5 }]),
};

const mockSystemConfig = {
  getConfigValue: jest.fn().mockResolvedValue(null),
  getConfigValues: jest.fn().mockResolvedValue({
    tarrifProcessUrl: 'http://process.local',
    TarrifProcessKey: 'key123',
    tarrifPullProcessUrl: 'http://pull.local',
  }),
};

const mockDateHelper = {
  parseISO: jest.fn().mockReturnValue(new Date('2026-03-01')),
  isAfterDate: jest.fn().mockReturnValue(false),
};

// ─── Test Data ─────────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-abc-123';
const TEST_PROCESS_ID = 'test-guid-123';

function makeAddBody() {
  return {
    date: '2026-03-01',
    compareDate: '2026-02-01',
    tarrifId: 123,
  };
}

function makeProcessRecord(overrides: Partial<CoreTarrifProcess> = {}): CoreTarrifProcess {
  return {
    id: TEST_PROCESS_ID,
    status: TarrifProcessStatus.FINISHED,
    isDeleted: 0,
    createdBy: TEST_USER_ID,
    createdAt: new Date(),
    ...overrides,
  } as CoreTarrifProcess;
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('TarrifLogService', () => {
  let service: TarrifLogService;
  let tarrifProcessRepo: ReturnType<typeof createMockProcessRepo>;
  let tarrifRecordsRepo: ReturnType<typeof createMockRecordsRepo>;

  beforeEach(async () => {
    tarrifProcessRepo = createMockProcessRepo([]);
    tarrifRecordsRepo = createMockRecordsRepo([{ formatedDate: '2026-03-01 00:00:00' }]);
    jest.clearAllMocks();

    // Re-apply default mocks after clearAllMocks
    mockLegacyDataDb.query.mockResolvedValue([{ id: 5 }]);
    mockSystemConfig.getConfigValue.mockResolvedValue(null);
    mockSystemConfig.getConfigValues.mockResolvedValue({
      tarrifProcessUrl: 'http://process.local',
      TarrifProcessKey: 'key123',
      tarrifPullProcessUrl: 'http://pull.local',
    });
    mockDateHelper.parseISO.mockReturnValue(new Date('2026-03-01'));
    mockDateHelper.isAfterDate.mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TarrifLogService,
        { provide: getRepositoryToken(CoreTarrifProcess), useValue: tarrifProcessRepo },
        { provide: getRepositoryToken(CoreTarrifRecords), useValue: tarrifRecordsRepo },
        { provide: LegacyDataDbService, useValue: mockLegacyDataDb },
        { provide: SystemConfigService, useValue: mockSystemConfig },
        { provide: DateHelperService, useValue: mockDateHelper },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockImplementation((key: string) => ({ DB_DATA_NAME: 'iMonitorData' })[key]) },
        },
      ],
    }).compile();

    service = module.get<TarrifLogService>(TarrifLogService);
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('should return results from createQueryBuilder.getRawMany', async () => {
      const expected = [{ id: TEST_PROCESS_ID, status: TarrifProcessStatus.FINISHED }];
      tarrifProcessRepo._qb.getRawMany.mockResolvedValue(expected);

      const result = await service.list();

      expect(tarrifProcessRepo.createQueryBuilder).toHaveBeenCalledWith('p');
      expect(result).toEqual(expected);
    });
  });

  // ─── listTarrif() ─────────────────────────────────────────────────────────

  describe('listTarrif()', () => {
    it('should call legacyDataDb.query and return the results', async () => {
      const expected = [{ id: 'SC_001', name: 'Service Class A' }];
      mockLegacyDataDb.query.mockResolvedValue(expected);

      const result = await service.listTarrif();

      expect(mockLegacyDataDb.query).toHaveBeenCalledWith(expect.stringContaining('V3_service_classes'));
      expect(result).toEqual(expected);
    });
  });

  // ─── listTreeDates() ──────────────────────────────────────────────────────

  describe('listTreeDates()', () => {
    it('should throw BadRequestException TARRIF_NOT_CORRECT when legacyDataDb returns empty rows', async () => {
      mockLegacyDataDb.query.mockResolvedValue([]);

      await expect(service.listTreeDates('SC_001')).rejects.toThrow(
        new BadRequestException(ErrorMessages.TARRIF_NOT_CORRECT),
      );
    });

    it('should return date strings from tarrifRecordsRepo when tariff is found', async () => {
      mockLegacyDataDb.query.mockResolvedValue([{ id: 5 }]);
      tarrifRecordsRepo._qb.getRawMany.mockResolvedValue([
        { formatedDate: '2026-03-01 00:00:00' },
        { formatedDate: '2026-02-01 00:00:00' },
      ]);

      const result = await service.listTreeDates('SC_001');

      expect(tarrifRecordsRepo.createQueryBuilder).toHaveBeenCalledWith('r');
      expect(result).toEqual(['2026-03-01 00:00:00', '2026-02-01 00:00:00']);
    });
  });

  // ─── add() ────────────────────────────────────────────────────────────────

  describe('add()', () => {
    it('should throw BadRequestException TARRIF_CANNOT_CHOOSE_FUTURE_DATE when date is in the future', async () => {
      mockDateHelper.isAfterDate.mockReturnValueOnce(true);

      await expect(service.add(makeAddBody(), TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.TARRIF_CANNOT_CHOOSE_FUTURE_DATE),
      );
    });

    it('should throw BadRequestException TARRIF_CANNOT_CHOOSE_FUTURE_DATE when compareDate is in the future', async () => {
      mockDateHelper.isAfterDate.mockReturnValueOnce(false).mockReturnValueOnce(true);

      await expect(service.add(makeAddBody(), TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.TARRIF_CANNOT_CHOOSE_FUTURE_DATE),
      );
    });

    it('should throw BadRequestException TARRIF_SAME_DATE when date equals compareDate', async () => {
      mockDateHelper.isAfterDate.mockReturnValue(false);

      await expect(
        service.add({ date: '2026-03-01', compareDate: '2026-03-01', tarrifId: 123 }, TEST_USER_ID),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.TARRIF_SAME_DATE));
    });

    it('should throw BadRequestException TARRIF_NOT_CORRECT when tariff is not found', async () => {
      mockDateHelper.isAfterDate.mockReturnValue(false);
      mockLegacyDataDb.query.mockResolvedValue([]);

      await expect(service.add(makeAddBody(), TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.TARRIF_NOT_CORRECT),
      );
    });

    it('should save record when axios returns status 200', async () => {
      mockDateHelper.isAfterDate.mockReturnValue(false);
      mockLegacyDataDb.query.mockResolvedValue([{ id: 5 }]);
      mockedAxios.get.mockResolvedValue({ data: { status: 200, message: 'OK' } });

      await service.add(makeAddBody(), TEST_USER_ID);

      expect(tarrifProcessRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TarrifProcessStatus.PENDING,
          createdBy: TEST_USER_ID,
        }),
      );
      expect(tarrifProcessRepo.save).toHaveBeenCalled();
      expect(tarrifProcessRepo.delete).not.toHaveBeenCalled();
    });

    it('should delete record and throw BadRequestException when axios returns non-200 status', async () => {
      mockDateHelper.isAfterDate.mockReturnValue(false);
      mockLegacyDataDb.query.mockResolvedValue([{ id: 5 }]);
      mockedAxios.get.mockResolvedValue({ data: { status: 500, message: 'Error' } });

      await expect(service.add(makeAddBody(), TEST_USER_ID)).rejects.toThrow(BadRequestException);

      expect(tarrifProcessRepo.delete).toHaveBeenCalledWith({ id: TEST_PROCESS_ID });
    });
  });

  // ─── download() ───────────────────────────────────────────────────────────

  describe('download()', () => {
    it('should throw NotFoundException TARRIF_NOT_FOUND when process does not exist', async () => {
      tarrifProcessRepo.exists.mockResolvedValue(false);

      await expect(service.download(TEST_PROCESS_ID)).rejects.toThrow(
        new NotFoundException(ErrorMessages.TARRIF_NOT_FOUND),
      );
    });

    it('should return the file path when file exists on disk', async () => {
      tarrifProcessRepo.exists.mockResolvedValue(true);
      mockedFileExists.mockResolvedValue(true);

      const result = await service.download(TEST_PROCESS_ID);

      expect(result).toContain(`${TEST_PROCESS_ID}.html`);
    });

    it('should return file path when file does not exist locally but pull returns FILE_RESENT', async () => {
      tarrifProcessRepo.exists.mockResolvedValue(true);
      mockedFileExists.mockResolvedValue(false);
      mockedAxios.get.mockResolvedValue({ data: { status: 200, message: 'FILE_RESENT' } });

      const result = await service.download(TEST_PROCESS_ID);

      expect(result).toContain(`${TEST_PROCESS_ID}.html`);
    });

    it('should throw BadRequestException TARRIF_FILE_NOT_FOUND_WAIT when file does not exist and pull returns non-FILE_RESENT', async () => {
      tarrifProcessRepo.exists.mockResolvedValue(true);
      mockedFileExists.mockResolvedValue(false);
      mockedAxios.get.mockResolvedValue({ data: { status: 200, message: 'PROCESSING' } });

      await expect(service.download(TEST_PROCESS_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.TARRIF_FILE_NOT_FOUND_WAIT),
      );
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should throw BadRequestException TARRIF_NOT_FOUND when record is not found', async () => {
      tarrifProcessRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.TARRIF_NOT_FOUND),
      );
    });

    it('should throw BadRequestException TARRIF_WAIT_TILL_FINISHED when status is PENDING', async () => {
      tarrifProcessRepo.findOne.mockResolvedValue(makeProcessRecord({ status: TarrifProcessStatus.PENDING }));

      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.TARRIF_WAIT_TILL_FINISHED),
      );
    });

    it('should throw BadRequestException TARRIF_WAIT_TILL_FINISHED when status is PROCESSING', async () => {
      tarrifProcessRepo.findOne.mockResolvedValue(makeProcessRecord({ status: TarrifProcessStatus.PROCESSING }));

      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(
        new BadRequestException(ErrorMessages.TARRIF_WAIT_TILL_FINISHED),
      );
    });

    it('should call tarrifProcessRepo.update with isDeleted=1 on happy path', async () => {
      tarrifProcessRepo.findOne.mockResolvedValue(makeProcessRecord({ status: TarrifProcessStatus.FINISHED }));

      await service.delete(TEST_PROCESS_ID, TEST_USER_ID);

      expect(tarrifProcessRepo.update).toHaveBeenCalledWith(
        { id: TEST_PROCESS_ID },
        expect.objectContaining({
          isDeleted: 1,
          deletedBy: TEST_USER_ID,
        }),
      );
    });
  });
});
