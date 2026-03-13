import { Test, TestingModule } from '@nestjs/testing';
import { TarrifLogController } from './tarrif-log.controller';
import { TarrifLogService } from './tarrif-log.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { TarrifLogDto } from './dto/tarrif-log.dto';

// ─── Test Data ─────────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-abc-123';
const TEST_PROCESS_ID = 'test-guid-123';
const TEST_SC_CODE = '123';

function makeMockResponse() {
  return { download: jest.fn() };
}

function makeAddBody(): TarrifLogDto {
  return {
    date: '2026-03-01',
    compareDate: '2026-02-01',
    tarrifId: 123,
  } as unknown as TarrifLogDto;
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('TarrifLogController', () => {
  let controller: TarrifLogController;
  let service: jest.Mocked<
    Pick<TarrifLogService, 'list' | 'listTarrif' | 'listTreeDates' | 'add' | 'download' | 'delete'>
  >;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([{ id: TEST_PROCESS_ID }]),
      listTarrif: jest.fn().mockResolvedValue([{ id: 123, name: 'Service Class A' }]),
      listTreeDates: jest.fn().mockResolvedValue(['2026-03-01 00:00:00', '2026-02-01 00:00:00']),
      add: jest.fn().mockResolvedValue(undefined),
      download: jest.fn().mockResolvedValue(`/assets/tarrif/${TEST_PROCESS_ID}.html`),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TarrifLogController],
      providers: [{ provide: TarrifLogService, useValue: service }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TarrifLogController>(TarrifLogController);
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  it('should call service.list and return the results', async () => {
    const result = await controller.list();

    expect(service.list).toHaveBeenCalled();
    expect(result).toEqual([{ id: TEST_PROCESS_ID }]);
  });

  // ─── listTarrif() ─────────────────────────────────────────────────────────

  it('should call service.listTarrif and return the tariff types', async () => {
    const result = await controller.listTarrif();

    expect(service.listTarrif).toHaveBeenCalled();
    expect(result).toEqual([{ id: 123, name: 'Service Class A' }]);
  });

  // ─── listTreeDates() ──────────────────────────────────────────────────────

  it('should call service.listTreeDates with the service class id and return dates', async () => {
    const result = await controller.listTreeDates(TEST_SC_CODE);

    expect(service.listTreeDates).toHaveBeenCalledWith(TEST_SC_CODE);
    expect(result).toEqual(['2026-03-01 00:00:00', '2026-02-01 00:00:00']);
  });

  // ─── add() ────────────────────────────────────────────────────────────────

  it('should call service.add with body and userId', async () => {
    const body = makeAddBody();

    await controller.add(body, TEST_USER_ID);

    expect(service.add).toHaveBeenCalledWith(body, TEST_USER_ID);
  });

  // ─── download() ───────────────────────────────────────────────────────────

  it('should call service.download and invoke res.download with the returned file path', async () => {
    const res = makeMockResponse();
    const filePath = `/assets/tarrif/${TEST_PROCESS_ID}.html`;
    service.download.mockResolvedValue(filePath);

    await controller.download(TEST_PROCESS_ID, res as any);

    expect(service.download).toHaveBeenCalledWith(TEST_PROCESS_ID);
    expect(res.download).toHaveBeenCalledWith(filePath);
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  it('should call service.delete with process id and userId', async () => {
    await controller.delete(TEST_PROCESS_ID, TEST_USER_ID);

    expect(service.delete).toHaveBeenCalledWith(TEST_PROCESS_ID, TEST_USER_ID);
  });

  it('should call service.delete and not throw when service resolves', async () => {
    service.delete.mockResolvedValue(undefined);

    await expect(controller.delete(TEST_PROCESS_ID, TEST_USER_ID)).resolves.not.toThrow();
  });
});
