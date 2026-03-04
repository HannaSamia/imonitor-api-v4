export enum ChartTypes {
  PIE = 'pie',
  DOUGHNUT = 'doughnut',
  TREND = 'trend',
  WIDGET_BUILDER_TREND = 'widget_builder_trend',
  VERTICAL_BAR = 'vertical_bar',
  HORIZONTAL_BAR = 'horizontal_bar',
  PROGRESS = 'progress',
  EXPLODED_PROGRESS = 'exploded_progress',
  PERCENTAGE = 'percentage',
  EXPLODED_PERCENTAGE = 'exploded_percentage',
  TABULAR = 'tabular',
  COUNTER = 'counter',
  EXPLODED_COUNTER = 'exploded_counter',
  SOLO_BAR = 'solo_bar',
  COMPARE_TREND = 'compare_trend',
  TOP_LEAST_BAR = 'top_least_bar',
  TOP_LEAST_TABULAR = 'top_least_tabular',
  CUMULATIVE_TABLE = 'cumulative_table',
  TABLE = 'table',
}

export enum BarLabelValues {
  NONE = 'none',
  VALUE = 'value',
  SERIE_VALUE = 'serie_value',
  COLUMN_VALUE = 'column_value',
}

export enum ChartStatus {
  CREATED = 'created',
  EDITED = 'edited',
  DELETED = 'deleted',
}

export enum ChartLegendLabelType {
  LEGEND_VALUE = 'legend_value',
  LEGEND_PERCENTAGE = 'legend_percentage',
}

export enum ThresholdOperator {
  LESS_THAN = '<',
  LESS_THAN_OR_EQUAL = '<=',
  GREATER = '>',
  GREATER_OR_EQUAL = '>=',
  EQUAL = '=',
}

export enum ChartUseTypes {
  DASHBOARD = 'dashboard',
  DATA_ANALYSIS = 'data_analysis',
}

export enum ChartOperationType {
  SUM = 'sum',
  COUNT = 'count',
  AVERAGE = 'avg',
}
