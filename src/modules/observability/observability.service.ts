/**
 * ObservabilityService - Metrics, Charts, and Dashboards for observability module.
 *
 * Faithfully ported from v3 infrastructure/services/observability.service.ts (~1766 lines).
 * Handles: metrics CRUD, chart management, dashboard management, query execution,
 * threshold evaluation, and chart generation.
 */

import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { v4 } from 'uuid';
import { CoreObservabilityMetrics } from '../../database/entities/core-observability-metrics.entity';
import { CoreObservabilityMetricsModule } from '../../database/entities/core-observability-metrics-module.entity';
import { CoreObservabilityMetricsUsedTables } from '../../database/entities/core-observability-metrics-used-tables.entity';
import { CoreObservabilityMetricsFilters } from '../../database/entities/core-observability-metrics-filters.entity';
import { CoreObservabilityMetricsThresholds } from '../../database/entities/core-observability-metrics-thresholds.entity';
import { CoreObservabilityMetricsAlerts } from '../../database/entities/core-observability-metrics-alerts.entity';
import { CoreObservabilityMetricsTypes } from '../../database/entities/core-observability-metrics-types.entity';
import { CoreObservabilityCharts } from '../../database/entities/core-observability-charts.entity';
import { CoreObservabilityMetricCharts } from '../../database/entities/core-observability-metric-charts.entity';
import { CoreObservabilityDashboard } from '../../database/entities/core-observability-dashboard.entity';
import { CoreObservabilityDashboardCharts } from '../../database/entities/core-observability-dashboard-charts.entity';
import { CoreObservabilityDashboardError } from '../../database/entities/core-observability-dashboard-error.entity';
import { CoreObservabilityNotificationSent } from '../../database/entities/core-observability-notification-sent.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { isEmptyString } from '../../shared/helpers/common.helper';
import { ObservabilityChartType, MetricChartFilters } from '../../shared/enums/observability.enum';
import { ObservabilityUtilService } from './services/observability-util.service';
import { ObservabilityQueryService } from './services/observability-query.service';
import {
  SaveObservabilityMetricDto,
  UpdateObservabilityMetricDto,
  GenerateObservabilityMetricDto,
  GetMetricsByNodeIdsDto,
  ListObservabilityMetricDto,
  FilterObservabilityMetricsDto,
  ObservabilityGoToReportDto,
  ExecuteQueryResultDto,
  ObservabilityMetricViewDto,
  ModuleNodeDto,
} from './dto/observability-metric.dto';
import {
  SaveObservabilityChartDto,
  UpdateObservabilityChartDto,
  ListObservabilityChartsDto,
} from './dto/observability-chart.dto';
import {
  SaveObservabilityDashboardDto,
  UpdateObservabilityDashboardDto,
  ListObservabilityDashboardsDto,
  GetDashboardByIdDto,
  ObservabilityDashboardChartDto,
} from './dto/observability-dashboard.dto';

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);

  constructor(
    @InjectRepository(CoreObservabilityMetrics)
    private readonly metricsRepo: Repository<CoreObservabilityMetrics>,
    @InjectRepository(CoreObservabilityMetricsModule)
    private readonly metricsModuleRepo: Repository<CoreObservabilityMetricsModule>,
    @InjectRepository(CoreObservabilityMetricsUsedTables)
    private readonly metricsUsedTablesRepo: Repository<CoreObservabilityMetricsUsedTables>,
    @InjectRepository(CoreObservabilityMetricsFilters)
    private readonly metricsFiltersRepo: Repository<CoreObservabilityMetricsFilters>,
    @InjectRepository(CoreObservabilityMetricsThresholds)
    private readonly metricsThresholdsRepo: Repository<CoreObservabilityMetricsThresholds>,
    @InjectRepository(CoreObservabilityMetricsAlerts)
    private readonly metricsAlertsRepo: Repository<CoreObservabilityMetricsAlerts>,
    @InjectRepository(CoreObservabilityMetricsTypes)
    private readonly metricsTypesRepo: Repository<CoreObservabilityMetricsTypes>,
    @InjectRepository(CoreObservabilityCharts)
    private readonly chartsRepo: Repository<CoreObservabilityCharts>,
    @InjectRepository(CoreObservabilityMetricCharts)
    private readonly metricChartsRepo: Repository<CoreObservabilityMetricCharts>,
    @InjectRepository(CoreObservabilityDashboard)
    private readonly dashboardRepo: Repository<CoreObservabilityDashboard>,
    @InjectRepository(CoreObservabilityDashboardCharts)
    private readonly dashboardChartsRepo: Repository<CoreObservabilityDashboardCharts>,
    @InjectRepository(CoreObservabilityDashboardError)
    private readonly dashboardErrorRepo: Repository<CoreObservabilityDashboardError>,
    @InjectRepository(CoreObservabilityNotificationSent)
    private readonly notificationSentRepo: Repository<CoreObservabilityNotificationSent>,
    @InjectRepository(CoreModules)
    private readonly modulesRepo: Repository<CoreModules>,
    @InjectRepository(CoreModulesTables)
    private readonly modulesTablesRepo: Repository<CoreModulesTables>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly dateHelper: DateHelperService,
    private readonly systemConfig: SystemConfigService,
    private readonly utilService: ObservabilityUtilService,
    private readonly queryService: ObservabilityQueryService,
  ) {}

  // =========================================================================
  // METRICS — Nodes & Fields
  // =========================================================================

  /**
   * Fetch all module nodes (isNode=true).
   * v3: fetchNodes()
   */
  async fetchNodes(): Promise<ModuleNodeDto[]> {
    const nodes = await this.modulesRepo.find({
      where: { isNode: true },
      select: { id: true, name: true },
    });
    return nodes.map((n) => ({ id: n.id, name: n.name }));
  }

  /**
   * Fetch statistics table fields by node IDs.
   * v3: fetchFieldsByNode()
   */
  async fetchFieldsByNode(ids: number[]): Promise<unknown> {
    if (!ids || ids.length === 0) return { refTable: null, tables: [] };

    const tables = await this.modulesTablesRepo
      .createQueryBuilder('mt')
      .select(['mt.id', 'mt.displayName'])
      .where('mt.tableType = :type', { type: 'statistics' })
      .andWhere('mt.tableName <> :excluded', { excluded: 'params_table' })
      .andWhere('mt.mId IN (:...ids)', { ids })
      .getMany();

    return { tables: tables.map((t) => ({ id: t.id, displayName: t.displayName })) };
  }

  /**
   * Get metrics by node IDs.
   * v3: getMetricsByNodeIds()
   */
  async getMetricsByNodeIds(body: GetMetricsByNodeIdsDto): Promise<Array<{ id: string; name: string }>> {
    if (!body.nodeIds || body.nodeIds.length === 0) return [];

    const metrics = await this.metricsRepo
      .createQueryBuilder('m')
      .innerJoin('core_observability_metrics_module', 'mm', 'mm.observabilityMetricId = m.id')
      .where('mm.moduleId IN (:...ids)', { ids: body.nodeIds })
      .select(['m.id', 'm.name'])
      .distinct(true)
      .getMany();

    return metrics.map((m) => ({ id: m.id, name: m.name }));
  }

  // =========================================================================
  // METRICS — CRUD
  // =========================================================================

  /**
   * List all observability metrics.
   * v3: listMetrics()
   */
  async listMetrics(): Promise<ListObservabilityMetricDto[]> {
    return this.dataSource.query(
      `SELECT m.id, m.name, m.ownerId, m.isFavorite, m.isExploded,
              (SELECT userName FROM core_application_users WHERE id = m.ownerId) AS owner,
              DATE_FORMAT(m.createdAt, "%Y-%m-%d %H:%i") AS createdAt,
              DATE_FORMAT(m.updatedAt, "%Y-%m-%d %H:%i") AS updatedAt
       FROM core_observability_metrics m
       ORDER BY m.isDefault DESC, m.isFavorite DESC, m.updatedAt DESC`,
    );
  }

  /**
   * List metrics filtered for chart selection (all/exploded/normal).
   * v3: listMetricsForCharts()
   */
  async listMetricsForCharts(filter: MetricChartFilters): Promise<FilterObservabilityMetricsDto[]> {
    let whereClause = '';
    if (filter === MetricChartFilters.EXPLODED) {
      whereClause = 'WHERE m.isExploded = 1';
    } else if (filter === MetricChartFilters.NORMAL) {
      whereClause = 'WHERE m.isExploded = 0 OR m.isExploded IS NULL';
    }

    return this.dataSource.query(
      `SELECT m.id, m.name, m.isExploded
       FROM core_observability_metrics m ${whereClause}
       ORDER BY m.name`,
    );
  }

  /**
   * Get metric by ID with full configuration (tables, filters, alarms).
   * v3: getMetricById()
   */
  async getMetricById(id: string): Promise<unknown> {
    const metric = await this.metricsRepo.findOne({ where: { id } });
    if (!metric) {
      throw new NotFoundException(ErrorMessages.METRIC_DOES_NOT_EXIST);
    }

    const parsed: Record<string, unknown> = {
      id: metric.id,
      name: metric.name,
      ownerId: metric.ownerId,
      isFavorite: !!metric.isFavorite,
      isExploded: !!metric.isExploded,
      limit: metric.limit,
      chartsPerRow: metric.chartsPerRow,
      type: metric.type,
      createdAt: metric.createdAt,
      updatedAt: metric.updatedAt,
      tables: this.safeJsonParse(metric.tables),
      control: this.safeJsonParse(metric.control),
      compare: this.safeJsonParse(metric.compare),
      operation: this.safeJsonParse(metric.operation),
      globalFilter: this.safeJsonParse(metric.globalFilter),
      orderBy: this.safeJsonParse(metric.orderBy),
      options: this.safeJsonParse(metric.options),
      nodeIds: this.safeJsonParse(metric.nodeIds),
      metricField: this.safeJsonParse(metric.metricField),
      explodedField: this.safeJsonParse(metric.explodedField),
    };

    // Retrieve time filters & thresholds
    parsed.threshold = await this.retrieveTimeFilters(id);

    // Retrieve alarms
    parsed.alarms = await this.retrieveAlarms(id);

    return parsed;
  }

  /**
   * Save a new observability metric.
   * v3: saveMetric()
   */
  async saveMetric(dto: SaveObservabilityMetricDto, currentUserId: string): Promise<string> {
    const metricField = this.utilService.fetchMetricField(
      dto as unknown as Parameters<typeof this.utilService.fetchMetricField>[0],
    );
    if (!metricField) {
      throw new BadRequestException(ErrorMessages.DEFAULT_METRIC_NOT_SELECTED);
    }

    const explodedField = this.utilService.fetchExplodedField(
      dto as unknown as Parameters<typeof this.utilService.fetchExplodedField>[0],
    );
    const id = v4();

    // Generate metric query for DB storage
    let metricQuery: string | null = null;
    try {
      const generateResult = await this.queryService.generateObservability(
        { ...dto, fromDate: '', toDate: '', timeFrame: 'current' } as unknown as GenerateObservabilityMetricDto,
        true,
      );
      metricQuery = generateResult?.query || null;
    } catch (error) {
      this.logger.warn('Failed to generate metric query for storage', (error as Error).message);
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        // Save metric
        await manager.save(CoreObservabilityMetrics, {
          id,
          name: dto.name,
          ownerId: currentUserId,
          tables: this.safeJsonStringify(dto.tables),
          control: this.safeJsonStringify(dto.control),
          compare: this.safeJsonStringify(dto.compare),
          operation: this.safeJsonStringify(dto.operation),
          globalFilter: this.safeJsonStringify(dto.globalFilter),
          orderBy: this.safeJsonStringify(dto.orderBy),
          options: this.safeJsonStringify(dto.options),
          nodeIds: this.safeJsonStringify(dto.nodeIds),
          metricField: this.safeJsonStringify(metricField),
          explodedField: this.safeJsonStringify(explodedField),
          metricQuery,
          isExploded: dto.isExploded ? 1 : 0,
          limit: dto.limit || null,
          chartsPerRow: dto.chartsPerRow || null,
          type: dto.type || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Save module associations
        await this.saveMetricModules(manager, id, dto);

        // Save used tables
        await this.saveMetricUsedTables(manager, id, dto);

        // Save time filters & thresholds
        if (dto.threshold) {
          await this.saveTimeFilters(manager, id, dto.threshold);
        }

        // Save alarms
        if (dto.alarms) {
          await this.saveAlarms(manager, id, dto.alarms);
        }
      });
    } catch (error) {
      this.logger.error('Error saving metric', (error as Error).stack);
      throw new BadRequestException(ErrorMessages.ERROR_SAVE);
    }

    return id;
  }

  /**
   * Update an existing observability metric.
   * v3: updateMetric()
   */
  async updateMetric(currentUserId: string, dto: UpdateObservabilityMetricDto): Promise<void> {
    const existing = await this.metricsRepo.findOne({ where: { id: dto.id } });
    if (!existing) {
      throw new NotFoundException(ErrorMessages.METRIC_DOES_NOT_EXIST);
    }

    if (existing.ownerId !== currentUserId) {
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ACTION);
    }

    // Check if exploded status changed — not allowed if charts exist
    if (existing.isExploded !== (dto.isExploded ? 1 : 0)) {
      const chartCount = await this.metricChartsRepo.count({ where: { metricId: dto.id } });
      if (chartCount > 0) {
        throw new BadRequestException(ErrorMessages.EXPLODED_STATUS_CHANGED);
      }
    }

    const metricField = this.utilService.fetchMetricField(
      dto as unknown as Parameters<typeof this.utilService.fetchMetricField>[0],
    );
    if (!metricField) {
      throw new BadRequestException(ErrorMessages.DEFAULT_METRIC_NOT_SELECTED);
    }
    const explodedField = this.utilService.fetchExplodedField(
      dto as unknown as Parameters<typeof this.utilService.fetchExplodedField>[0],
    );

    let metricQuery: string | null = null;
    try {
      const generateResult = await this.queryService.generateObservability(
        { ...dto, fromDate: '', toDate: '', timeFrame: 'current' } as unknown as GenerateObservabilityMetricDto,
        true,
      );
      metricQuery = generateResult?.query || null;
    } catch (error) {
      this.logger.warn('Failed to generate metric query for storage', (error as Error).message);
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        // Update metric
        await manager.update(
          CoreObservabilityMetrics,
          { id: dto.id },
          {
            name: dto.name,
            tables: this.safeJsonStringify(dto.tables),
            control: this.safeJsonStringify(dto.control),
            compare: this.safeJsonStringify(dto.compare),
            operation: this.safeJsonStringify(dto.operation),
            globalFilter: this.safeJsonStringify(dto.globalFilter),
            orderBy: this.safeJsonStringify(dto.orderBy),
            options: this.safeJsonStringify(dto.options),
            nodeIds: this.safeJsonStringify(dto.nodeIds),
            metricField: this.safeJsonStringify(metricField),
            explodedField: this.safeJsonStringify(explodedField),
            metricQuery,
            isExploded: dto.isExploded ? 1 : 0,
            limit: dto.limit || null,
            chartsPerRow: dto.chartsPerRow || null,
            type: dto.type || null,
            updatedAt: new Date(),
            updatedBy: currentUserId,
          },
        );

        // Clear & re-insert associations
        await manager.delete(CoreObservabilityMetricsModule, { observabilityMetricId: dto.id });
        await manager.delete(CoreObservabilityMetricsUsedTables, { observabilityMetricId: dto.id });
        await manager.delete(CoreObservabilityMetricsFilters, { observabilityMetricId: dto.id });
        await manager.delete(CoreObservabilityMetricsAlerts, { observabilityMetricId: dto.id });

        await this.saveMetricModules(manager, dto.id, dto);
        await this.saveMetricUsedTables(manager, dto.id, dto);

        if (dto.threshold) {
          await this.saveTimeFilters(manager, dto.id, dto.threshold);
        }
        if (dto.alarms) {
          await this.saveAlarms(manager, dto.id, dto.alarms);
        }
      });
    } catch (error) {
      this.logger.error('Error updating metric', (error as Error).stack);
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    }
  }

  /**
   * Toggle metric favorite.
   * v3: favorite()
   */
  async favorite(metricId: string): Promise<boolean> {
    const metric = await this.metricsRepo.findOne({
      where: { id: metricId },
      select: { id: true, isFavorite: true },
    });
    if (!metric) {
      throw new NotFoundException(ErrorMessages.METRIC_DOES_NOT_EXIST);
    }
    const newFav = metric.isFavorite ? 0 : 1;
    await this.metricsRepo.update({ id: metricId }, { isFavorite: newFav });
    return !!newFav;
  }

  /**
   * Convert metric to report format.
   * v3: goToReport()
   */
  async goToReport(metricId: string): Promise<ObservabilityGoToReportDto> {
    const metric = await this.metricsRepo.findOne({ where: { id: metricId } });
    if (!metric) {
      throw new NotFoundException(ErrorMessages.METRIC_DOES_NOT_EXIST);
    }
    return {
      tables: this.safeJsonParse(metric.tables),
      globalFilter: this.safeJsonParse(metric.globalFilter),
      orderBy: this.safeJsonParse(metric.orderBy),
      options: this.safeJsonParse(metric.options),
      control: this.safeJsonParse(metric.control),
      compare: this.safeJsonParse(metric.compare),
      operation: this.safeJsonParse(metric.operation),
    };
  }

  // =========================================================================
  // METRICS — Query Execution
  // =========================================================================

  /**
   * Execute tabular query for a metric.
   * v3: executeQuery()
   */
  async executeQuery(tabularObject: GenerateObservabilityMetricDto): Promise<ExecuteQueryResultDto> {
    const generateResult = await this.queryService.generateObservability(tabularObject);

    if (generateResult && !isEmptyString(generateResult.query)) {
      try {
        const queryResult = await this.legacyDataDb.query<Record<string, unknown>>(generateResult.query);
        return {
          header: generateResult.header,
          body: queryResult,
        };
      } catch (error) {
        this.logger.error('executeQuery failed', (error as Error).stack);
        throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
      }
    }

    return { header: [], body: [] };
  }

  /**
   * Execute single metric query — returns metric value with threshold coloring.
   * For exploded metrics: returns grouped exploded data.
   * v3: executeMetricQuery()
   */
  async executeMetricQuery(
    tabularObject: GenerateObservabilityMetricDto,
  ): Promise<ObservabilityMetricViewDto | { metricName: string; metricValue: number; color: string }> {
    const generateResult = await this.queryService.generateObservability(tabularObject, false);

    if (!generateResult || isEmptyString(generateResult.query)) {
      throw new BadRequestException(ErrorMessages.DEFAULT_METRIC_NOT_SELECTED);
    }

    try {
      const queryResult = await this.legacyDataDb.query<Record<string, unknown>>(generateResult.query);

      if (!tabularObject.isExploded) {
        // Sum up the metric values
        const metricField = this.utilService.fetchMetricField(
          tabularObject as unknown as Parameters<typeof this.utilService.fetchMetricField>[0],
        );
        const metricFieldName = metricField?.columnDisplayName || '';
        let sum = 0;
        for (const row of queryResult) {
          const val = Number(row[metricFieldName]);
          if (!isNaN(val)) sum += val;
        }

        // Get threshold color
        let color = '#28a745';
        if (tabularObject.metricId) {
          const metric = await this.metricsRepo.findOne({ where: { id: tabularObject.metricId } });
          if (metric) {
            const threshold = await this.retrieveTimeFilters(tabularObject.metricId);
            const thresholdResult = this.utilService.fetchThresholdData(
              threshold as Parameters<typeof this.utilService.fetchThresholdData>[0],
              sum,
            );
            if (thresholdResult) color = thresholdResult.color;
          }
        }

        return {
          metricName: metricFieldName,
          metricValue: sum,
          color,
        };
      } else {
        // Exploded: group by exploded field
        const explodedField = this.utilService.fetchExplodedField(
          tabularObject as unknown as Parameters<typeof this.utilService.fetchExplodedField>[0],
        );
        const explodedFieldName = explodedField?.columnDisplayName || '';
        const metricField = this.utilService.fetchMetricField(
          tabularObject as unknown as Parameters<typeof this.utilService.fetchMetricField>[0],
        );
        const metricFieldName = metricField?.columnDisplayName || '';

        const grouped: Record<string, number> = {};
        for (const row of queryResult) {
          const key = String(row[explodedFieldName] || 'Unknown');
          const val = Number(row[metricFieldName]);
          if (!isNaN(val)) {
            grouped[key] = (grouped[key] || 0) + val;
          }
        }

        const data = Object.entries(grouped).map(([name, value]) => ({ name, value }));

        return {
          metricName: metricFieldName,
          metricValue: data.reduce((s, d) => s + d.value, 0),
          color: '#28a745',
          data,
        };
      }
    } catch (error) {
      this.logger.error('executeMetricQuery failed', (error as Error).stack);
      throw new BadRequestException(ErrorMessages.ERROR_OCCURED);
    }
  }

  // =========================================================================
  // CHARTS — CRUD
  // =========================================================================

  /**
   * Save a new observability chart.
   * v3: saveChart()
   */
  async saveChart(dto: SaveObservabilityChartDto, currentUserId: string): Promise<{ id: string }> {
    const id = v4();

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(CoreObservabilityCharts, {
          id,
          name: dto.name,
          type: dto.type,
          data: this.safeJsonStringify(dto.data) || '{}',
          isConnectivity: dto.isConnectivity ? 1 : 0,
          nodeIds: dto.nodeIds ? this.safeJsonStringify(dto.nodeIds) : null,
          createdAt: new Date(),
          createdBy: currentUserId,
          isFavorite: 0,
        });

        // Link metrics to chart based on chart type
        await this.linkMetricsToChart(manager, id, dto);
      });
    } catch (error) {
      this.logger.error('Error saving chart', (error as Error).stack);
      throw new BadRequestException(ErrorMessages.ERROR_SAVE);
    }

    return { id };
  }

  /**
   * List all observability charts.
   * v3: listCharts()
   */
  async listCharts(): Promise<ListObservabilityChartsDto[]> {
    return this.dataSource.query(
      `SELECT c.id, c.name, c.type, c.isFavorite,
              (SELECT userName FROM core_application_users WHERE id = c.createdBy) AS owner,
              DATE_FORMAT(c.createdAt, "%Y-%m-%d %H:%i") AS createdAt,
              DATE_FORMAT(c.updatedAt, "%Y-%m-%d %H:%i") AS updatedAt
       FROM core_observability_charts c
       ORDER BY c.isFavorite DESC, c.updatedAt DESC`,
    );
  }

  /**
   * Get chart by ID with parsed data.
   * v3: getChartById()
   */
  async getChartById(chartId: string): Promise<unknown> {
    const chart = await this.chartsRepo.findOne({ where: { id: chartId } });
    if (!chart) {
      throw new NotFoundException(ErrorMessages.OB_CHART_DOES_NOT_EXIST);
    }

    return {
      ...chart,
      data: this.safeJsonParse(chart.data),
      nodeIds: this.safeJsonParse(chart.nodeIds),
    };
  }

  /**
   * Update an existing observability chart.
   * v3: updateChart()
   */
  async updateChart(dto: UpdateObservabilityChartDto, currentUserId: string): Promise<string> {
    const existing = await this.chartsRepo.findOne({ where: { id: dto.id } });
    if (!existing) {
      throw new NotFoundException(ErrorMessages.OB_CHART_DOES_NOT_EXIST);
    }

    if (existing.createdBy !== currentUserId) {
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ACTION);
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          CoreObservabilityCharts,
          { id: dto.id },
          {
            name: dto.name,
            type: dto.type,
            data: this.safeJsonStringify(dto.data) || '{}',
            isConnectivity: dto.isConnectivity ? 1 : 0,
            nodeIds: dto.nodeIds ? this.safeJsonStringify(dto.nodeIds) : null,
            updatedAt: new Date(),
            updatedBy: currentUserId,
          },
        );

        // Delete old metric links, re-insert
        await manager.delete(CoreObservabilityMetricCharts, { chartId: dto.id });
        await this.linkMetricsToChart(manager, dto.id, dto);
      });
    } catch (error) {
      this.logger.error('Error updating chart', (error as Error).stack);
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    }

    return dto.id;
  }

  /**
   * Toggle chart favorite.
   * v3: favoriteChart()
   */
  async favoriteChart(chartId: string): Promise<boolean> {
    const chart = await this.chartsRepo.findOne({
      where: { id: chartId },
      select: { id: true, isFavorite: true },
    });
    if (!chart) {
      throw new NotFoundException(ErrorMessages.OB_CHART_DOES_NOT_EXIST);
    }
    const newFav = chart.isFavorite ? 0 : 1;
    await this.chartsRepo.update({ id: chartId }, { isFavorite: newFav });
    return !!newFav;
  }

  // =========================================================================
  // CHART GENERATORS — 8 types
  // =========================================================================

  /**
   * Generate chart by type for dashboard display.
   * v3: generateChartByTypeForDashboard()
   */
  async generateChartByType(chartObject: unknown): Promise<unknown> {
    const chart = chartObject as Record<string, unknown>;
    const type = chart.type as string;

    switch (type) {
      case ObservabilityChartType.VERTICAL_STATUS_PANEL:
        return this.generateVerticalStatusPanel(chart);
      case ObservabilityChartType.HORIZONTAL_STATUS_PANEL:
        return this.generateHorizontalStatusPanel(chart);
      case ObservabilityChartType.COUNTER_LIST:
        return this.generateCounterListChart(chart);
      case ObservabilityChartType.HEXAGON:
        return this.generateHexagonChart(chart);
      case ObservabilityChartType.TREND:
        return this.generateTrendChart(chart);
      case ObservabilityChartType.BAR:
        return this.generateVerticalBarChart(chart);
      case ObservabilityChartType.CONNECTIVITY:
        return this.generateConnectivityChart(chart);
      case ObservabilityChartType.TIME_TRAVEL:
        return this.generateTimeTravelChart(chart);
      default:
        throw new BadRequestException(`Unknown chart type: ${type}`);
    }
  }

  /**
   * Generate vertical status panel chart.
   * Queries latest metric status per metric ID from V3_observability_metrics_stats.
   */
  async generateVerticalStatusPanel(chart: Record<string, unknown>): Promise<unknown> {
    const metricIds = (chart.metricIds || []) as string[];
    if (metricIds.length === 0) return chart;

    const dataDbName = this.configService.get<string>('DB_DATA_NAME');
    const coreDbName = this.configService.get<string>('DB_CORE_NAME');
    const results: unknown[] = [];

    for (const metricId of metricIds) {
      const [statusRow] = await this.dataSource.query(
        `SELECT oms.thresholdStatus, omt.color, omt.background, omt.icon
         FROM ${dataDbName}.V3_observability_metrics_stats oms
         JOIN ${coreDbName}.core_observability_metrics_types omt ON oms.thresholdStatus = omt.type
         WHERE oms.metricId = ?
         ORDER BY omt.severity DESC
         LIMIT 1`,
        [metricId],
      );

      const metric = await this.metricsRepo.findOne({ where: { id: metricId }, select: { id: true, name: true } });
      results.push({
        metricId,
        metricName: metric?.name || '',
        status: statusRow?.thresholdStatus || 'normal',
        color: statusRow?.color || '#28a745',
        background: statusRow?.background || '#d4edda',
        icon: statusRow?.icon || 'check-circle',
      });
    }

    return { ...chart, lib: { data: results } };
  }

  /**
   * Generate horizontal status panel chart.
   */
  async generateHorizontalStatusPanel(chart: Record<string, unknown>): Promise<unknown> {
    const metricId = chart.metricId as string;
    if (!metricId) return chart;

    const metric = await this.metricsRepo.findOne({ where: { id: metricId } });
    if (!metric) throw new NotFoundException(ErrorMessages.METRIC_DOES_NOT_EXIST);

    // Execute metric query
    const metricConfig = {
      tables: this.safeJsonParse(metric.tables),
      control: this.safeJsonParse(metric.control),
      compare: this.safeJsonParse(metric.compare),
      operation: this.safeJsonParse(metric.operation),
      globalFilter: this.safeJsonParse(metric.globalFilter),
      orderBy: this.safeJsonParse(metric.orderBy),
      options: this.safeJsonParse(metric.options),
      limit: metric.limit,
    };

    try {
      const generateResult = await this.queryService.generateObservability(
        metricConfig as unknown as GenerateObservabilityMetricDto,
        false,
      );
      if (generateResult && !isEmptyString(generateResult.query)) {
        const queryResult = await this.legacyDataDb.query<Record<string, unknown>>(generateResult.query);
        return { ...chart, lib: { data: queryResult, header: generateResult.header } };
      }
    } catch (error) {
      this.logger.warn('Horizontal status panel generation failed', (error as Error).message);
    }

    return chart;
  }

  /**
   * Generate counter list chart.
   */
  async generateCounterListChart(chart: Record<string, unknown>): Promise<unknown> {
    const metricsArray = (chart.metricsArray || []) as Array<{ id: string; name?: string }>;
    if (metricsArray.length === 0) return chart;

    const dataDbName = this.configService.get<string>('DB_DATA_NAME');
    const coreDbName = this.configService.get<string>('DB_CORE_NAME');
    const results: unknown[] = [];

    for (const metricRef of metricsArray) {
      const metric = await this.metricsRepo.findOne({ where: { id: metricRef.id } });
      if (!metric) continue;

      const [statusRow] = await this.dataSource.query(
        `SELECT oms.value, oms.thresholdStatus, omt.color, omt.background
         FROM ${dataDbName}.V3_observability_metrics_stats oms
         JOIN ${coreDbName}.core_observability_metrics_types omt ON oms.thresholdStatus = omt.type
         WHERE oms.metricId = ?
         ORDER BY oms.stat_date DESC
         LIMIT 1`,
        [metricRef.id],
      );

      results.push({
        id: metricRef.id,
        name: metric.name,
        value: statusRow?.value || 0,
        status: statusRow?.thresholdStatus || 'normal',
        color: statusRow?.color || '#28a745',
        background: statusRow?.background || '#d4edda',
      });
    }

    return { ...chart, lib: { data: results } };
  }

  /**
   * Generate hexagon chart.
   */
  async generateHexagonChart(chart: Record<string, unknown>): Promise<unknown> {
    const metricId = chart.metricId as string;
    if (!metricId) return chart;

    const metric = await this.metricsRepo.findOne({ where: { id: metricId } });
    if (!metric) throw new NotFoundException(ErrorMessages.METRIC_DOES_NOT_EXIST);

    const metricConfig = {
      tables: this.safeJsonParse(metric.tables),
      control: this.safeJsonParse(metric.control),
      compare: this.safeJsonParse(metric.compare),
      operation: this.safeJsonParse(metric.operation),
      globalFilter: this.safeJsonParse(metric.globalFilter),
      orderBy: this.safeJsonParse(metric.orderBy),
      options: this.safeJsonParse(metric.options),
      limit: metric.limit,
    };

    try {
      const generateResult = await this.queryService.generateObservability(
        metricConfig as unknown as GenerateObservabilityMetricDto,
        false,
      );
      if (generateResult && !isEmptyString(generateResult.query)) {
        const queryResult = await this.legacyDataDb.query<Record<string, unknown>>(generateResult.query);

        // Get threshold data
        const threshold = await this.retrieveTimeFilters(metricId);
        const metricField = this.utilService.fetchMetricField(
          metricConfig as unknown as Parameters<typeof this.utilService.fetchMetricField>[0],
        );
        const fieldName = metricField?.columnDisplayName || '';

        const hexData = queryResult.map((row) => {
          const val = Number(row[fieldName]) || 0;
          const thresholdResult = this.utilService.fetchThresholdData(
            threshold as Parameters<typeof this.utilService.fetchThresholdData>[0],
            val,
          );
          return {
            name: row['node_name'] || row[Object.keys(row)[0]],
            value: val,
            color: thresholdResult?.color || '#28a745',
            type: thresholdResult?.type || 'normal',
          };
        });

        return { ...chart, lib: { data: hexData } };
      }
    } catch (error) {
      this.logger.warn('Hexagon chart generation failed', (error as Error).message);
    }

    return chart;
  }

  /**
   * Generate trend chart.
   */
  async generateTrendChart(chart: Record<string, unknown>): Promise<unknown> {
    const metricFields = (chart.metricFields || []) as Array<{ metricId: string; color?: string }>;
    if (metricFields.length === 0) return chart;

    const dataDbName = this.configService.get<string>('DB_DATA_NAME');
    const series: unknown[] = [];

    for (const mf of metricFields) {
      const metric = await this.metricsRepo.findOne({ where: { id: mf.metricId } });
      if (!metric) continue;

      const stats = await this.dataSource.query(
        `SELECT DATE_FORMAT(stat_date, "%Y-%m-%d %H:%i") AS statDate, value
         FROM ${dataDbName}.V3_observability_metrics_stats
         WHERE metricId = ?
         ORDER BY stat_date ASC`,
        [mf.metricId],
      );

      series.push({
        name: metric.name,
        color: mf.color || '#007bff',
        data: stats.map((s: { statDate: string; value: number }) => ({
          date: s.statDate,
          value: s.value,
        })),
      });
    }

    return { ...chart, lib: { series } };
  }

  /**
   * Generate vertical bar chart.
   */
  async generateVerticalBarChart(chart: Record<string, unknown>): Promise<unknown> {
    const metricFields = (chart.metricFields || []) as Array<{ metricId: string; color?: string }>;
    if (metricFields.length === 0) return chart;

    const dataDbName = this.configService.get<string>('DB_DATA_NAME');
    const categories: string[] = [];
    const series: unknown[] = [];

    for (const mf of metricFields) {
      const metric = await this.metricsRepo.findOne({ where: { id: mf.metricId } });
      if (!metric) continue;

      const [latestStat] = await this.dataSource.query(
        `SELECT value FROM ${dataDbName}.V3_observability_metrics_stats
         WHERE metricId = ? ORDER BY stat_date DESC LIMIT 1`,
        [mf.metricId],
      );

      categories.push(metric.name);
      series.push({
        name: metric.name,
        value: latestStat?.value || 0,
        color: mf.color || '#007bff',
      });
    }

    return { ...chart, lib: { categories, series } };
  }

  /**
   * Generate connectivity chart.
   * Shows node status with drill-down to metric details.
   */
  async generateConnectivityChart(chart: Record<string, unknown>): Promise<unknown> {
    const nodes = (chart.nodes || []) as Array<{
      id: string;
      name?: string;
      x?: number;
      y?: number;
      width?: number;
      radius?: number;
    }>;
    if (nodes.length === 0) return chart;

    const dataDbName = this.configService.get<string>('DB_DATA_NAME');
    const coreDbName = this.configService.get<string>('DB_CORE_NAME');
    const isExclude = chart.isExclude as boolean;

    const nodeData: unknown[] = [];

    for (const node of nodes) {
      // Get metrics for this node
      const metrics = await this.dataSource.query(
        `SELECT DISTINCT m.id, m.name
         FROM ${coreDbName}.core_observability_metrics m
         INNER JOIN ${coreDbName}.core_observability_metrics_module mm ON m.id = mm.observabilityMetricId
         WHERE mm.moduleId = ?`,
        [node.id],
      );

      let worstStatus = 'normal';
      let worstColor = '#28a745';
      const drillDown: unknown[] = [];

      for (const metric of metrics) {
        const [statusRow] = await this.dataSource.query(
          `SELECT oms.thresholdStatus, omt.color, omt.background, omt.severity
           FROM ${dataDbName}.V3_observability_metrics_stats oms
           JOIN ${coreDbName}.core_observability_metrics_types omt ON oms.thresholdStatus = omt.type
           WHERE oms.metricId = ?
           ORDER BY omt.severity DESC LIMIT 1`,
          [metric.id],
        );

        const status = statusRow?.thresholdStatus || 'normal';
        const color = statusRow?.color || '#28a745';
        const severity = statusRow?.severity || 0;

        drillDown.push({ metricId: metric.id, metricName: metric.name, status, color });

        if (severity > 0 && (worstStatus === 'normal' || severity > (worstStatus === 'warning' ? 1 : 0))) {
          worstStatus = status;
          worstColor = color;
        }
      }

      nodeData.push({
        id: node.id,
        name: node.name,
        x: node.x,
        y: node.y,
        width: node.width,
        radius: node.radius,
        status: worstStatus,
        color: worstColor,
        drillDown: isExclude ? [] : drillDown,
      });
    }

    return { ...chart, lib: { data: nodeData } };
  }

  /**
   * Generate time travel chart.
   * Shows metric status over time as colored segments.
   */
  async generateTimeTravelChart(chart: Record<string, unknown>): Promise<unknown> {
    const metricIds = (chart.metricIds || []) as string[];
    if (metricIds.length === 0) return chart;

    const dataDbName = this.configService.get<string>('DB_DATA_NAME');
    const coreDbName = this.configService.get<string>('DB_CORE_NAME');
    const timelines: unknown[] = [];

    for (const metricId of metricIds) {
      const metric = await this.metricsRepo.findOne({ where: { id: metricId }, select: { id: true, name: true } });
      if (!metric) continue;

      const stats = await this.dataSource.query(
        `SELECT DATE_FORMAT(oms.stat_date, "%Y-%m-%d %H:%i") AS statDate,
                oms.thresholdStatus, omt.color
         FROM ${dataDbName}.V3_observability_metrics_stats oms
         JOIN ${coreDbName}.core_observability_metrics_types omt ON oms.thresholdStatus = omt.type
         WHERE oms.metricId = ?
         ORDER BY oms.stat_date ASC`,
        [metricId],
      );

      // Build segments from consecutive statuses
      const segments: Array<{ fromDate: string; toDate: string; color: string }> = [];
      let currentSegment: { fromDate: string; toDate: string; color: string } | null = null;

      for (const stat of stats) {
        if (!currentSegment || currentSegment.color !== stat.color) {
          if (currentSegment) segments.push(currentSegment);
          currentSegment = { fromDate: stat.statDate, toDate: stat.statDate, color: stat.color };
        } else {
          currentSegment.toDate = stat.statDate;
        }
      }
      if (currentSegment) segments.push(currentSegment);

      timelines.push({ metricId, metricName: metric.name, segments });
    }

    return { ...chart, lib: { timelines } };
  }

  // =========================================================================
  // DASHBOARDS — CRUD
  // =========================================================================

  /**
   * Save a new observability dashboard.
   * v3: saveDashboard()
   */
  async saveDashboard(dto: SaveObservabilityDashboardDto, currentUserId: string): Promise<{ id: string }> {
    const id = v4();

    try {
      await this.dataSource.transaction(async (manager) => {
        // Separate title placeholders from actual charts
        const titleCharts = dto.charts.filter((c) => c.isTitle);
        const actualCharts = dto.charts.filter((c) => !c.isTitle);

        await manager.save(CoreObservabilityDashboard, {
          id,
          name: dto.name,
          ownerId: currentUserId,
          title: titleCharts.length > 0 ? JSON.stringify(titleCharts) : null,
          createdAt: new Date(),
          isFavorite: 0,
        });

        // Insert chart associations
        if (actualCharts.length > 0) {
          const chartEntities = actualCharts.map((chart) => ({
            dashboardId: id,
            chartId: chart.chartId,
            options: JSON.stringify({
              cols: chart.cols,
              rows: chart.rows,
              x: chart.x,
              y: chart.y,
              maxItemCols: chart.maxItemCols,
            }),
          }));
          await manager.insert(CoreObservabilityDashboardCharts, chartEntities);
        }
      });
    } catch (error) {
      this.logger.error('Error saving dashboard', (error as Error).stack);
      throw new BadRequestException(ErrorMessages.ERROR_SAVE);
    }

    return { id };
  }

  /**
   * List all observability dashboards.
   * v3: listDashboards()
   */
  async listDashboards(): Promise<ListObservabilityDashboardsDto[]> {
    return this.dataSource.query(
      `SELECT d.id, d.name, d.ownerId, d.isFavorite,
              (SELECT userName FROM core_application_users WHERE id = d.ownerId) AS owner,
              DATE_FORMAT(d.createdAt, "%Y-%m-%d %H:%i") AS createdAt,
              DATE_FORMAT(d.updatedAt, "%Y-%m-%d %H:%i") AS updatedAt
       FROM core_observability_dashboard d
       ORDER BY d.isFavorite DESC, d.updatedAt DESC`,
    );
  }

  /**
   * Get dashboard by ID with chart layout.
   * v3: getDashboardById()
   */
  async getDashboardById(id: string): Promise<GetDashboardByIdDto> {
    const dashboard = await this.dashboardRepo.findOne({ where: { id } });
    if (!dashboard) {
      throw new NotFoundException(ErrorMessages.OB_DASHBOARD_DOES_NOT_EXIST);
    }

    const dashboardCharts = await this.dashboardChartsRepo.find({ where: { dashboardId: id } });
    const charts = dashboardCharts.map((dc) => {
      const options = (this.safeJsonParse(dc.options) as Record<string, unknown>) || {};
      return { chartId: dc.chartId, ...options };
    });

    return {
      id: dashboard.id,
      name: dashboard.name,
      ownerId: dashboard.ownerId,
      title: this.safeJsonParse(dashboard.title),
      isFavorite: !!dashboard.isFavorite,
      charts,
    };
  }

  /**
   * Update an existing observability dashboard.
   * v3: updateDashboard()
   */
  async updateDashboard(currentUserId: string, dto: UpdateObservabilityDashboardDto): Promise<string> {
    const existing = await this.dashboardRepo.findOne({ where: { id: dto.id } });
    if (!existing) {
      throw new NotFoundException(ErrorMessages.OB_DASHBOARD_DOES_NOT_EXIST);
    }

    if (existing.ownerId !== currentUserId) {
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ACTION);
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const titleCharts = dto.charts.filter((c) => c.isTitle);
        const actualCharts = dto.charts.filter((c) => !c.isTitle);

        await manager.update(
          CoreObservabilityDashboard,
          { id: dto.id },
          {
            name: dto.name,
            title: titleCharts.length > 0 ? JSON.stringify(titleCharts) : null,
            updatedAt: new Date(),
            updatedBy: currentUserId,
          },
        );

        // Delete old chart associations, re-insert
        await manager.delete(CoreObservabilityDashboardCharts, { dashboardId: dto.id });

        if (actualCharts.length > 0) {
          const chartEntities = actualCharts.map((chart) => ({
            dashboardId: dto.id,
            chartId: chart.chartId,
            options: JSON.stringify({
              cols: chart.cols,
              rows: chart.rows,
              x: chart.x,
              y: chart.y,
              maxItemCols: chart.maxItemCols,
            }),
          }));
          await manager.insert(CoreObservabilityDashboardCharts, chartEntities);
        }
      });
    } catch (error) {
      this.logger.error('Error updating dashboard', (error as Error).stack);
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    }

    return dto.id;
  }

  /**
   * Toggle dashboard favorite.
   * v3: favoriteDashboard()
   */
  async favoriteDashboard(dashboardId: string): Promise<boolean> {
    const dashboard = await this.dashboardRepo.findOne({
      where: { id: dashboardId },
      select: { id: true, isFavorite: true },
    });
    if (!dashboard) {
      throw new NotFoundException(ErrorMessages.OB_DASHBOARD_DOES_NOT_EXIST);
    }
    const newFav = dashboard.isFavorite ? 0 : 1;
    await this.dashboardRepo.update({ id: dashboardId }, { isFavorite: newFav });
    return !!newFav;
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Retrieve time filters and thresholds for a metric.
   */
  private async retrieveTimeFilters(metricId: string): Promise<unknown> {
    const filters = await this.metricsFiltersRepo.find({
      where: { observabilityMetricId: metricId },
    });

    const timeFilters: unknown[] = [];
    let alternativeTimeFilters: unknown = null;

    for (const filter of filters) {
      const thresholds = await this.metricsThresholdsRepo.find({
        where: { observabilityMetricFilterId: filter.id },
      });

      const filterData: Record<string, unknown> = {
        id: filter.id,
        startTime: filter.startTime,
        endTime: filter.endTime,
        isDefault: !!filter.isDefault,
        min: this.safeJsonParse(filter.minimum),
        max: this.safeJsonParse(filter.maximum),
        thresholds: thresholds.map((t) => ({
          min: t.minimum,
          max: t.maximum,
          type: t.type,
          isRecursiveAlert: !!t.isRecursiveAlert,
        })),
      };

      if (filter.isDefault) {
        alternativeTimeFilters = filterData;
      } else {
        timeFilters.push(filterData);
      }
    }

    return { timeFilters, alternativeTimeFilters };
  }

  /**
   * Retrieve alarms for a metric.
   */
  private async retrieveAlarms(metricId: string): Promise<{ critical: unknown[]; warning: unknown[] }> {
    const alarms = await this.metricsAlertsRepo.find({
      where: { observabilityMetricId: metricId },
    });

    const critical: unknown[] = [];
    const warning: unknown[] = [];

    for (const alarm of alarms) {
      const alarmData = {
        id: alarm.id,
        level: alarm.level,
        duration: alarm.duration,
        subject: alarm.subject,
        body: alarm.body,
        emails: this.safeJsonParse(alarm.emails) || [],
        phoneNumbers: this.safeJsonParse(alarm.phoneNumbers) || [],
        users: this.safeJsonParse(alarm.users) || [],
        isRepeat: !!alarm.isRepeat,
        isActivated: !!alarm.isActivated,
      };

      if (alarm.type === 'critical') {
        critical.push(alarmData);
      } else {
        warning.push(alarmData);
      }
    }

    return { critical, warning };
  }

  /**
   * Save metric module associations.
   */
  private async saveMetricModules(
    manager: import('typeorm').EntityManager,
    metricId: string,
    dto: SaveObservabilityMetricDto,
  ): Promise<void> {
    if (!dto.nodeIds || dto.nodeIds.length === 0) return;
    const entities = dto.nodeIds.map((moduleId) => ({
      observabilityMetricId: metricId,
      moduleId,
    }));
    await manager.insert(CoreObservabilityMetricsModule, entities);
  }

  /**
   * Save metric used tables.
   */
  private async saveMetricUsedTables(
    manager: import('typeorm').EntityManager,
    metricId: string,
    dto: SaveObservabilityMetricDto,
  ): Promise<void> {
    const tables = dto.tables as Array<{ id?: string }> | undefined;
    if (!tables) return;

    const tableIds = tables.filter((t) => t.id).map((t) => ({ observabilityMetricId: metricId, tableId: t.id! }));

    if (tableIds.length > 0) {
      await manager.insert(CoreObservabilityMetricsUsedTables, tableIds);
    }
  }

  /**
   * Save time filters and thresholds.
   */
  private async saveTimeFilters(
    manager: import('typeorm').EntityManager,
    metricId: string,
    threshold: SaveObservabilityMetricDto['threshold'],
  ): Promise<void> {
    if (!threshold) return;

    const filters = [
      ...(threshold.timeFilters || []),
      ...(threshold.alternativeTimeFilters ? [{ ...threshold.alternativeTimeFilters, isDefault: true }] : []),
    ];

    for (const filter of filters) {
      const filterId = filter.id || v4();
      await manager.save(CoreObservabilityMetricsFilters, {
        id: filterId,
        observabilityMetricId: metricId,
        startTime: filter.startTime || null,
        endTime: filter.endTime || null,
        isDefault: filter.isDefault ? 1 : 0,
        minimum: filter.min ? JSON.stringify(filter.min) : null,
        maximum: filter.max ? JSON.stringify(filter.max) : null,
      });

      // Save thresholds for this filter
      if (filter.thresholds) {
        for (const threshold of filter.thresholds) {
          await manager.save(CoreObservabilityMetricsThresholds, {
            minimum: threshold.min,
            maximum: threshold.max,
            type: threshold.type,
            isRecursiveAlert: threshold.isRecursiveAlert ? 1 : 0,
            observabilityMetricFilterId: filterId,
          });
        }
      }
    }
  }

  /**
   * Save metric alarms.
   */
  private async saveAlarms(
    manager: import('typeorm').EntityManager,
    metricId: string,
    alarms: SaveObservabilityMetricDto['alarms'],
  ): Promise<void> {
    if (!alarms) return;

    const allAlarms = [
      ...(alarms.critical || []).map((a) => ({ ...a, type: 'critical' })),
      ...(alarms.warning || []).map((a) => ({ ...a, type: 'warning' })),
    ];

    for (const alarm of allAlarms) {
      await manager.save(CoreObservabilityMetricsAlerts, {
        id: v4(),
        observabilityMetricId: metricId,
        level: alarm.level || null,
        duration: alarm.duration || null,
        subject: alarm.subject || null,
        body: alarm.body || null,
        emails: alarm.emails ? JSON.stringify(alarm.emails) : null,
        phoneNumbers: alarm.phoneNumbers ? JSON.stringify(alarm.phoneNumbers) : null,
        users: alarm.users ? JSON.stringify(alarm.users) : null,
        isRepeat: alarm.isRepeat ? 1 : 0,
        type: alarm.type,
        isActivated: 0,
        isEmailSent: 0,
      });
    }
  }

  /**
   * Link metrics to chart based on chart type.
   * v3: saveChart() — type-specific metric linking
   */
  private async linkMetricsToChart(
    manager: import('typeorm').EntityManager,
    chartId: string,
    dto: SaveObservabilityChartDto,
  ): Promise<void> {
    const type = dto.type;
    const metricLinks: Array<{ chartId: string; metricId: string }> = [];

    switch (type) {
      case ObservabilityChartType.HEXAGON:
      case ObservabilityChartType.HORIZONTAL_STATUS_PANEL:
        if (dto.metricId) {
          metricLinks.push({ chartId, metricId: dto.metricId });
        }
        break;

      case ObservabilityChartType.TIME_TRAVEL:
      case ObservabilityChartType.VERTICAL_STATUS_PANEL:
        if (dto.metricIds) {
          for (const mid of dto.metricIds) {
            metricLinks.push({ chartId, metricId: mid });
          }
        }
        break;

      case ObservabilityChartType.TREND:
      case ObservabilityChartType.BAR:
        if (dto.metricFields) {
          for (const mf of dto.metricFields) {
            if (mf.metricId) {
              metricLinks.push({ chartId, metricId: mf.metricId });
            }
          }
        }
        break;

      case ObservabilityChartType.COUNTER_LIST:
        if (dto.metricsArray) {
          for (const m of dto.metricsArray) {
            metricLinks.push({ chartId, metricId: m.id });
          }
        }
        break;

      case ObservabilityChartType.CONNECTIVITY:
        // Connectivity charts don't link to metrics
        break;
    }

    if (metricLinks.length > 0) {
      await manager.insert(CoreObservabilityMetricCharts, metricLinks);
    }
  }

  /**
   * Safely parse JSON, returning null on failure.
   */
  private safeJsonParse(value: string | null | undefined): unknown {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Safely stringify JSON, returning null for null/undefined.
   */
  private safeJsonStringify(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }
}
