import { ChartTypes } from '../enums';

export const REPORT_TABLE_ID = '0';

export const FETCH_CHART_DB_FUNCTION =
  "JSON_INSERT(`data` , '$.name', `name`, '$.id', id, '$.type', `type`, '$.orderIndex', `orderIndex`)";

export const FETCH_WIDGETCHART_DB_FUNCTION =
  "JSON_INSERT(`data` , '$.name', `name`, '$.id', id, '$.type', `type`, '$.orderIndex', `orderIndex`, '$.options.notifications', `notification`)";

export const CHARTS_WITHOUT_NOTIFICATION = [
  ChartTypes.COMPARE_TREND,
  ChartTypes.TREND,
  ChartTypes.WIDGET_BUILDER_TREND,
  ChartTypes.PIE,
];

export const REPORT_TABLE_CHART_DEFAULT_VALUE = {
  id: REPORT_TABLE_ID,
  name: ChartTypes.TABLE,
  type: ChartTypes.TABLE,
  orderIndex: 0,
  util: {
    width: 0,
    height: 0,
    fontSize: '',
    loaded: false,
    hasError: false,
    isLoading: false,
    isDefault: false,
    isReport: true,
    isWigetBuilder: false,
    isChart: false,
    isExploded: false,
  },
  lib: {
    body: [],
    header: [],
    options: null,
  },
};
