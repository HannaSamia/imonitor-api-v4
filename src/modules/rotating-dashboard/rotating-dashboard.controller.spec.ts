import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RotatingDashboardController } from './rotating-dashboard.controller';
import { RotatingDashboardService } from './rotating-dashboard.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';

const TEST_USER_ID = 'user-1';
const TEST_RD_ID = 'rd-1';

describe('RotatingDashboardController', () => {
  let controller: RotatingDashboardController;
  let service: any;

  beforeEach(async () => {
    service = {
      save: jest.fn().mockResolvedValue('new-rd-id'),
      list: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue({ id: TEST_RD_ID, name: 'Test' }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue('Rotating dashboard successfully deleted.'),
      share: jest.fn().mockResolvedValue(undefined),
      getSharedById: jest.fn().mockResolvedValue({ id: 'shared-1' }),
      saveShared: jest.fn().mockResolvedValue('new-shared-id'),
      favorite: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RotatingDashboardController],
      providers: [{ provide: RotatingDashboardService, useValue: service }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(RotatingDashboardController);
  });

  it('should create a rotating dashboard', async () => {
    const result = await controller.save({ name: 'New RD', dashboardIds: ['dash-1'], minutes: 5 }, TEST_USER_ID);
    expect(result).toEqual({ id: 'new-rd-id' });
  });

  it('should list rotating dashboards', async () => {
    const result = await controller.list(TEST_USER_ID);
    expect(result).toEqual([]);
    expect(service.list).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('should get rotating dashboard by ID', async () => {
    const result = await controller.getById(TEST_RD_ID);
    expect(result.id).toBe(TEST_RD_ID);
  });

  it('should update rotating dashboard', async () => {
    await controller.update(
      TEST_RD_ID,
      { id: TEST_RD_ID, name: 'Updated', dashboardIds: [], minutes: 10 },
      TEST_USER_ID,
    );
    expect(service.update).toHaveBeenCalled();
  });

  it('should throw if update IDs do not match', async () => {
    await expect(
      controller.update('other-id', { id: TEST_RD_ID, name: 'X', dashboardIds: [], minutes: 1 }, TEST_USER_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should delete rotating dashboard', async () => {
    const result = await controller.delete(TEST_RD_ID, TEST_USER_ID);
    expect(result).toContain('deleted');
  });

  it('should share rotating dashboard', async () => {
    await controller.share(TEST_RD_ID, { id: TEST_RD_ID, userIds: ['user-2'] });
    expect(service.share).toHaveBeenCalledWith(TEST_RD_ID, ['user-2']);
  });

  it('should get shared rotating dashboard', async () => {
    const result = await controller.getSharedById('shared-1');
    expect(result.id).toBe('shared-1');
  });

  it('should save shared rotating dashboard', async () => {
    const result = await controller.saveShared('shared-1', TEST_USER_ID);
    expect(result).toEqual({ id: 'new-shared-id' });
  });

  it('should toggle favorite', async () => {
    const result = await controller.favorite(TEST_RD_ID, { id: TEST_RD_ID, isShared: false });
    expect(result).toBe(true);
  });

  it('should throw if favorite IDs do not match', async () => {
    await expect(controller.favorite('other-id', { id: TEST_RD_ID })).rejects.toThrow(ForbiddenException);
  });
});
