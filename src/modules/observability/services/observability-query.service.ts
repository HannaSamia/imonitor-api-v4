/**
 * ObservabilityQueryService - Thin facade for observability SQL generation.
 *
 * Delegates to QueryBuilderService.generateObservability() which handles
 * observability-specific date handling (time frames: current, 24h, 48h, custom)
 * and metric query generation.
 */

import { Injectable } from '@nestjs/common';
import { QueryBuilderService, GenerateResultDto } from '../../reports/services/query-builder.service';
import { GenerateObservabilityMetricDto } from '../dto/observability-metric.dto';

@Injectable()
export class ObservabilityQueryService {
  constructor(private readonly queryBuilderService: QueryBuilderService) {}

  /**
   * Generate the SQL query for an observability metric.
   *
   * @param tabularObject - Metric configuration with tables, filters, time frame
   * @param forDbSave - If true, uses STAT_DATE_PLACEHOLDER instead of actual dates
   * @returns { header, query, fieldsArray, isExploded }
   */
  async generateObservability(
    tabularObject: GenerateObservabilityMetricDto,
    forDbSave = false,
  ): Promise<GenerateResultDto> {
    return this.queryBuilderService.generateObservability(tabularObject, forDbSave);
  }
}
