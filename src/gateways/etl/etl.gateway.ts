import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection } from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Namespace, Socket } from 'socket.io';
import Bottleneck from 'bottleneck';
import { CoreDashboardError } from '../../database/entities/core-dashboard-error.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { WidgetBuilderService } from '../../modules/widget-builder/widget-builder.service';
import { NotificationService } from '../../modules/notifications/notification.service';
import { GenerateChartByTypeDto } from '../../modules/widget-builder/dto/generate-chart-by-type.dto';
import { DashboardGateway } from '../dashboard/dashboard.gateway';
import { ConnectivityGateway } from '../connectivity/connectivity.gateway';

@Injectable()
@WebSocketGateway({ namespace: '/etl', transports: ['websocket'] })
export class EtlGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Namespace;

  private static readonly ROOM = 'etl';

  /**
   * Chart types whose results do NOT trigger notification processing.
   * Mirrors v3's CHARTS_WITHOUT_NOTIFICATION constant.
   */
  private static readonly CHARTS_WITHOUT_NOTIFICATION = ['compare_trend', 'trend', 'widget_builder_trend', 'pie'];

  private readonly logger = new Logger(EtlGateway.name);

  private readonly limiter: Bottleneck;

  constructor(
    private readonly dashboardGateway: DashboardGateway,
    private readonly connectivityGateway: ConnectivityGateway,
    private readonly widgetBuilderService: WidgetBuilderService,
    private readonly notificationService: NotificationService,
    @InjectRepository(CoreDashboardError)
    private readonly dashboardErrorRepo: Repository<CoreDashboardError>,
    private readonly dateHelper: DateHelperService,
  ) {
    // No Redis backing — single process Bottleneck is sufficient here
    this.limiter = new Bottleneck({ maxConcurrent: 10, minTime: 100 });
  }

  handleConnection(client: Socket): void {
    client.join(EtlGateway.ROOM);
    this.logger.log(`ETL client connected: ${client.id}`);
  }

  /**
   * Handles the `trigger` event from ETL clients.
   * Finds all widget builders using the given table, then regenerates
   * all charts currently open on dashboard sockets for those widget builders.
   */
  @SubscribeMessage('trigger')
  async handleTrigger(client: Socket, body: { tableName: string }): Promise<void> {
    const { tableName } = body;
    if (!tableName) return;

    this.logger.log(`ETL trigger received for table: ${tableName}`);

    let widgetBuilderIds: string[];
    try {
      widgetBuilderIds = await this.widgetBuilderService.fetchWidgetBuildersByTableName(tableName);
    } catch (err: unknown) {
      this.logger.error(`fetchWidgetBuildersByTableName failed: ${(err as Error).message}`);
      return;
    }

    if (widgetBuilderIds.length === 0) return;

    // Get all charts currently open on dashboard sockets
    let clientMap: Record<string, GenerateChartByTypeDto[]>;
    try {
      clientMap = await this.dashboardGateway.getClientsFromStorage();
    } catch (err: unknown) {
      this.logger.error(`getClientsFromStorage failed: ${(err as Error).message}`);
      return;
    }

    const tasks: Array<() => Promise<void>> = [];

    for (const [socketId, charts] of Object.entries(clientMap)) {
      // Deduplicate: unique charts matching a triggered widgetBuilderId
      const seen = new Set<string>();
      const uniqueCharts = charts.filter((chart) => {
        if (!widgetBuilderIds.includes(chart.widgetBuilderId)) return false;
        const key = `${chart.widgetBuilderId}_${chart.chartId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      for (const chart of uniqueCharts) {
        const capturedSocketId = socketId;
        const capturedChart = chart;
        tasks.push(() => this.processChart(capturedChart, capturedSocketId));
      }
    }

    // Schedule all tasks via Bottleneck
    await Promise.allSettled(tasks.map((task) => this.limiter.schedule(task)));
  }

  /**
   * Handles the `connectivityCheck` event — broadcasts connectivity updates
   * to all connected connectivity clients.
   */
  @SubscribeMessage('connectivityCheck')
  async handleConnectivityCheck(): Promise<void> {
    this.logger.log('ETL connectivity check triggered');
    try {
      await this.connectivityGateway.broadcastConnectivityUpdate();
    } catch (err: unknown) {
      this.logger.error(`broadcastConnectivityUpdate failed: ${(err as Error).message}`);
    }
  }

  /**
   * Generates a chart and emits the result directly to the target dashboard socket.
   * On error, saves to CoreDashboardError and emits an error payload.
   */
  private async processChart(chart: GenerateChartByTypeDto, socketId: string): Promise<void> {
    const { widgetBuilderId, chartId } = chart;
    try {
      const result = await this.widgetBuilderService.generateChartByType(chart);
      this.dashboardGateway.server.to(socketId).emit(`${widgetBuilderId}_${chartId}`, result);

      // Notify if chart type warrants it
      const chartType = (result as Record<string, unknown>).type as string | undefined;
      if (chartType && !EtlGateway.CHARTS_WITHOUT_NOTIFICATION.includes(chartType)) {
        this.notificationService
          .processChartNotification(result as Record<string, unknown>, widgetBuilderId)
          .catch((err: Error) =>
            this.logger.error(`processChartNotification failed for ${widgetBuilderId}: ${err.message}`),
          );
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`processChart error [${widgetBuilderId}/${chartId}]: ${err.message}`);

      // Persist error — fire-and-forget
      this.dashboardErrorRepo
        .save(
          this.dashboardErrorRepo.create({
            errorstack: err.stack ?? err.message,
            errorDate: new Date(),
            widgetBuilderId,
            chartId,
          }),
        )
        .catch((saveErr: Error) => this.logger.error(`Error saving dashboard error: ${saveErr.message}`));

      this.dashboardGateway.server.to(socketId).emit(`${widgetBuilderId}_${chartId}`, {
        hasError: true,
        message: 'Chart not loaded',
        error: err.stack,
      });
    }
  }
}
