/**
 * WidgetBuilderQueryService - Thin facade for widget builder SQL generation.
 *
 * Delegates to QueryBuilderService.generateWidgetBuilderQuery() which has access
 * to all the private helper methods needed for query generation (buildGlobalFilterClauses,
 * fillCustomFieldInAllFieldsArray, controlColumnsProcessing, operationColumnsProcessing, etc.).
 */

import { Injectable } from '@nestjs/common';
import { QueryBuilderService, GenerateResultDto } from '../../reports/services/query-builder.service';
import { GenerateWidgetBuilderDto } from '../dto/generate-widget-builder.dto';

@Injectable()
export class WidgetBuilderQueryService {
  constructor(private readonly queryBuilderService: QueryBuilderService) {}

  /**
   * Generate the SQL query for a WidgetBuilder tabular object.
   *
   * Returns { header, query, fieldsArray } — the query string is ready to execute
   * against iMonitorData via LegacyDataDbService.
   */
  async generateWidgetBuilderQuery(tabularObject: GenerateWidgetBuilderDto): Promise<GenerateResultDto> {
    return this.queryBuilderService.generateWidgetBuilderQuery(tabularObject);
  }
}
