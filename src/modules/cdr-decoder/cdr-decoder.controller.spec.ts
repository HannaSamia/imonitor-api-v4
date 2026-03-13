import { Test, TestingModule } from '@nestjs/testing';
import { CdrDecoderController } from './cdr-decoder.controller';
import { CdrDecoderService } from './cdr-decoder.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CDRFileType } from './enums/cdr-decoder.enum';

const mockCdrDecoderService = {
  list: jest.fn(),
  decode: jest.fn(),
  download: jest.fn(),
  delete: jest.fn(),
};

const TEST_USER_ID = 'user-1';
const TEST_PROCESS_ID = 'cdr-process-abc';

describe('CdrDecoderController', () => {
  let controller: CdrDecoderController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CdrDecoderController],
      providers: [{ provide: CdrDecoderService, useValue: mockCdrDecoderService }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CdrDecoderController>(CdrDecoderController);
  });

  describe('list()', () => {
    it('should return the list of CDR decode processes for the current user', async () => {
      const records = [{ id: TEST_PROCESS_ID, name: 'MyCDR', status: 'COMPLETED' }];
      mockCdrDecoderService.list.mockResolvedValue(records);

      const result = await controller.list(TEST_USER_ID);

      expect(result).toEqual(records);
      expect(mockCdrDecoderService.list).toHaveBeenCalledWith(TEST_USER_ID);
    });
  });

  describe('decode()', () => {
    it('should submit a CDR file for decoding and return the process id', async () => {
      const mockFile = { originalname: 'file.gz', buffer: Buffer.from([0x1f, 0x8b]) } as Express.Multer.File;
      mockCdrDecoderService.decode.mockResolvedValue({ id: TEST_PROCESS_ID });

      const result = await controller.decode(mockFile, 'My CDR Job', TEST_USER_ID);

      expect(result).toEqual({ id: TEST_PROCESS_ID });
      expect(mockCdrDecoderService.decode).toHaveBeenCalledWith(mockFile, 'My CDR Job', TEST_USER_ID);
    });
  });

  describe('download()', () => {
    it('should resolve the file path and call res.download for an INPUT request', async () => {
      const filePath = '/uploads/file.gz';
      mockCdrDecoderService.download.mockResolvedValue(filePath);
      const mockRes = { download: jest.fn() };

      await controller.download(TEST_PROCESS_ID, CDRFileType.INPUT, TEST_USER_ID, mockRes as any);

      expect(mockCdrDecoderService.download).toHaveBeenCalledWith(TEST_PROCESS_ID, CDRFileType.INPUT, TEST_USER_ID);
      expect(mockRes.download).toHaveBeenCalledWith(filePath);
    });

    it('should resolve the file path and call res.download for an OUTPUT request', async () => {
      const filePath = '/decoded/file.json.gz';
      mockCdrDecoderService.download.mockResolvedValue(filePath);
      const mockRes = { download: jest.fn() };

      await controller.download(TEST_PROCESS_ID, CDRFileType.OUTPUT, TEST_USER_ID, mockRes as any);

      expect(mockCdrDecoderService.download).toHaveBeenCalledWith(TEST_PROCESS_ID, CDRFileType.OUTPUT, TEST_USER_ID);
      expect(mockRes.download).toHaveBeenCalledWith(filePath);
    });
  });

  describe('delete()', () => {
    it('should delete the CDR process and return void', async () => {
      mockCdrDecoderService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(TEST_PROCESS_ID, TEST_USER_ID);

      expect(result).toBeUndefined();
      expect(mockCdrDecoderService.delete).toHaveBeenCalledWith(TEST_PROCESS_ID, TEST_USER_ID);
    });
  });
});
