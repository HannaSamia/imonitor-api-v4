import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RotatingDashboardService } from './rotating-dashboard.service';
import { CoreRotatingDashboard } from '../../database/entities/core-rotating-dashboard.entity';
import { CoreSharedRotatingDashboard } from '../../database/entities/core-shared-rotating-dashboard.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { ErrorMessages } from '../../shared/constants/error-messages';

const TEST_USER_ID = 'user-1';
const TEST_RD_ID = 'rd-1';
const TEST_SHARED_RD_ID = 'shared-rd-1';
const TEST_DASHBOARD_ID_1 = 'dash-1';
const TEST_DASHBOARD_ID_2 = 'dash-2';

function createMockQueryBuilder(existsResult: boolean) {
  return {
    where: jest.fn().mockReturnThis(),
    getExists: jest.fn().mockResolvedValue(existsResult),
  };
}

describe('RotatingDashboardService', () => {
  let service: RotatingDashboardService;
  let rdRepo: any;
  let sharedRdRepo: any;
  let mockDataSource: any;
  let mockDashboardService: any;

  beforeEach(async () => {
    rdRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn(),
    };

    sharedRdRepo = {
      findOne: jest.fn(),
      insert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };

    mockDataSource = {
      query: jest.fn(),
    };

    mockDashboardService = {
      isSharedDashboard: jest.fn().mockResolvedValue(false),
      hasPrivilege: jest.fn().mockResolvedValue(undefined),
      getAnyById: jest.fn().mockResolvedValue({
        name: 'Test Dashboard',
        ownerId: 'owner-1',
        charts: [],
        isDefault: false,
      }),
      save: jest.fn().mockResolvedValue('new-dash-id'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RotatingDashboardService,
        { provide: getRepositoryToken(CoreRotatingDashboard), useValue: rdRepo },
        { provide: getRepositoryToken(CoreSharedRotatingDashboard), useValue: sharedRdRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: DateHelperService, useValue: { formatDate: jest.fn().mockReturnValue('2026-03-07 10:00:00') } },
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    }).compile();

    service = module.get(RotatingDashboardService);
  });

  describe('getById', () => {
    it('should return rotating dashboard with parsed dashboardIds', async () => {
      rdRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(true));
      rdRepo.findOne.mockResolvedValue({
        id: TEST_RD_ID,
        name: 'Test RD',
        minutes: 5,
        dashboardIds: JSON.stringify([TEST_DASHBOARD_ID_1, TEST_DASHBOARD_ID_2]),
        ownerId: TEST_USER_ID,
        isFavorite: false,
      });

      const result = await service.getById(TEST_RD_ID);

      expect(result.id).toBe(TEST_RD_ID);
      expect(result.dashboardIds).toEqual([TEST_DASHBOARD_ID_1, TEST_DASHBOARD_ID_2]);
      expect(result.minutes).toBe(5);
    });

    it('should throw if rotating dashboard does not exist', async () => {
      rdRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(false));

      await expect(service.getById(TEST_RD_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('save', () => {
    it('should create a rotating dashboard and return its ID', async () => {
      rdRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(false));

      const result = await service.save(
        { name: 'New RD', dashboardIds: [TEST_DASHBOARD_ID_1], minutes: 5 },
        TEST_USER_ID,
      );

      expect(result).toBeDefined();
      expect(rdRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New RD',
          ownerId: TEST_USER_ID,
          minutes: 5,
        }),
      );
    });

    it('should deduplicate dashboard IDs', async () => {
      rdRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(false));

      await service.save(
        { name: 'New RD', dashboardIds: [TEST_DASHBOARD_ID_1, TEST_DASHBOARD_ID_1], minutes: 5 },
        TEST_USER_ID,
      );

      expect(rdRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboardIds: JSON.stringify([TEST_DASHBOARD_ID_1]),
        }),
      );
    });

    it('should check privilege for non-shared dashboards', async () => {
      mockDashboardService.isSharedDashboard.mockResolvedValue(false);

      await service.save({ name: 'New RD', dashboardIds: [TEST_DASHBOARD_ID_1], minutes: 5 }, TEST_USER_ID);

      expect(mockDashboardService.hasPrivilege).toHaveBeenCalledWith(TEST_DASHBOARD_ID_1, TEST_USER_ID);
    });

    it('should skip privilege check for shared dashboards', async () => {
      mockDashboardService.isSharedDashboard.mockResolvedValue(true);

      await service.save({ name: 'New RD', dashboardIds: [TEST_DASHBOARD_ID_1], minutes: 5 }, TEST_USER_ID);

      expect(mockDashboardService.hasPrivilege).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should return filtered rotating dashboards', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: TEST_RD_ID,
            name: 'My RD',
            ownerId: TEST_USER_ID,
            isFavorite: false,
            owner: 'admin',
            dashboardIds: JSON.stringify([TEST_DASHBOARD_ID_1]),
            isShared: true,
            createdAt: '2026-03-07 10:00',
            updatedAt: null,
            isDefault: false,
          },
        ])
        .mockResolvedValueOnce([{ privilegedTables: '"table-1"' }]);

      const result = await service.list(TEST_USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(TEST_RD_ID);
    });
  });

  describe('share', () => {
    it('should share rotating dashboard with users', async () => {
      rdRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(true));
      rdRepo.findOne.mockResolvedValue({
        id: TEST_RD_ID,
        name: 'Test RD',
        minutes: 5,
        dashboardIds: JSON.stringify([TEST_DASHBOARD_ID_1]),
        ownerId: TEST_USER_ID,
        isFavorite: false,
      });
      mockDashboardService.isSharedDashboard.mockResolvedValue(false);

      await service.share(TEST_RD_ID, ['user-2', 'user-3']);

      expect(sharedRdRepo.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ rotatingDashboardId: TEST_RD_ID, ownerId: 'user-2' }),
          expect.objectContaining({ rotatingDashboardId: TEST_RD_ID, ownerId: 'user-3' }),
        ]),
      );
    });

    it('should throw if rotating dashboard contains shared dashboards', async () => {
      rdRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(true));
      rdRepo.findOne.mockResolvedValue({
        id: TEST_RD_ID,
        name: 'Test RD',
        minutes: 5,
        dashboardIds: JSON.stringify([TEST_DASHBOARD_ID_1]),
        ownerId: TEST_USER_ID,
        isFavorite: false,
      });
      mockDashboardService.isSharedDashboard.mockResolvedValue(true);

      await expect(service.share(TEST_RD_ID, ['user-2'])).rejects.toThrow(
        ErrorMessages.CANNOT_SHARE_ROTATING_CONTAINING_SHARED,
      );
    });
  });

  describe('getSharedById', () => {
    it('should return shared rotating dashboard', async () => {
      mockDataSource.query.mockResolvedValue([
        {
          id: TEST_SHARED_RD_ID,
          rotatingDashboardId: TEST_RD_ID,
          ownerId: TEST_USER_ID,
          name: 'Shared RD',
          isDefault: false,
          dashboardIds: JSON.stringify([TEST_DASHBOARD_ID_1]),
          minutes: 10,
        },
      ]);

      const result = await service.getSharedById(TEST_SHARED_RD_ID);

      expect(result.id).toBe(TEST_SHARED_RD_ID);
      expect(result.dashboardIds).toEqual([TEST_DASHBOARD_ID_1]);
    });

    it('should throw if shared rotating dashboard not found', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await expect(service.getSharedById('nonexistent')).rejects.toThrow(BadRequestException);
    });
  });

  describe('favorite', () => {
    it('should toggle favorite on owned rotating dashboard', async () => {
      rdRepo.findOne.mockResolvedValue({ isFavorite: false });

      const result = await service.favorite(TEST_RD_ID, false);

      expect(result).toBe(true);
      expect(rdRepo.update).toHaveBeenCalledWith({ id: TEST_RD_ID }, { isFavorite: true });
    });

    it('should toggle favorite on shared rotating dashboard', async () => {
      sharedRdRepo.findOne.mockResolvedValue({ isFavorite: true });

      const result = await service.favorite(TEST_SHARED_RD_ID, true);

      expect(result).toBe(false);
      expect(sharedRdRepo.update).toHaveBeenCalledWith({ id: TEST_SHARED_RD_ID }, { isFavorite: false });
    });
  });

  describe('saveShared', () => {
    it('should duplicate shared rotating dashboard with nested dashboards', async () => {
      mockDataSource.query.mockResolvedValue([
        {
          id: TEST_SHARED_RD_ID,
          ownerId: TEST_USER_ID,
          name: 'Shared RD',
          isDefault: false,
          dashboardIds: JSON.stringify([TEST_DASHBOARD_ID_1]),
          minutes: 5,
        },
      ]);

      mockDashboardService.isSharedDashboard.mockResolvedValue(false);
      mockDashboardService.getAnyById.mockResolvedValue({ name: 'Dash', charts: [], isDefault: false });
      mockDashboardService.save.mockResolvedValue('new-dash-1');

      const result = await service.saveShared(TEST_SHARED_RD_ID, TEST_USER_ID);

      expect(result).toBeDefined();
      expect(mockDashboardService.save).toHaveBeenCalled();
      expect(rdRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboardIds: JSON.stringify(['new-dash-1']),
        }),
      );
    });
  });

  describe('update', () => {
    it('should update rotating dashboard', async () => {
      rdRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(true));

      await service.update(
        { id: TEST_RD_ID, name: 'Updated', dashboardIds: [TEST_DASHBOARD_ID_1], minutes: 10 },
        TEST_USER_ID,
      );

      expect(rdRepo.update).toHaveBeenCalledWith(
        { id: TEST_RD_ID },
        expect.objectContaining({ name: 'Updated', minutes: 10 }),
      );
    });

    it('should throw if rotating dashboard does not exist', async () => {
      rdRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(false));

      await expect(
        service.update({ id: 'nonexistent', name: 'X', dashboardIds: [], minutes: 1 }, TEST_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('should delete rotating dashboard if owner', async () => {
      rdRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(true));
      rdRepo.findOne.mockResolvedValue({
        id: TEST_RD_ID,
        name: 'Test RD',
        minutes: 5,
        dashboardIds: JSON.stringify([]),
        ownerId: TEST_USER_ID,
        isFavorite: false,
      });

      const result = await service.delete(TEST_RD_ID, TEST_USER_ID);

      expect(result).toBe(ErrorMessages.ROTATING_DASHBOARD_SUCCESSFULLY_DELETED);
      expect(rdRepo.delete).toHaveBeenCalledWith({ id: TEST_RD_ID });
    });

    it('should throw if not the owner', async () => {
      rdRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(true));
      rdRepo.findOne.mockResolvedValue({
        id: TEST_RD_ID,
        name: 'Test RD',
        minutes: 5,
        dashboardIds: JSON.stringify([]),
        ownerId: 'other-user',
        isFavorite: false,
      });

      await expect(service.delete(TEST_RD_ID, TEST_USER_ID)).rejects.toThrow(ForbiddenException);
    });
  });
});
