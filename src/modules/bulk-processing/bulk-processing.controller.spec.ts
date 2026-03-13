import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BulkProcessingController } from './bulk-processing.controller';
import { BulkProcessingService } from './bulk-processing.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { BulkMethodsType, BulkProcessFileType, BulkProcessStatus } from './enums/bulk-process.enum';

function makeMockFile(originalname: string): Express.Multer.File {
  return {
    originalname,
    buffer: Buffer.from('col1,col2\nval1,val2'),
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

const TEST_USER_ID = 'user-abc-123';
const TEST_PROCESS_ID = 'proc-uuid-001';

describe('BulkProcessingController', () => {
  let controller: BulkProcessingController;
  let service: jest.Mocked<BulkProcessingService>;

  const mockService = {
    bulkChargingCsv: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    schedule: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    listMethods: jest.fn().mockResolvedValue([]),
    listAirs: jest.fn().mockResolvedValue([]),
    download: jest.fn().mockResolvedValue('/tmp/bulk/input/some-file.csv'),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BulkProcessingController],
      providers: [{ provide: BulkProcessingService, useValue: mockService }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BulkProcessingController>(BulkProcessingController);
    service = module.get(BulkProcessingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────── guard metadata ───────────────────────

  describe('PrivilegeGuard', () => {
    it('should have PrivilegeGuard applied to the controller', () => {
      const guards: any[] = Reflect.getMetadata(GUARDS_METADATA, BulkProcessingController) ?? [];
      expect(guards).toContain(PrivilegeGuard);
    });
  });

  // ─────────────────────── POST /balance ───────────────────────

  describe('uploadBalance (POST /balance)', () => {
    it('should call service.bulkChargingCsv with the uploaded file', async () => {
      const file = makeMockFile('balance.csv');

      await controller.uploadBalance(file);

      expect(service.bulkChargingCsv).toHaveBeenCalledWith(file);
    });
  });

  // ─────────────────────── POST / ───────────────────────

  describe('addProcess (POST /)', () => {
    it('should call service.add with file, dto, and userId', async () => {
      const file = makeMockFile('data.csv');

      await controller.addProcess(file, 'My Bulk Job', 1, TEST_USER_ID);

      expect(service.add).toHaveBeenCalledWith(
        file,
        { name: 'My Bulk Job', methodId: 1 },
        TEST_USER_ID,
      );
    });
  });

  // ─────────────────────── POST /schedule ───────────────────────

  describe('scheduleProcess (POST /schedule)', () => {
    it('should call service.schedule with file, dto including date, and userId', async () => {
      const file = makeMockFile('data.csv');
      const date = '2026-03-15 10:00:00';

      await controller.scheduleProcess(file, 'Scheduled Job', 2, date, TEST_USER_ID);

      expect(service.schedule).toHaveBeenCalledWith(
        file,
        { name: 'Scheduled Job', methodId: 2, date },
        TEST_USER_ID,
      );
    });
  });

  // ─────────────────────── GET / ───────────────────────

  describe('list (GET /)', () => {
    it('should call service.list with query type and userId and return the result', async () => {
      const processList = [{ id: TEST_PROCESS_ID, name: 'Job A', status: 'pending' }];
      service.list.mockResolvedValue(processList as any);

      const result = await controller.list({ type: BulkMethodsType.AIR }, TEST_USER_ID);

      expect(service.list).toHaveBeenCalledWith(BulkMethodsType.AIR, TEST_USER_ID);
      expect(result).toEqual(processList);
    });
  });

  // ─────────────────────── GET /methods ───────────────────────

  describe('listMethods (GET /methods)', () => {
    it('should call service.listMethods with query type and userId and return the result', async () => {
      const methods = [{ id: 1, name: 'GetBalanceAndDate', headerSample: 'msisdn' }];
      service.listMethods.mockResolvedValue(methods as any);

      const result = await controller.listMethods({ type: BulkMethodsType.AIR }, TEST_USER_ID);

      expect(service.listMethods).toHaveBeenCalledWith(BulkMethodsType.AIR, TEST_USER_ID);
      expect(result).toEqual(methods);
    });
  });

  // ─────────────────────── GET /airs ───────────────────────

  describe('listAirs (GET /airs)', () => {
    it('should call service.listAirs and return the result', async () => {
      const airs = [{ id: '1', name: 'AIR_Node_1' }];
      service.listAirs.mockResolvedValue(airs);

      const result = await controller.listAirs();

      expect(service.listAirs).toHaveBeenCalledTimes(1);
      expect(result).toEqual(airs);
    });
  });

  // ─────────────────────── GET /:id/download/:type ───────────────────────

  describe('download (GET /:id/download/:type)', () => {
    it('should call service.download and then res.download with the resolved file path', async () => {
      const filePath = '/app/assets/bulk/input/proc-uuid-001.csv';
      service.download.mockResolvedValue(filePath);
      const mockRes = { download: jest.fn() };

      await controller.download(TEST_PROCESS_ID, BulkProcessFileType.INPUT, mockRes as any);

      expect(service.download).toHaveBeenCalledWith(TEST_PROCESS_ID, BulkProcessFileType.INPUT);
      expect(mockRes.download).toHaveBeenCalledWith(filePath);
    });
  });

  // ─────────────────────── PUT /:id ───────────────────────

  describe('update (PUT /:id)', () => {
    it('should throw an Error when dto.id does not match param id', async () => {
      const dto = { id: 'different-id', name: 'Updated Name' };

      await expect(controller.update(TEST_PROCESS_ID, dto, TEST_USER_ID)).rejects.toThrow(
        'ID mismatch',
      );
      expect(service.update).not.toHaveBeenCalled();
    });

    it('should call service.update when dto.id matches param id', async () => {
      const dto = { id: TEST_PROCESS_ID, name: 'Updated Name' };

      await controller.update(TEST_PROCESS_ID, dto, TEST_USER_ID);

      expect(service.update).toHaveBeenCalledWith(dto, TEST_USER_ID);
    });
  });

  // ─────────────────────── DELETE /:id ───────────────────────

  describe('delete (DELETE /:id)', () => {
    it('should call service.delete with the process id and userId', async () => {
      await controller.delete(TEST_PROCESS_ID, TEST_USER_ID);

      expect(service.delete).toHaveBeenCalledWith(TEST_PROCESS_ID, TEST_USER_ID);
    });
  });
});
