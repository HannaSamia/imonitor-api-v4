// Partially mock `fs` while preserving the real module so that path-scurry
// (used by typeorm's glob dependency) can still access fs.native bindings.
jest.mock('fs', () => {
  const actualFs = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
      access: jest.fn().mockResolvedValue(undefined),
    },
  };
});
jest.mock('../../shared/utils/worker.util', () => ({
  runWorker: jest.fn().mockResolvedValue(undefined),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CdrDecoderService } from './cdr-decoder.service';
import { CoreCdrDecodeProcess } from '../../database/entities/core-cdr-decode-process.entity';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { CDRFileType, CdrDecodeStatus } from './enums/cdr-decoder.enum';

const TEST_USER_ID = 'user-1';
const TEST_PROCESS_ID = 'cdr-process-abc';
const GZIP_BUFFER = Buffer.from([0x1f, 0x8b, 0x00]);
const ZIP_BUFFER = Buffer.from([0x50, 0x4b, 0x00]);
const INVALID_BUFFER = Buffer.from([0x00, 0x01, 0x02]);

function makeRawManyQueryBuilder(result: any[]) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(result),
  };
}

describe('CdrDecoderService', () => {
  let service: CdrDecoderService;
  let cdrRepo: any;
  let mockSystemConfigService: any;

  beforeEach(async () => {
    cdrRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };

    mockSystemConfigService = {
      getConfigValue: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CdrDecoderService,
        { provide: getRepositoryToken(CoreCdrDecodeProcess), useValue: cdrRepo },
        { provide: SystemConfigService, useValue: mockSystemConfigService },
      ],
    }).compile();

    service = module.get<CdrDecoderService>(CdrDecoderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('list()', () => {
    it('should return raw query results for the current user', async () => {
      const expected = [{ id: TEST_PROCESS_ID, name: 'MyCDR', status: 'COMPLETED' }];
      cdrRepo.createQueryBuilder.mockReturnValue(makeRawManyQueryBuilder(expected));

      const result = await service.list(TEST_USER_ID);

      expect(result).toEqual(expected);
      expect(cdrRepo.createQueryBuilder).toHaveBeenCalledWith('p');
    });

    it('should return an empty array when user has no processes', async () => {
      cdrRepo.createQueryBuilder.mockReturnValue(makeRawManyQueryBuilder([]));

      const result = await service.list(TEST_USER_ID);

      expect(result).toEqual([]);
    });
  });

  describe('decode()', () => {
    const makeMockFile = (buffer: Buffer, name = 'file.gz'): Express.Multer.File => ({
      fieldname: 'document',
      originalname: name,
      encoding: '7bit',
      mimetype: 'application/gzip',
      buffer,
      size: buffer.length,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    });

    it('should throw BadRequestException for an invalid file format (wrong magic bytes)', async () => {
      const file = makeMockFile(INVALID_BUFFER, 'invalid.dat');

      await expect(service.decode(file, 'Test', TEST_USER_ID)).rejects.toThrow(BadRequestException);
      await expect(service.decode(file, 'Test', TEST_USER_ID)).rejects.toThrow(
        ErrorMessages.CDR_INVALID_FILE_FORMAT,
      );
    });

    it('should create a PROCESSING record and return an id for a gzip file', async () => {
      const file = makeMockFile(GZIP_BUFFER, 'SDPCDR_file.gz');

      const result = await service.decode(file, 'Gzip CDR Job', TEST_USER_ID);

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
      expect(cdrRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CdrDecodeStatus.PROCESSING,
          name: 'Gzip CDR Job',
          createdBy: TEST_USER_ID,
        }),
      );
    });

    it('should create a PROCESSING record and return an id for a zip file', async () => {
      const file = makeMockFile(ZIP_BUFFER, 'AIROUTPUTCDR_file.zip');

      const result = await service.decode(file, 'Zip CDR Job', TEST_USER_ID);

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
      expect(cdrRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CdrDecodeStatus.PROCESSING,
          name: 'Zip CDR Job',
        }),
      );
    });

    it('should write the uploaded file to disk before saving the record', async () => {
      const file = makeMockFile(GZIP_BUFFER, 'test.gz');
      const fsPromises = require('fs').promises;

      await service.decode(file, 'Job', TEST_USER_ID);

      expect(fsPromises.writeFile).toHaveBeenCalled();
    });
  });

  describe('download()', () => {
    it('should throw NotFoundException when process record is not found', async () => {
      cdrRepo.findOne.mockResolvedValue(null);

      await expect(service.download(TEST_PROCESS_ID, CDRFileType.INPUT, TEST_USER_ID)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.download(TEST_PROCESS_ID, CDRFileType.INPUT, TEST_USER_ID)).rejects.toThrow(
        ErrorMessages.CDR_PROCESS_NOT_FOUND,
      );
    });

    it('should throw BadRequestException when requesting OUTPUT while status is PROCESSING', async () => {
      cdrRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: CdrDecodeStatus.PROCESSING,
        originalFilePath: '/uploads/file.gz',
        decodedFilePath: '/decoded/file.json.gz',
      });

      await expect(service.download(TEST_PROCESS_ID, CDRFileType.OUTPUT, TEST_USER_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.download(TEST_PROCESS_ID, CDRFileType.OUTPUT, TEST_USER_ID)).rejects.toThrow(
        ErrorMessages.CDR_FILE_UNAVAILABLE,
      );
    });

    it('should return the original file path when type is INPUT and file is accessible', async () => {
      const filePath = '/uploads/file.gz';
      cdrRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: CdrDecodeStatus.COMPLETED,
        originalFilePath: filePath,
        decodedFilePath: '/decoded/file.json.gz',
      });

      const result = await service.download(TEST_PROCESS_ID, CDRFileType.INPUT, TEST_USER_ID);

      expect(result).toBe(filePath);
    });

    it('should return the decoded file path when type is OUTPUT and status is COMPLETED', async () => {
      const decodedPath = '/decoded/file.json.gz';
      cdrRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: CdrDecodeStatus.COMPLETED,
        originalFilePath: '/uploads/file.gz',
        decodedFilePath: decodedPath,
      });

      const result = await service.download(TEST_PROCESS_ID, CDRFileType.OUTPUT, TEST_USER_ID);

      expect(result).toBe(decodedPath);
    });

    it('should throw NotFoundException when file is not accessible on disk', async () => {
      const fsPromises = require('fs').promises;
      fsPromises.access.mockRejectedValue(new Error('ENOENT'));

      cdrRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: CdrDecodeStatus.COMPLETED,
        originalFilePath: '/uploads/missing.gz',
        decodedFilePath: '/decoded/file.json.gz',
      });

      const promise = service.download(TEST_PROCESS_ID, CDRFileType.INPUT, TEST_USER_ID);
      await expect(promise).rejects.toThrow(NotFoundException);
      await expect(promise).rejects.toThrow(ErrorMessages.CDR_FILE_NOT_FOUND);
    });
  });

  describe('delete()', () => {
    it('should throw NotFoundException when process record is not found', async () => {
      cdrRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(NotFoundException);
      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(
        ErrorMessages.CDR_PROCESS_NOT_FOUND,
      );
    });

    it('should throw BadRequestException when status is PROCESSING', async () => {
      cdrRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: CdrDecodeStatus.PROCESSING,
        originalFilePath: '/uploads/file.gz',
        decodedFilePath: '/decoded/file.json.gz',
      });

      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(BadRequestException);
      await expect(service.delete(TEST_PROCESS_ID, TEST_USER_ID)).rejects.toThrow(
        ErrorMessages.CDR_FAILED_DELETE_RUNNING,
      );
    });

    it('should unlink both files and delete the record on happy path', async () => {
      const originalPath = '/uploads/file.gz';
      const decodedPath = '/decoded/file.json.gz';
      const fsPromises = require('fs').promises;

      cdrRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: CdrDecodeStatus.COMPLETED,
        originalFilePath: originalPath,
        decodedFilePath: decodedPath,
      });

      await service.delete(TEST_PROCESS_ID, TEST_USER_ID);

      expect(fsPromises.unlink).toHaveBeenCalledWith(originalPath);
      expect(fsPromises.unlink).toHaveBeenCalledWith(decodedPath);
      expect(cdrRepo.delete).toHaveBeenCalledWith({ id: TEST_PROCESS_ID });
    });

    it('should still delete the record even when file unlink fails', async () => {
      const fsPromises = require('fs').promises;
      fsPromises.unlink.mockRejectedValueOnce(new Error('ENOENT'));

      cdrRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: CdrDecodeStatus.COMPLETED,
        originalFilePath: '/uploads/file.gz',
        decodedFilePath: null,
      });

      await service.delete(TEST_PROCESS_ID, TEST_USER_ID);

      expect(cdrRepo.delete).toHaveBeenCalledWith({ id: TEST_PROCESS_ID });
    });

    it('should successfully delete a FAILED process', async () => {
      cdrRepo.findOne.mockResolvedValue({
        id: TEST_PROCESS_ID,
        status: CdrDecodeStatus.FAILED,
        originalFilePath: '/uploads/file.gz',
        decodedFilePath: '/decoded/file.json.gz',
      });

      await service.delete(TEST_PROCESS_ID, TEST_USER_ID);

      expect(cdrRepo.delete).toHaveBeenCalledWith({ id: TEST_PROCESS_ID });
    });
  });
});
