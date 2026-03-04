/**
 * Interfaces ported from v3 report DTOs.
 * These represent the complex nested JSON structures stored as TEXT columns
 * in the database and sent/received in request/response bodies.
 */

// --- Global Filter ---

export interface IGlobalFilterRule {
  type: string;
  field: string;
  operator: string;
  value: string;
  isCustom: boolean;
}

export interface IReportGlobalFilter {
  condition?: string;
  rules?: Array<IGlobalFilterRule | IReportGlobalFilter>;
}

// --- Table Fields ---

export interface ITabularField {
  id: string;
  draggedId: string;
  columnName?: string;
  columnDisplayName: string;
  type: string;
  operation?: string;
  node?: string;
  isExplodedBy?: boolean;
}

export interface IReportField extends ITabularField {
  footerAggregation: Array<string>;
  decimalNumbers?: number;
  thresholdUpperValue?: number;
  thresholdLowerValue?: number;
  dateFormat?: string;
  hidden: boolean;
  pinned: boolean;
  trunc?: boolean;
  round?: boolean;
  index: number;
  trValue?: number;
  selected?: boolean;
  isMetric?: boolean;
}

export interface IMinimalTabularTable {
  id: string;
  displayName: string;
  role?: string;
  fields: Array<IReportField>;
}

export interface ITabularTable extends IMinimalTabularTable {
  tableName: string;
  startTime: string;
  statInterval: number;
  tableHourName: string;
  tableDayName: string;
  paramsTable: string;
  paramsNodeName: string;
  nodeNameColumn: string;
  statDateNameColumn: string;
  gracePeriod: number;
}

// --- Order By ---

export interface ITabularOrderBy {
  draggedId: string;
  columnDisplayName: string;
  orderBy: string;
}

// --- Custom Columns ---

export interface IWhenSubCondition {
  fieldStatement: string;
  fieldStatementId: string;
  isCustomField: boolean;
  operator: string;
  whenStatement: string;
  isFieldCustomColumn: boolean;
  isWhenCustomColumn: boolean;
  whenStatementId: string;
  whenStatementType: string;
}

export interface IWhenCondition {
  whenStatementId: string;
  fieldStatementId: string;
  whenStatementType: string;
  whenStatement: string;
  operator: string;
  fieldStatement: string;
  thenStatementId: string;
  thenStatement: string;
  isThenCustomField: boolean;
  isCustomField: boolean;
  isSubCondition: boolean;
  isFieldCustomColumn: boolean;
  isThenCustomColumn: boolean;
  isWhenCustomColumn: boolean;
  condition: string;
  subCondition: IWhenSubCondition;
}

export interface IControlValue {
  elseStatement: string;
  elseStatementId: string;
  elseStatementTableId: string;
  iselseCustomField: boolean;
  whenCondition: Array<IWhenCondition>;
  isElseCustomColumn: boolean;
}

export interface IOperationColumn {
  isOperation: boolean;
  isCustomColumn: boolean;
  draggedId: string;
}

export interface IOperationOperatorColumn {
  isOperation: boolean;
  operator: string;
}

export type OperationColumnType = IOperationOperatorColumn | IOperationColumn;

export interface ICustomControlColumn {
  draggedId: string;
  columnDisplayName: string;
  footerAggregation: Array<string>;
  type: string;
  controlValue: IControlValue;
  customColumnType: string;
  customColumn: boolean;
  operation: string;
  hidden: boolean;
  pinned: boolean;
  trunc: boolean;
  round: boolean;
  index: number;
  trValue: number;
  selected?: boolean;
  isMetric?: boolean;
  isExplodedBy?: boolean;
}

export interface ICustomOperationColumn {
  draggedId: string;
  columnDisplayName: string;
  footerAggregation: Array<string>;
  type: string;
  operation: string;
  savedTokens: Array<OperationColumnType>;
  customColumn: boolean;
  customColumnType: string;
  hidden: boolean;
  pinned: boolean;
  index: number;
  trunc: boolean;
  round: boolean;
  trValue: number;
  selected?: boolean;
  isMetric?: boolean;
  isExplodedBy?: boolean;
}

export interface ICustomCompareColumn {
  draggedId: string;
  columnDisplayName: string;
  timeFilter: string;
  backPeriod: number;
  customColumn: boolean;
  customColumnType: string;
  operation: string;
  footerAggregation: Array<string>;
  withStatDate: boolean;
  dateFormat: string;
  hidden: boolean;
  pinned: boolean;
  isCustom: boolean;
  customString?: string;
  tablesUsed?: Array<string>;
  type: string;
  usedColumnId: string;
  trunc: boolean;
  round: boolean;
  index: number;
  trValue: number;
  selected?: boolean;
  isMetric?: boolean;
  isExplodedBy?: boolean;
}

// --- Report Options & Thresholds ---

export interface IReportThreshold {
  minVal: number;
  minColor: string;
  minBgColor: string;
  midColor: string;
  midBgColor: string;
  maxVal: number;
  maxColor: string;
  maxBgColor: string;
}

export interface ITableThreshold {
  [tableName: string]: IReportThreshold;
}

export interface IReportOptions {
  threshold: ITableThreshold;
  isFooterAggregation: boolean;
  globalFieldIndex: number;
}

// --- Chart Data (generic — stored as JSON in data column) ---

export interface IChartData {
  id: string;
  name: string;
  type: string;
  orderIndex: number;
  [key: string]: unknown;
}

// --- Fields Array Entry (used by QueryBuilder + chart generators) ---

export interface IFieldsArrayEntry {
  tableId?: string;
  type: string;
  tableIndex?: number;
  draggedId: string;
  isCustomColumn: boolean;
  operation?: string;
  tableName?: string;
  tableNodeColumn?: string;
  columnName?: string;
  columnDisplayName: string;
  refNodeColumn?: string;
  customColumnType?: string;
  builtString?: string;
  [key: string]: unknown;
}

// --- Tabular Header ---

export interface ITabularHeader {
  text: string;
  datafield: string;
  columnName?: string;
  aggregates: string[];
  pinned: boolean;
  hidden: boolean;
  draggedId?: string;
  editable?: boolean;
  columntype?: string;
  index?: number;
  headerColumnType?: string;
}

// --- Privileged Table Field ---

export interface IPrivilegeTableField {
  id: string;
  node: string;
  columnDisplayName: string;
  type: string;
  operation: string;
}
