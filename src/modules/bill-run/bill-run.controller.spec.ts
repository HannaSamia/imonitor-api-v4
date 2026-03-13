import { Test, TestingModule } from '@nestjs/testing';
import { BillRunController } from './bill-run.controller';
import { BillRunService } from './bill-run.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { BillRunFileType } from './enums/bill-run.enum';

// ─── Test Data ─────────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-abc-123';
const TEST_PROCESS_ID = 'proc-uuid-001';

function makeCsvFile(): Express.Multer.File {
  return {
    originalname: 'msisdns.csv',
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

function makeMockResponse() {
  return { download: jest.fn() };
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('BillRunController', () => {
  let controller: BillRunController;
  let service: jest.Mocked<Pick<BillRunService, 'list' | 'add' | 'download' | 'delete'>>;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([{ id: TEST_PROCESS_ID }]),
      add: jest.fn().mockResolvedValue({ id: TEST_PROCESS_ID }),
      download: jest.fn().mockResolvedValue('/assets/billRun/input/proc-uuid-001.csv'),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillRunController],
      providers: [{ provide: BillRunService, useValue: service }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BillRunController>(BillRunController);
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  it('should call service.list and return the result', async () => {
    const result = await controller.list(TEST_USER_ID);

    expect(service.list).toHaveBeenCalledWith(TEST_USER_ID);
    expect(result).toEqual([{ id: TEST_PROCESS_ID }]);
  });

  // ─── add() ────────────────────────────────────────────────────────────────

  it('should call service.add and return process id', async () => {
    const file = makeCsvFile();

    const result = await controller.add(file, 'March 2026 Run', TEST_USER_ID);

    expect(service.add).toHaveBeenCalledWith(file, 'March 2026 Run', TEST_USER_ID);
    expect(result).toEqual({ id: TEST_PROCESS_ID });
  });

  // ─── download() ───────────────────────────────────────────────────────────

  it('should call service.download and invoke res.download with the returned file path', async () => {
    const res = makeMockResponse();
    const filePath = '/assets/billRun/input/proc-uuid-001.csv';
    service.download.mockResolvedValue(filePath);

    await controller.download(TEST_PROCESS_ID, BillRunFileType.INPUT, TEST_USER_ID, res as any);

    expect(service.download).toHaveBeenCalledWith(TEST_PROCESS_ID, BillRunFileType.INPUT, TEST_USER_ID);
    expect(res.download).toHaveBeenCalledWith(filePath);
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  it('should call service.delete with the process id and user id', async () => {
    await controller.delete(TEST_PROCESS_ID, TEST_USER_ID);

    expect(service.delete).toHaveBeenCalledWith(TEST_PROCESS_ID, TEST_USER_ID);
  });
});
