export enum ObservabilityTimeFrames {
  CURRENT = 'current',
  HOUR_24 = 'hour_24',
  HOUR_48 = 'hour_48',
  CUSTOM = 'custom',
}

export enum MetricChartFilters {
  ALL = 'all',
  EXPLODED = 'exploded',
  NORMAL = 'normal',
}

export enum ObservabilityThresholdStatus {
  NORMAL = 'normal',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum ObservabilityChartType {
  VERTICAL_STATUS_PANEL = 'vertical_status_panel',
  HORIZONTAL_STATUS_PANEL = 'horizontal_status_panel',
  COUNTER_LIST = 'counter_list',
  HEXAGON = 'hexagon',
  TREND = 'trend_ob',
  BAR = 'bar_ob',
  CONNECTIVITY = 'connectivity',
  TIME_TRAVEL = 'time_travel',
}

export const STAT_DATE_FIELD = '`Stat Date` as statDate';
