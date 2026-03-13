import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationService } from './notification.service';
import { CoreNotificationSent } from '../../database/entities/core-notification-sent.entity';
import { CoreNotificationSettings } from '../../database/entities/core-notification-settings.entity';
import { CoreNotificationUsers } from '../../database/entities/core-notification-users.entity';
import { CoreWidgetBuilderCharts } from '../../database/entities/core-widget-builder-charts.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';

// ─── Mock Factories ──────────────────────────────────────────────────────────

/**
 * Creates a chainable QueryBuilder mock. Most methods return `this` so chains
 * compile correctly. Terminal methods (getCount, getRawMany, execute) are
 * individually overridable per test via the returned object.
 */
function createChainableQb(overrides: Record<string, jest.Mock> = {}) {
  const qb: Record<string, jest.Mock> = {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    clone: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getRawMany: jest.fn().mockResolvedValue([]),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  };
  // clone returns a new qb with same behaviour (for count sub-query)
  qb.clone.mockReturnValue({ ...qb });
  return qb;
}

function createMockRepo() {
  const qb = createChainableQb();
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockResolvedValue({ id: 'saved-id' }),
    find: jest.fn(),
    findOne: jest.fn(),
  };
}

const mockDateHelper = {
  formatDate: jest.fn().mockReturnValue('2026-03-11 10:00:00'),
};

const mockSystemConfigService = {
  getConfigValues: jest.fn(),
};

// ─── Test Data ────────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-xyz-456';
const TEST_NOTIFICATION_ID = 'notif-001';
const TEST_CHART_ID = 'chart-001';
const TEST_WB_ID = 'wb-001';

const sampleSentRow = {
  id: 'sent-001',
  notificationSettingId: TEST_NOTIFICATION_ID,
  viewed: false,
  subTitle: 'Chart A',
  title: 'Widget A',
  type: 'upper',
  color: '#ff0000',
  value: 'Value exceeded threshold',
  sentAt: '2026-03-11 10:00',
  chartId: TEST_CHART_ID,
  widgetBuilderId: TEST_WB_ID,
};

