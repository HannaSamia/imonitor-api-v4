import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 } from 'uuid';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportCharts } from '../../database/entities/core-report-charts.entity';
import { CoreSharedQbeReport } from '../../database/entities/core-shared-qbe-report.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { FETCH_CHART_DB_FUNCTION } from '../reports/constants';
import { ChartStatus } from '../reports/enums';
import { IChartData, IReportOptions } from '../reports/dto/report-interfaces';
import { DateFormats } from '../reports/services/query-builder.service';
import { SaveQbeDto, UpdateQbeDto, ProcessQbeDto, QbeResponseDto, QbeRunDto } from './dto';
import { QbeQueryService, QbeErrorMessages } from './services/qbe-query.service';

/**
 * Safely parse a JSON string, returning null if input is null/undefined or malformed.
 */
function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

@Injectable()
export class QbeService {
  private readonly logger = new Logger(QbeService.name);

  constructor(
    @InjectRepository(CoreReport)
    private readonly reportRepo: Repository<CoreReport>,
    @InjectRepository(CoreReportCharts)
    private readonly chartRepo: Repository<CoreReportCharts>,
    @InjectRepository(CoreSharedQbeReport)
    private readonly sharedQbeRepo: Repository<CoreSharedQbeReport>,
    private readonly dataSource: DataSource,
    private readonly dateHelper: DateHelperService,
    private readonly qbeQueryService: QbeQueryService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * Save a new QBE report with its charts.
   * Validates SQL safety, stores in core_report with isQbe = true.
   * Mirrors v3 qbe.service.ts save().
   */
  async save(dto: SaveQbeDto, userId: string): Promise<string> {
    // Validate SQL safety before saving
    this.qbeQueryService.checkQbeSafety(dto.sql);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const id = v4();

    try {
      // Insert the report with isQbe = true
      await queryRunner.manager.insert(CoreReport, {
        id,
        name: dto.name,
        timeFilter: dto.timeFilter as CoreReport['timeFilter'],
        fromDate: dto.fromDate as unknown as Date,
        toDate: dto.toDate as unknown as Date,
        options: JSON.stringify(dto.options || {}),
        ownerId: userId,
        isQbe: 1,
        globalOrderIndex: dto.globalOrderIndex,
        sql: dto.sql,
        createdAt: this.dateHelper.formatDate() as unknown as Date,
      });

      // Insert charts
      if (dto.charts && dto.charts.length > 0) {
        const chartInserts = dto.charts.map((chart) => {
          const dataObject = { ...chart };
          delete (dataObject as Record<string, unknown>).id;
          delete (dataObject as Record<string, unknown>).name;
          delete (dataObject as Record<string, unknown>).type;
          delete (dataObject as Record<string, unknown>).orderIndex;
          return {
            id: chart.id || v4(),
            name: chart.name,
            type: chart.type,
            orderIndex: chart.orderIndex,
            data: JSON.stringify(dataObject),
            createdAt: this.dateHelper.formatDate() as unknown as Date,
            createdBy: userId,
            reportId: id,
          };
        });
        await queryRunner.manager.insert(CoreReportCharts, chartInserts);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error saving QBE', error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_REPORT);
    } finally {
      await queryRunner.release();
    }

    return id;
  }

  /**
   * Update an existing QBE report and process chart changes by status.
   * Mirrors v3 qbe.service.ts update().
   */
  async update(id: string, dto: UpdateQbeDto, userId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update the report (owner-scoped)
      await queryRunner.manager.update(
        CoreReport,
        { id, ownerId: userId },
        {
          name: dto.name,
          timeFilter: dto.timeFilter as CoreReport['timeFilter'],
          fromDate: dto.fromDate as unknown as Date,
          toDate: dto.toDate as unknown as Date,
          options: JSON.stringify(dto.options || {}),
          globalOrderIndex: dto.globalOrderIndex,
          sql: dto.sql,
          updatedAt: this.dateHelper.formatDate() as unknown as Date,
        },
      );

      // Process charts by status
      const chartsStatus = { ...dto.chartsStatus };

      for (const chart of dto.charts) {
        const dataObject = { ...chart };
        delete (dataObject as Record<string, unknown>).id;
        delete (dataObject as Record<string, unknown>).name;
        delete (dataObject as Record<string, unknown>).type;
        const dataString = JSON.stringify(dataObject);

        if (chartsStatus[chart.id] !== undefined) {
          if (chartsStatus[chart.id] === ChartStatus.EDITED) {
            await queryRunner.manager.update(
              CoreReportCharts,
              { id: chart.id },
              {
                name: chart.name,
                type: chart.type,
                orderIndex: chart.orderIndex,
                data: dataString,
              },
            );
          } else if (chartsStatus[chart.id] === ChartStatus.DELETED) {
            await queryRunner.manager.delete(CoreReportCharts, { id: chart.id });
          } else if (chartsStatus[chart.id] === ChartStatus.CREATED) {
            await queryRunner.manager.insert(CoreReportCharts, {
              id: chart.id,
              name: chart.name,
              type: chart.type,
              orderIndex: chart.orderIndex,
              data: dataString,
              createdAt: this.dateHelper.formatDate() as unknown as Date,
              createdBy: userId,
              reportId: id,
            });
          }
          delete chartsStatus[chart.id];
        }
      }

      // Handle remaining deleted charts not in the charts array
      for (const chartId of Object.keys(chartsStatus)) {
        if (chartsStatus[chartId] === ChartStatus.DELETED) {
          await queryRunner.manager.delete(CoreReportCharts, { id: chartId });
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error updating QBE', error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(ErrorMessages.ERROR_UPDATE);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get a QBE report by ID with parsed JSON columns and loaded charts.
   * Mirrors v3 qbe.service.ts getById().
   */
  async getById(id: string, userId: string): Promise<QbeResponseDto> {
    const dbReport = await this.reportRepo.findOne({
      where: { id, ownerId: userId },
    });

    if (!dbReport) {
      throw new BadRequestException(QbeErrorMessages.QBE_NOT_FOUND);
    }

    const report: QbeResponseDto = {
      id: dbReport.id,
      ownerId: dbReport.ownerId,
      isFavorite: !!dbReport.isFavorite,
      isDefault: !!dbReport.isDefault,
      createdAt: dbReport.createdAt as unknown as string,
      updatedAt: dbReport.updatedAt as unknown as string,
      name: dbReport.name,
      timeFilter: dbReport.timeFilter,
      fromDate: dbReport.fromDate as unknown as string,
      toDate: dbReport.toDate as unknown as string,
      globalOrderIndex: dbReport.globalOrderIndex || 0,
      options: safeJsonParse<IReportOptions>(dbReport.options) || {
        threshold: {},
        isFooterAggregation: false,
        globalFieldIndex: 0,
      },
      charts: [],
      sql: dbReport.sql || '',
    };

    // Load charts using JSON_INSERT DB function
    const reportChartsQuery = `
      SELECT ${FETCH_CHART_DB_FUNCTION} AS data
      FROM core_report_charts WHERE reportId = ? ORDER BY orderIndex
    `;
    const reportChartsResult: Array<{ data: string }> = await this.dataSource.query(reportChartsQuery, [report.id]);

    for (const chartResult of reportChartsResult) {
      const chart = JSON.parse(chartResult.data) as IChartData;
      report.charts.push(chart);
    }

    return report;
  }

  /**
   * Get a shared QBE report by shared entry ID.
   * Joins core_shared_qbe_report with core_report.
   * Mirrors v3 qbe.service.ts getSharedById().
   */
  async getSharedById(sharedId: string, userId: string): Promise<QbeResponseDto> {
    const selectQuery = `
      SELECT
        shared.id,
        shared.reportId,
        shared.isFavorite,
        shared.ownerId,
        normal.name,
        FALSE AS isDefault,
        normal.createdAt,
        normal.updatedAt,
        normal.fromDate,
        normal.toDate,
        normal.timeFilter,
        normal.options,
        normal.globalOrderIndex,
        normal.sql
      FROM core_shared_qbe_report shared
      LEFT JOIN core_report normal ON shared.reportId = normal.id
      WHERE shared.id = ? AND shared.ownerId = ?
    `;

    const sharedResult: Array<Record<string, unknown>> = await this.dataSource.query(selectQuery, [sharedId, userId]);

    if (sharedResult.length <= 0) {
      throw new BadRequestException(QbeErrorMessages.SHARED_QBE_NOT_FOUND);
    }

    const sr = sharedResult[0];

    const report: QbeResponseDto = {
      id: sr.id as string,
      ownerId: sr.ownerId as string,
      isFavorite: !!sr.isFavorite,
      isDefault: !!sr.isDefault,
      createdAt: sr.createdAt as string,
      updatedAt: sr.updatedAt as string,
      name: sr.name as string,
      timeFilter: sr.timeFilter as string,
      fromDate: sr.fromDate as string,
      toDate: sr.toDate as string,
      globalOrderIndex: (sr.globalOrderIndex as number) || 0,
      options: safeJsonParse<IReportOptions>(sr.options as string) || {
        threshold: {},
        isFooterAggregation: false,
        globalFieldIndex: 0,
      },
      charts: [],
      sql: (sr.sql as string) || '',
    };

    // Load charts from the ORIGINAL report
    const reportChartsQuery = `
      SELECT ${FETCH_CHART_DB_FUNCTION} AS data
      FROM core_report_charts WHERE reportId = ? ORDER BY orderIndex
    `;
    const reportChartsResult: Array<{ data: string }> = await this.dataSource.query(reportChartsQuery, [
      sr.reportId as string,
    ]);

    for (const chartResult of reportChartsResult) {
      const chart = JSON.parse(chartResult.data) as IChartData;
      report.charts.push(chart);
    }

    return report;
  }

  /**
   * Save a shared QBE as the current user's own report.
   * Clones the report and its charts with new IDs.
   * Mirrors v3 qbe.service.ts saveShare().
   */
  async saveSharedQbe(sharedId: string, userId: string): Promise<string> {
    const sharedQbe = await this.getSharedById(sharedId, userId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const id = v4();

    try {
      // Create new report entry for current user
      await queryRunner.manager.insert(CoreReport, {
        id,
        name: sharedQbe.name,
        timeFilter: sharedQbe.timeFilter as CoreReport['timeFilter'],
        fromDate: this.dateHelper.formatDate(
          DateFormats.ReportFormatMinutes,
          this.dateHelper.parseISO(sharedQbe.fromDate),
        ) as unknown as Date,
        toDate: this.dateHelper.formatDate(
          DateFormats.ReportFormatMinutes,
          this.dateHelper.parseISO(sharedQbe.toDate),
        ) as unknown as Date,
        options: JSON.stringify(sharedQbe.options || {}),
        ownerId: userId,
        isQbe: 1,
        globalOrderIndex: sharedQbe.globalOrderIndex,
        sql: sharedQbe.sql,
        createdAt: this.dateHelper.formatDate() as unknown as Date,
      });

      // Clone charts with new auto-generated IDs
      if (sharedQbe.charts && sharedQbe.charts.length > 0) {
        const chartInserts = sharedQbe.charts.map((chart) => {
          const dataObject = { ...chart };
          delete (dataObject as Record<string, unknown>).id;
          delete (dataObject as Record<string, unknown>).name;
          delete (dataObject as Record<string, unknown>).type;
          delete (dataObject as Record<string, unknown>).orderIndex;
          return {
            name: chart.name,
            type: chart.type,
            orderIndex: chart.orderIndex,
            data: JSON.stringify(dataObject),
            createdAt: this.dateHelper.formatDate() as unknown as Date,
            createdBy: userId,
            reportId: id,
          };
        });
        await queryRunner.manager.insert(CoreReportCharts, chartInserts);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error saving shared QBE', error);
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_SAVING_REPORT);
    } finally {
      await queryRunner.release();
    }

    return id;
  }

  // ---------------------------------------------------------------------------
  // Query Execution (Task 3.5)
  // ---------------------------------------------------------------------------

  async generateQbe(_dto: ProcessQbeDto, _userId: string): Promise<QbeRunDto> {
    throw new Error('Not implemented — Task 3.5');
  }

  // ---------------------------------------------------------------------------
  // Tables (Task 3.6)
  // ---------------------------------------------------------------------------

  async privilegedStatisticTables(_userId: string): Promise<unknown[]> {
    throw new Error('Not implemented — Task 3.6');
  }

  // ---------------------------------------------------------------------------
  // Chart Generation (Task 3.7)
  // ---------------------------------------------------------------------------

  async generateChart(_chartType: string, _dto: unknown, _userId: string): Promise<unknown> {
    throw new Error('Not implemented — Task 3.7');
  }
}
