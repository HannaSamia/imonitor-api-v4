import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CoreNotificationSent } from '../../database/entities/core-notification-sent.entity';
import { CoreNotificationSettings } from '../../database/entities/core-notification-settings.entity';
import { CoreNotificationUsers } from '../../database/entities/core-notification-users.entity';
import { CoreWidgetBuilderCharts } from '../../database/entities/core-widget-builder-charts.entity';
import { DateHelperService, DATE_FULL_TIME } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { NotificationsTypes } from '../../shared/enums/notification.enum';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(CoreNotificationSent)
    private readonly sentRepo: Repository<CoreNotificationSent>,
    @InjectRepository(CoreNotificationSettings)
    private readonly settingsRepo: Repository<CoreNotificationSettings>,
    @InjectRepository(CoreNotificationUsers)
    private readonly usersRepo: Repository<CoreNotificationUsers>,
    @InjectRepository(CoreWidgetBuilderCharts)
    private readonly wbChartsRepo: Repository<CoreWidgetBuilderCharts>,
    private readonly dateHelper: DateHelperService,
    private readonly systemConfigService: SystemConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // =========================================================================
  // LIST SENT NOTIFICATIONS (paginated + search)
  // =========================================================================

  async listSent(userId: string, page = 0, size = 20, search?: string) {
    const qb = this.sentRepo
      .createQueryBuilder('n_sent')
      .innerJoin('n_sent.notificationSetting', 'n_setting')
      .select([
        'n_sent.id AS id',
        'n_setting.id AS notificationSettingId',
        'n_sent.viewed AS viewed',
        'n_sent.chartName AS subTitle',
        'n_sent.widgetBuilderName AS title',
        'n_sent.type AS type',
        'n_sent.color AS color',
        'n_sent.message AS value',
        "DATE_FORMAT(n_sent.createdAt, '%Y-%m-%d %H:%i') AS sentAt",
        'n_setting.chartId AS chartId',
        'n_setting.widgetBuilderId AS widgetBuilderId',
      ])
      .where('n_sent.userId = :userId', { userId });

    if (search) {
      qb.andWhere(
        '(n_sent.chartName LIKE :search OR n_sent.widgetBuilderName LIKE :search OR n_sent.message LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Count total
    const countQb = qb.clone();
    const totalItems = await countQb.getCount();
    const totalPages = Math.ceil(totalItems / size);
    const currentPage = page;

    // Fetch paginated
    const data = await qb
      .orderBy('n_sent.createdAt', 'DESC')
      .limit(size)
      .offset(page * size)
      .getRawMany();

    return {
      limit: size,
      page: currentPage,
      nextPage: currentPage + 1,
      prevPage: currentPage - 1,
      totalPages,
      hasNext: currentPage < totalPages - 1,
      hasPrev: currentPage > 0,
      data,
    };
  }

  // =========================================================================
  // LIST NOTIFICATION SETTINGS (user subscriptions)
  // =========================================================================

  async listNotificationsSettings(userId: string) {
    const results = await this.settingsRepo
      .createQueryBuilder('n_setting')
      .innerJoin('n_setting.notificationUsers', 'n_users', 'n_users.userId = :userId', { userId })
      .innerJoin('core_widget_builder', 'wb', 'wb.id = n_setting.widgetBuilderId')
      .innerJoin('core_widget_builder_charts', 'wbc', 'wbc.id = n_setting.chartId')
      .select([
        'n_setting.id AS id',
        'wb.id AS widgetBuilderId',
        'wb.name AS widgetBuilderName',
        'wbc.id AS chartId',
        'wbc.name AS chartName',
        "JSON_EXTRACT(wbc.notification, '$.upper.message') AS upperMessage",
        "JSON_EXTRACT(wbc.notification, '$.mid.message') AS midMessage",
        "JSON_EXTRACT(wbc.notification, '$.lower.message') AS lowerMessage",
      ])
      .groupBy('n_setting.widgetBuilderId')
      .addGroupBy('n_setting.chartId')
      .orderBy("GREATEST(n_setting.createdAt, COALESCE(n_setting.updatedAt, '1973-01-01'))", 'DESC')
      .getRawMany();

    return results;
  }

  // =========================================================================
  // MARK AS VIEWED (single)
  // =========================================================================

  async markAsViewed(id: string, userId: string) {
    const now = this.dateHelper.formatDate(DATE_FULL_TIME);
    await this.sentRepo
      .createQueryBuilder()
      .update(CoreNotificationSent)
      .set({ viewed: true, viewedAt: new Date(now) })
      .where('id = :id AND userId = :userId AND viewed = :viewed', { id, userId, viewed: false })
      .execute();

    return { success: true };
  }

  // =========================================================================
  // VIEW ALL (mark all as viewed)
  // =========================================================================

  async viewAll(userId: string) {
    const now = this.dateHelper.formatDate(DATE_FULL_TIME);
    await this.sentRepo
      .createQueryBuilder()
      .update(CoreNotificationSent)
      .set({ viewed: true, viewedAt: new Date(now) })
      .where('userId = :userId AND viewed = :viewed', { userId, viewed: false })
      .execute();

    return { success: true };
  }

  // =========================================================================
  // UNSUBSCRIBE USER FROM NOTIFICATION
  // =========================================================================

  async unsubscribeUserFromNotification(notificationId: string, userId: string) {
    await this.usersRepo
      .createQueryBuilder()
      .delete()
      .from(CoreNotificationUsers)
      .where('userId = :userId AND notificationId = :notificationId', { userId, notificationId })
      .execute();

    return { success: true };
  }

  // =========================================================================
  // TEST EMAIL (send test notification email)
  // =========================================================================

  async testEmail(email: string) {
    // Email/SMS integration will be implemented in Phase 4 (Socket.IO)
    // For now, return success to maintain endpoint parity with v3
    this.logger.log(`Test notification email requested for: ${email}`);
    return { success: true, email };
  }

  // =========================================================================
  // FETCH CHART NOTIFICATION USERS (for Socket.IO integration — Phase 4)
  // =========================================================================

  async fetchChartNotificationUsers(chartId: string, widgetBuilderId: string) {
    const rows = await this.usersRepo
      .createQueryBuilder('n_users')
      .innerJoin('n_users.notificationSetting', 'n_setting')
      .select(['n_users.userId AS id', 'n_users.status AS status'])
      .where('n_setting.chartId = :chartId AND n_setting.widgetBuilderId = :widgetBuilderId', {
        chartId,
        widgetBuilderId,
      })
      .getRawMany<{ id: string; status: string }>();

    const grouped: { up: string[]; mid: string[]; low: string[] } = {
      up: [],
      mid: [],
      low: [],
    };

    for (const row of rows) {
      if (row.status === 'upper') grouped.up.push(row.id);
      else if (row.status === 'middle') grouped.mid.push(row.id);
      else if (row.status === 'lower') grouped.low.push(row.id);
    }

    return grouped;
  }

  // =========================================================================
  // GET NOTIFICATION SYSTEM CONFIG (colors/icons for threshold levels)
  // =========================================================================

  async getNotificationConfig(): Promise<Record<string, string>> {
    return this.systemConfigService.getConfigValues([
      'notificationLowerIcon',
      'notificationMiddleIcon',
      'notificationUpperIcon',
      'notificationLowerColor',
      'notificationMiddleColor',
      'notificationUpperColor',
    ]);
  }

  // =========================================================================
  // SAVE NOTIFICATION SENT (persist after delivery — for Socket.IO Phase 4)
  // =========================================================================

  async saveNotificationSent(data: {
    userId: string;
    notificationId: string;
    widgetBuilderName: string;
    chartName: string;
    message: string;
    color: string;
    type: string;
  }) {
    const entity = this.sentRepo.create({
      ...data,
      viewed: false,
      createdAt: new Date(),
    });
    return this.sentRepo.save(entity);
  }

  // =========================================================================
  // PROCESS CHART NOTIFICATION (Phase 4 — Socket.IO / ETL trigger)
  // =========================================================================

  /**
   * Processes threshold-based notifications for a chart result.
   * Fetches subscribed users, checks threshold crossings, emits
   * `socket.notification.send` events via EventEmitter2, and persists
   * sent notification records.
   *
   * v3: NotificationService.processNotification()
   */
  async processChartNotification(chart: Record<string, unknown>, widgetBuilderId: string): Promise<void> {
    const options = chart.options as Record<string, unknown> | undefined;
    const chartId = chart.id as string | undefined;
    const chartName = chart.name as string | undefined;

    if (!chartId || !widgetBuilderId) return;

    const subscribers = await this.fetchChartNotificationUsers(chartId, widgetBuilderId);
    const hasSubscribers = subscribers.up.length > 0 || subscribers.mid.length > 0 || subscribers.low.length > 0;
    if (!hasSubscribers) return;

    const config = await this.getNotificationConfig();

    // Retrieve widget builder name for the notification record
    const wbChart = await this.wbChartsRepo.findOne({
      where: { id: chartId },
      relations: { widgetBuilder: true },
    });
    const widgetBuilderName = (wbChart as unknown as { widgetBuilder?: { name?: string } })?.widgetBuilder?.name ?? '';

    // Determine whether a threshold has been crossed
    const calculatedThreshold = options?.calculatedThreshold as number | undefined;
    const seriesValue = (
      (chart.lib as Record<string, unknown> | undefined)?.series as { data?: Array<{ value?: number }> } | undefined
    )?.data?.[0]?.value;

    if (calculatedThreshold === undefined || seriesValue === undefined) return;

    // Map threshold to notification type
    let notificationType: NotificationsTypes | null = null;
    const thresholdConfig = options as Record<string, unknown> | undefined;

    const upperThreshold = thresholdConfig?.upperThreshold as number | undefined;
    const midThreshold = thresholdConfig?.midThreshold as number | undefined;
    const lowerThreshold = thresholdConfig?.lowerThreshold as number | undefined;

    if (upperThreshold !== undefined && seriesValue >= upperThreshold) {
      notificationType = NotificationsTypes.UP;
    } else if (midThreshold !== undefined && seriesValue >= midThreshold) {
      notificationType = NotificationsTypes.MID;
    } else if (lowerThreshold !== undefined && seriesValue <= lowerThreshold) {
      notificationType = NotificationsTypes.LOW;
    }

    if (!notificationType) return;

    // Build the notification payload
    const notificationData = chart.notification as Record<string, unknown> | undefined;
    const levelKey =
      notificationType === NotificationsTypes.UP
        ? 'upper'
        : notificationType === NotificationsTypes.MID
          ? 'mid'
          : 'lower';

    const levelConfig = (notificationData?.[levelKey] as Record<string, unknown> | undefined) ?? {};
    const message = (levelConfig.message as string | undefined) ?? String(seriesValue);
    const color =
      notificationType === NotificationsTypes.UP
        ? (config.notificationUpperColor ?? '')
        : notificationType === NotificationsTypes.MID
          ? (config.notificationMiddleColor ?? '')
          : (config.notificationLowerColor ?? '');
    const icon =
      notificationType === NotificationsTypes.UP
        ? (config.notificationUpperIcon ?? '')
        : notificationType === NotificationsTypes.MID
          ? (config.notificationMiddleIcon ?? '')
          : (config.notificationLowerIcon ?? '');

    const sentAt = this.dateHelper.formatDate(DATE_FULL_TIME);

    interface AlertPayload {
      title: string;
      subTitle: string;
      type: string;
      value: string;
      color: string;
      icon: string;
      sentAt: string;
    }

    const alertPayload: AlertPayload = {
      title: widgetBuilderName,
      subTitle: chartName ?? chartId,
      type: notificationType,
      value: message,
      color,
      icon,
      sentAt,
    };

    // Resolve the notification setting ID for saving sent records
    const setting = await this.settingsRepo.findOne({
      where: { chartId, widgetBuilderId },
    });
    const notificationId = setting?.id ?? '';

    // Determine which user list to notify
    const targetUserIds =
      notificationType === NotificationsTypes.UP
        ? subscribers.up
        : notificationType === NotificationsTypes.MID
          ? subscribers.mid
          : subscribers.low;

    for (const userId of targetUserIds) {
      // Emit socket event
      this.eventEmitter.emit('socket.notification.send', { userId, payload: alertPayload });

      // Persist sent record — fire-and-forget
      if (notificationId) {
        this.saveNotificationSent({
          userId,
          notificationId,
          widgetBuilderName,
          chartName: chartName ?? chartId,
          message,
          color,
          type: notificationType,
        }).catch((err: Error) => this.logger.error(`saveNotificationSent failed for ${userId}: ${err.message}`));
      }
    }
  }
}