const sampleSettingRow = {
  id: TEST_NOTIFICATION_ID,
  widgetBuilderId: TEST_WB_ID,
  widgetBuilderName: 'Widget A',
  chartId: TEST_CHART_ID,
  chartName: 'Chart A',
  upperMessage: 'High',
  midMessage: 'Mid',
  lowerMessage: 'Low',
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  let service: NotificationService;
  let sentRepo: ReturnType<typeof createMockRepo>;
  let settingsRepo: ReturnType<typeof createMockRepo>;
  let usersRepo: ReturnType<typeof createMockRepo>;
  let wbChartsRepo: ReturnType<typeof createMockRepo>;

  beforeEach(async () => {
    sentRepo = createMockRepo();
    settingsRepo = createMockRepo();
    usersRepo = createMockRepo();
    wbChartsRepo = createMockRepo();

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(CoreNotificationSent), useValue: sentRepo },
        { provide: getRepositoryToken(CoreNotificationSettings), useValue: settingsRepo },
        { provide: getRepositoryToken(CoreNotificationUsers), useValue: usersRepo },
        { provide: getRepositoryToken(CoreWidgetBuilderCharts), useValue: wbChartsRepo },
        { provide: DateHelperService, useValue: mockDateHelper },
        { provide: SystemConfigService, useValue: mockSystemConfigService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  // ─── listSent ────────────────────────────────────────────────────────────

  describe('listSent()', () => {
    it('should return paginated notification list with correct metadata', async () => {
      const qb = createChainableQb({
        getCount: jest.fn().mockResolvedValue(40),
        getRawMany: jest.fn().mockResolvedValue([sampleSentRow]),
      });
      qb.clone.mockReturnValue({ ...qb });
      sentRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listSent(TEST_USER_ID, 0, 20);

      expect(result.totalPages).toBe(2);
      expect(result.page).toBe(0);
      expect(result.nextPage).toBe(1);
      expect(result.prevPage).toBe(-1);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
      expect(result.data).toEqual([sampleSentRow]);
    });

    it('should apply search filter when search term is provided', async () => {
      const qb = createChainableQb({
        getCount: jest.fn().mockResolvedValue(1),
        getRawMany: jest.fn().mockResolvedValue([sampleSentRow]),
      });
      qb.clone.mockReturnValue({ ...qb });
      sentRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listSent(TEST_USER_ID, 0, 20, 'Widget A');

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LIKE :search'),
        expect.objectContaining({ search: '%Widget A%' }),
      );
    });

    it('should not apply andWhere when no search term is given', async () => {
      const qb = createChainableQb({
        getCount: jest.fn().mockResolvedValue(0),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      qb.clone.mockReturnValue({ ...qb });
      sentRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listSent(TEST_USER_ID, 0, 20);

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('should use default page=0 and size=20 when omitted', async () => {
      const qb = createChainableQb({
        getCount: jest.fn().mockResolvedValue(5),
        getRawMany: jest.fn().mockResolvedValue([sampleSentRow]),
      });
      qb.clone.mockReturnValue({ ...qb });
      sentRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listSent(TEST_USER_ID);

      expect(result.limit).toBe(20);
      expect(result.page).toBe(0);
    });

    it('should filter by userId in the where clause', async () => {
      const qb = createChainableQb({
        getCount: jest.fn().mockResolvedValue(0),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      qb.clone.mockReturnValue({ ...qb });
      sentRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listSent(TEST_USER_ID, 0, 20);

      expect(qb.where).toHaveBeenCalledWith('n_sent.userId = :userId', { userId: TEST_USER_ID });
    });
  });

  // ─── listNotificationsSettings ───────────────────────────────────────────

  describe('listNotificationsSettings()', () => {
    it('should return notification settings rows for the user', async () => {
      const qb = createChainableQb({
        getRawMany: jest.fn().mockResolvedValue([sampleSettingRow]),
      });
      settingsRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listNotificationsSettings(TEST_USER_ID);

      expect(result).toEqual([sampleSettingRow]);
    });

    it('should join notificationUsers with userId condition', async () => {
      const qb = createChainableQb({
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      settingsRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listNotificationsSettings(TEST_USER_ID);

      expect(qb.innerJoin).toHaveBeenCalledWith('n_setting.notificationUsers', 'n_users', 'n_users.userId = :userId', {
        userId: TEST_USER_ID,
      });
    });

    it('should return empty array when no settings are found', async () => {
      const qb = createChainableQb({
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      settingsRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listNotificationsSettings(TEST_USER_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── markAsViewed ─────────────────────────────────────────────────────────

  describe('markAsViewed()', () => {
    it('should execute update and return success true', async () => {
      const qb = createChainableQb({
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      });
      sentRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.markAsViewed(TEST_NOTIFICATION_ID, TEST_USER_ID);

      expect(result).toEqual({ success: true });
      expect(qb.execute).toHaveBeenCalled();
    });

    it('should update only unviewed notifications for the given user+id', async () => {
      const qb = createChainableQb();
      sentRepo.createQueryBuilder.mockReturnValue(qb);

      await service.markAsViewed(TEST_NOTIFICATION_ID, TEST_USER_ID);

      expect(qb.where).toHaveBeenCalledWith('id = :id AND userId = :userId AND viewed = :viewed', {
        id: TEST_NOTIFICATION_ID,
        userId: TEST_USER_ID,
        viewed: false,
      });
    });

    it('should set viewed=true and a viewedAt date', async () => {
      const qb = createChainableQb();
      sentRepo.createQueryBuilder.mockReturnValue(qb);

      await service.markAsViewed(TEST_NOTIFICATION_ID, TEST_USER_ID);

      expect(qb.set).toHaveBeenCalledWith(expect.objectContaining({ viewed: true, viewedAt: expect.any(Date) }));
    });
  });

  // ─── viewAll ─────────────────────────────────────────────────────────────

  describe('viewAll()', () => {
    it('should mark all notifications for user as viewed and return success', async () => {
      const qb = createChainableQb({
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      });
      sentRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.viewAll(TEST_USER_ID);

      expect(result).toEqual({ success: true });
      expect(qb.execute).toHaveBeenCalled();
    });

    it('should filter by userId and viewed=false', async () => {
      const qb = createChainableQb();
      sentRepo.createQueryBuilder.mockReturnValue(qb);

      await service.viewAll(TEST_USER_ID);

      expect(qb.where).toHaveBeenCalledWith('userId = :userId AND viewed = :viewed', {
        userId: TEST_USER_ID,
        viewed: false,
      });
    });
  });

  // ─── unsubscribeUserFromNotification ─────────────────────────────────────

  describe('unsubscribeUserFromNotification()', () => {
    it('should delete the subscription record and return success', async () => {
      const qb = createChainableQb({
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      });
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.unsubscribeUserFromNotification(TEST_NOTIFICATION_ID, TEST_USER_ID);

      expect(result).toEqual({ success: true });
      expect(qb.execute).toHaveBeenCalled();
    });

    it('should scope deletion to userId and notificationId', async () => {
      const qb = createChainableQb();
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await service.unsubscribeUserFromNotification(TEST_NOTIFICATION_ID, TEST_USER_ID);

      expect(qb.where).toHaveBeenCalledWith('userId = :userId AND notificationId = :notificationId', {
        userId: TEST_USER_ID,
        notificationId: TEST_NOTIFICATION_ID,
      });
    });
  });

  // ─── testEmail ───────────────────────────────────────────────────────────

  describe('testEmail()', () => {
    it('should return success true with the provided email', async () => {
      const result = await service.testEmail('test@example.com');

      expect(result).toEqual({ success: true, email: 'test@example.com' });
    });

    it('should not interact with any repository', async () => {
      await service.testEmail('user@example.com');

      expect(sentRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(settingsRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(usersRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── fetchChartNotificationUsers ─────────────────────────────────────────

  describe('fetchChartNotificationUsers()', () => {
    it('should group users by threshold status correctly', async () => {
      const qb = createChainableQb({
        getRawMany: jest.fn().mockResolvedValue([
          { id: 'user-1', status: 'upper' },
          { id: 'user-2', status: 'middle' },
          { id: 'user-3', status: 'lower' },
          { id: 'user-4', status: 'upper' },
        ]),
      });
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.fetchChartNotificationUsers(TEST_CHART_ID, TEST_WB_ID);

      expect(result.up).toEqual(['user-1', 'user-4']);
      expect(result.mid).toEqual(['user-2']);
      expect(result.low).toEqual(['user-3']);
    });

    it('should return empty groups when no users are subscribed to the chart', async () => {
      const qb = createChainableQb({
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.fetchChartNotificationUsers(TEST_CHART_ID, TEST_WB_ID);

      expect(result).toEqual({ up: [], mid: [], low: [] });
    });

    it('should query with chartId and widgetBuilderId in where clause', async () => {
      const qb = createChainableQb({
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await service.fetchChartNotificationUsers(TEST_CHART_ID, TEST_WB_ID);

      expect(qb.where).toHaveBeenCalledWith(
        'n_setting.chartId = :chartId AND n_setting.widgetBuilderId = :widgetBuilderId',
        { chartId: TEST_CHART_ID, widgetBuilderId: TEST_WB_ID },
      );
    });

    it('should ignore rows with unknown status values', async () => {
      const qb = createChainableQb({
        getRawMany: jest.fn().mockResolvedValue([
          { id: 'user-1', status: 'none' },
          { id: 'user-2', status: 'unknown' },
        ]),
      });
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.fetchChartNotificationUsers(TEST_CHART_ID, TEST_WB_ID);

      expect(result.up).toHaveLength(0);
      expect(result.mid).toHaveLength(0);
      expect(result.low).toHaveLength(0);
    });
  });

  // ─── getNotificationConfig ────────────────────────────────────────────────

  describe('getNotificationConfig()', () => {
    it('should return all 6 notification config values from SystemConfigService', async () => {
      const configResult = {
        notificationLowerIcon: 'icon-low',
        notificationMiddleIcon: 'icon-mid',
        notificationUpperIcon: 'icon-up',
        notificationLowerColor: '#00ff00',
        notificationMiddleColor: '#ffff00',
        notificationUpperColor: '#ff0000',
      };
      mockSystemConfigService.getConfigValues.mockResolvedValue(configResult);

      const result = await service.getNotificationConfig();

      expect(result).toEqual(configResult);
      expect(mockSystemConfigService.getConfigValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          'notificationLowerIcon',
          'notificationMiddleIcon',
          'notificationUpperIcon',
          'notificationLowerColor',
          'notificationMiddleColor',
          'notificationUpperColor',
        ]),
      );
    });
  });

  // ─── saveNotificationSent ─────────────────────────────────────────────────

  describe('saveNotificationSent()', () => {
    it('should persist notification sent record and return saved entity', async () => {
      const payload = {
        userId: TEST_USER_ID,
        notificationId: TEST_NOTIFICATION_ID,
        widgetBuilderName: 'Widget A',
        chartName: 'Chart A',
        message: 'Threshold exceeded',
        color: '#ff0000',
        type: 'upper',
      };
      sentRepo.create.mockReturnValue({ ...payload, viewed: false, createdAt: new Date() });
      sentRepo.save.mockResolvedValue({ id: 'saved-sent-001', ...payload });

      const result = await service.saveNotificationSent(payload);

      expect(sentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ viewed: false, ...payload }));
      expect(sentRepo.save).toHaveBeenCalled();
      expect(result).toHaveProperty('id', 'saved-sent-001');
    });
  });
});
