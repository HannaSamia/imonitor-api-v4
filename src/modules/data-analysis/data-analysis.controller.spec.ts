import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DataAnalysisController } from './data-analysis.controller';
import { DataAnalysisService } from './data-analysis.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';

const TEST_USER_ID = 'user-1';
const TEST_DA_ID = 'da-1';

describe('DataAnalysisController', () => {
  let controller: DataAnalysisController;
  let service: any;

  beforeEach(async () => {
    service = {
      save: jest.fn().mockResolvedValue('new-da-id'),
      update: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue({ name: 'Test DA', charts: [] }),
      share: jest.fn().mockResolvedValue(undefined),
      getSharedById: jest.fn().mockResolvedValue({ name: 'Shared DA', charts: [] }),
      saveShared: jest.fn().mockResolvedValue('new-shared-id'),
      saveDefault: jest.fn().mockResolvedValue('new-default-id'),
      favorite: jest.fn().mockResolvedValue(true),
      exportHtml: jest.fn().mockResolvedValue('/tmp/export.html'),
      exportPdf: jest.fn().mockResolvedValue('/tmp/export.pdf'),
      exportExcel: jest.fn().mockResolvedValue('/tmp/export.xlsx'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataAnalysisController],
      providers: [{ provide: DataAnalysisService, useValue: service }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(DataAnalysisController);
  });

  it('should create a data analysis', async () => {
    const result = await controller.save(
      { name: 'New DA', charts: [{ chartId: 'c1', reportId: 'r1', cols: 6, rows: 4, x: 0, y: 0 }] },
      TEST_USER_ID,
    );
    expect(result).toEqual({ id: 'new-da-id' });
  });

  it('should update a data analysis', async () => {
    await controller.update(TEST_DA_ID, { id: TEST_DA_ID, name: 'Updated', charts: [] }, TEST_USER_ID);
    expect(service.update).toHaveBeenCalled();
  });

  it('should throw if update IDs do not match', async () => {
    await expect(
      controller.update('other-id', { id: TEST_DA_ID, name: 'X', charts: [] }, TEST_USER_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should list data analyses', async () => {
    const result = await controller.list(TEST_USER_ID);
    expect(result).toEqual([]);
    expect(service.list).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('should get data analysis by ID', async () => {
    const result = await controller.getById(TEST_DA_ID);
    expect(result.name).toBe('Test DA');
  });

  it('should share data analysis', async () => {
    await controller.share(TEST_DA_ID, { id: TEST_DA_ID, userIds: ['user-2'] });
    expect(service.share).toHaveBeenCalledWith(TEST_DA_ID, ['user-2']);
  });

  it('should get shared data analysis', async () => {
    const result = await controller.getSharedById('shared-1');
    expect(result.name).toBe('Shared DA');
  });

  it('should save shared data analysis', async () => {
    const result = await controller.saveShared('shared-1', TEST_USER_ID);
    expect(result).toEqual({ id: 'new-shared-id' });
  });

  it('should save default data analysis', async () => {
    const result = await controller.saveDefault(TEST_DA_ID, TEST_USER_ID);
    expect(result).toEqual({ id: 'new-default-id' });
  });

  it('should toggle favorite', async () => {
    const result = await controller.favorite(TEST_DA_ID, { id: TEST_DA_ID, isShared: false });
    expect(result).toBe(true);
  });

  it('should throw if favorite IDs do not match', async () => {
    await expect(controller.favorite('other-id', { id: TEST_DA_ID })).rejects.toThrow(ForbiddenException);
  });

  it('should export HTML', async () => {
    const result = await controller.exportHtml(
      { id: TEST_DA_ID, status: 'saved', fromdate: '2026-01-01', todate: '2026-03-01', interval: 'daily' },
      TEST_USER_ID,
    );
    expect(result).toBe('/tmp/export.html');
  });

  it('should export PDF', async () => {
    const result = await controller.exportPdf(
      { id: TEST_DA_ID, status: 'saved', fromdate: '2026-01-01', todate: '2026-03-01', interval: 'daily' },
      TEST_USER_ID,
    );
    expect(result).toBe('/tmp/export.pdf');
  });

  it('should export Excel', async () => {
    const result = await controller.exportExcel(
      { id: TEST_DA_ID, status: 'saved', fromdate: '2026-01-01', todate: '2026-03-01', interval: 'daily' },
      TEST_USER_ID,
    );
    expect(result).toBe('/tmp/export.xlsx');
  });
});
