/**
 * ObservabilityUtilService - Threshold evaluation helpers for observability metrics.
 *
 * Ported from v3 core/utils/observability.util.ts.
 * Handles metric field extraction, threshold processing, and alarm status evaluation.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ObservabilityThresholdStatus } from '../../../shared/enums/observability.enum';

export interface ThresholdResultDto {
  color: string;
  type: string;
}

export interface MetricFieldDto {
  columnName?: string;
  columnDisplayName?: string;
  isMetric?: boolean;
  isExplodedBy?: boolean;
  metricId?: string;
  [key: string]: unknown;
}

@Injectable()
export class ObservabilityUtilService {
  private readonly logger = new Logger(ObservabilityUtilService.name);

  /**
   * Extract the metric field (isMetric=true) from tables/compare/operation/control arrays.
   * v3: fetchMetricField()
   */
  fetchMetricField(data: {
    tables?: Array<{ fields?: MetricFieldDto[] }>;
    compare?: MetricFieldDto[];
    operation?: MetricFieldDto[];
    control?: MetricFieldDto[];
  }): MetricFieldDto | null {
    if (data.tables) {
      for (const table of data.tables) {
        if (table.fields) {
          const found = table.fields.find((f) => f.isMetric === true);
          if (found) return found;
        }
      }
    }
    for (const arr of [data.compare, data.operation, data.control]) {
      if (arr) {
        const found = arr.find((f) => f.isMetric === true);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Extract the exploded-by field (isExplodedBy=true) from tables/compare/operation/control arrays.
   * v3: fetchExplodedField()
   */
  fetchExplodedField(data: {
    tables?: Array<{ fields?: MetricFieldDto[] }>;
    compare?: MetricFieldDto[];
    operation?: MetricFieldDto[];
    control?: MetricFieldDto[];
  }): MetricFieldDto | null {
    if (data.tables) {
      for (const table of data.tables) {
        if (table.fields) {
          const found = table.fields.find((f) => f.isExplodedBy === true);
          if (found) return found;
        }
      }
    }
    for (const arr of [data.compare, data.operation, data.control]) {
      if (arr) {
        const found = arr.find((f) => f.isExplodedBy === true);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Evaluate threshold data for a metric value.
   * Combines time-based filters and alternative (global) filters.
   * v3: fetchThresholdData()
   */
  fetchThresholdData(
    threshold: {
      timeFilters?: Array<{
        startTime?: string;
        endTime?: string;
        thresholds?: Array<{ min: number; max: number; type: string }>;
      }>;
      alternativeTimeFilters?: {
        minimum?: { type: string; value: number };
        maximum?: { type: string; value: number };
      };
    },
    finalValue: number,
  ): ThresholdResultDto | null {
    if (!threshold) return null;

    // Try time-based filters first
    if (threshold.timeFilters && threshold.timeFilters.length > 0) {
      const result = this.processTimeFilters(threshold.timeFilters, finalValue);
      if (result) return result;
    }

    // Fall back to alternative (global) filters
    if (threshold.alternativeTimeFilters) {
      return this.processAlternativeFilter(threshold.alternativeTimeFilters, finalValue);
    }

    return null;
  }

  /**
   * Evaluate value against time-based filter thresholds.
   * v3: processTimeFilters()
   */
  private processTimeFilters(
    filters: Array<{
      startTime?: string;
      endTime?: string;
      thresholds?: Array<{ min: number; max: number; type: string }>;
    }>,
    finalValue: number,
  ): ThresholdResultDto | null {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const filter of filters) {
      if (filter.startTime && filter.endTime) {
        const [startH, startM] = filter.startTime.split(':').map(Number);
        const [endH, endM] = filter.endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
          if (filter.thresholds) {
            for (const threshold of filter.thresholds) {
              if (finalValue >= threshold.min && finalValue <= threshold.max) {
                return this.getColorForType(threshold.type);
              }
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Evaluate value against alternative (global) min/max thresholds.
   * v3: processAlternativeFilter()
   */
  private processAlternativeFilter(
    filter: {
      minimum?: { type: string; value: number };
      maximum?: { type: string; value: number };
    },
    finalValue: number,
  ): ThresholdResultDto | null {
    if (filter.minimum && finalValue <= filter.minimum.value) {
      return this.getColorForType(filter.minimum.type);
    }
    if (filter.maximum && finalValue >= filter.maximum.value) {
      return this.getColorForType(filter.maximum.type);
    }
    return this.getColorForType(ObservabilityThresholdStatus.NORMAL);
  }

  /**
   * Map threshold type to color.
   */
  private getColorForType(type: string): ThresholdResultDto {
    switch (type) {
      case ObservabilityThresholdStatus.CRITICAL:
        return { color: '#dc3545', type: ObservabilityThresholdStatus.CRITICAL };
      case ObservabilityThresholdStatus.WARNING:
        return { color: '#ffc107', type: ObservabilityThresholdStatus.WARNING };
      case ObservabilityThresholdStatus.NORMAL:
      default:
        return { color: '#28a745', type: ObservabilityThresholdStatus.NORMAL };
    }
  }

  /**
   * Get icon for alarm type.
   * v3: getIconForAlarmType()
   */
  getIconForAlarmType(type: string): string {
    switch (type) {
      case ObservabilityThresholdStatus.NORMAL:
        return 'check-circle';
      case ObservabilityThresholdStatus.WARNING:
        return 'exclamation-triangle';
      case ObservabilityThresholdStatus.CRITICAL:
        return 'xmark-circle';
      default:
        return 'check-circle';
    }
  }
}
