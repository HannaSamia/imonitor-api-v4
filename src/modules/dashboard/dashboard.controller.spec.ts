import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { ErrorMessages } from '../../shared/constants/error-messages';

const mockDashboardService = {
  save: jest.fn(),
  update: jest.fn(),
  list: jest.fn(),
  getById: jest.fn(),
  getAnyById: jest.fn(),
  share: jest.fn(),
  saveShared: jest.fn(),
  saveDefault: jest.fn(),
  getSharedById: jest.fn(),
  favorite: jest.fn(),
};

const TEST_USER_ID = 'user-123';
const TEST_DASHBOARD_ID = 'dash-456';

describe('DashboardController', () => {
  let controller: DashboardController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  describe('save()', () => {
    it('should create dashboard and return ID', async () => {
      mockDashboardService.save.mockResolvedValue('new-dash-id');

      const result = await controller.save(
        { name: 'Test', charts: [] },
        TEST_USER_ID,
      );

      expect(result).toEqual({ id: 'new-dash-id' });
      expect(mockDashboardService.save).toHaveBeenCalledWith(
        { name: 'Test', charts: [] },
        TEST_USER_ID,
      );
    });
  });

  describe('update()', () => {
    it('should update dashboard when IDs match', async () => {
      mockDashboardService.update.mockResolvedValue(undefined);

      await controller.update(
        TEST_DASHBOARD_ID,
        { id: TEST_DASHBOARD_ID, name: 'Updated', charts: [] },
        TEST_USER_ID,
      );

      expect(mockDashboardService.update).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when IDs do not match', async () => {
      await expect(
        controller.update(
          TEST_DASHBOARD_ID,
          { id: 'different-id', name: 'Updated', charts: [] },
          TEST_USER_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list()', () => {
    it('should return list of dashboards', async () => {
      const dashboards = [{ id: TEST_DASHBOARD_ID, name: 'Dash' }];
      mockDashboardService.list.mockResolvedValue(dashboards);

      const result = await controller.list(TEST_USER_ID);

      expect(result).toEqual(dashboards);
    });
  });

  describe('getById()', () => {
    it('should return dashboard by ID', async () => {
      const dashboard = { name: 'Dash', ownerId: TEST_USER_ID, charts: [] };
      mockDashboardService.getById.mockResolvedValue(dashboard);

      const result = await controller.getById(TEST_DASHBOARD_ID);

      expect(result).toEqual(dashboard);
    });
  });

  describe('getAnyById()', () => {
    it('should return any dashboard by ID', async () => {
      const dashboard = { name: 'Any', ownerId: TEST_USER_ID, charts: [] };
      mockDashboardService.getAnyById.mockResolvedValue(dashboard);

      const result = await controller.getAnyById(TEST_DASHBOARD_ID);

      expect(result).toEqual(dashboard);
    });
  });

  describe('share()', () => {
    it('should share dashboard with users', async () => {
      mockDashboardService.share.mockResolvedValue(undefined);

      await controller.share(TEST_DASHBOARD_ID, { id: TEST_DASHBOARD_ID, userIds: ['user-1', 'user-2'] });

      expect(mockDashboardService.share).toHaveBeenCalledWith(
        TEST_DASHBOARD_ID,
        ['user-1', 'user-2'],
      );
    });
  });

  describe('saveShared()', () => {
    it('should duplicate shared dashboard and return new ID', async () => {
      mockDashboardService.saveShared.mockResolvedValue('new-dash-id');

      const result = await controller.saveShared('shared-1', TEST_USER_ID);

      expect(result).toEqual({ id: 'new-dash-id' });
    });
  });

  describe('saveDefault()', () => {
    it('should copy default dashboard and return new ID', async () => {
      mockDashboardService.saveDefault.mockResolvedValue('new-dash-id');

      const result = await controller.saveDefault(TEST_DASHBOARD_ID, TEST_USER_ID);

      expect(result).toEqual({ id: 'new-dash-id' });
    });
  });

  describe('getSharedById()', () => {
    it('should return shared dashboard', async () => {
      const dashboard = { name: 'Shared', ownerId: TEST_USER_ID, charts: [] };
      mockDashboardService.getSharedById.mockResolvedValue(dashboard);

      const result = await controller.getSharedById('shared-1');

      expect(result).toEqual(dashboard);
    });
  });

  describe('favorite()', () => {
    it('should toggle favorite and return new status', async () => {
      mockDashboardService.favorite.mockResolvedValue(true);

      const result = await controller.favorite(TEST_DASHBOARD_ID, {
        id: TEST_DASHBOARD_ID,
        isShared: false,
      });

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when IDs do not match', async () => {
      await expect(
        controller.favorite(TEST_DASHBOARD_ID, {
          id: 'different-id',
          isShared: false,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
