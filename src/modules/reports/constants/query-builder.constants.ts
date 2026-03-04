/**
 * Query builder constants ported from v3 core/consts/queryBuilder.ts.
 * These are used throughout the dynamic SQL generation in QueryBuilderService.
 */

/** Key identifying the reference (params) table in the tables array */
export const REF_TABLE_KEY = 'refTable';

/** The ID used for the ref table in fieldsArray */
export const REF_TABLE_ID = '1';

/** Placeholder token for inner query field injection */
export const INNER_QUERY_KEY = 'f#f';

/** Placeholder token for inner GROUP BY injection */
export const INNER_GROUP_BY_KEY = '%#%';

/** Placeholder token for outer query inner value injection */
export const OUTER_QUERY_INNER_VALUE_KEY = '%*%';

/** Alpha node name column alias used in inner queries */
export const ALPHA_NODE_NAME = 'alpha_node_name';

/** Standard node_name column used in params table joins */
export const NODE_NAME = 'node_name';

/** Reference node column alias used in intermediate node table */
export const REF_NODE_NAME = 'node';

/** Separator: space-comma-space for SQL column lists */
export const SPACE_COMMA_SPACE_KEY = ' , ';

/** Separator: UNION for SQL union queries */
export const SPACE_UNION_SPACE_KEY = ' union ';

/** Separator: UNION ALL for SQL union queries */
export const SPACE_UNION_ALL_SPACE_KEY = ' union ALL ';

/** Separator: AND for SQL WHERE/JOIN conditions */
export const SPACE_AND_SPACE_KEY = ' and ';

/** Default value for unknown/null alpha fields */
export const UNKNOWN_KEY = 'Unknown';

/** MySQL numeric cast target type */
export const NUMERIC_CAST = 'decimal (65)';

/** Default stat_date column name */
export const DEFAULT_DATE_COLUMN = 'stat_date';

/** Suffix appended to compare column date display names */
export const CUSTOM_DATE_COLUMN = ' (Date)';

/** Table alias prefix for joined tables (t0, t1, t2, ...) */
export const JOIN_TABLE_NOTATION = 't';

/** Alias for the alpha (node) inner table */
export const ALPHA_TABLE_NAME = 'alphaTable';

/** Alias for the params inner table */
export const PARAMS_TABLE_NAME = 'paramsTable';

/** Alias for the date dimension table */
export const DATE_TABLE_NAME = 'dateTable';

/** Alias for the sub-table in inner query construction */
export const SUB_TABLE_NAME = 'subTable';

/** Placeholder for stat_date column in query templates */
export const STAT_DATE_PLACEHOLDER = 'STAT_DATE_PLACEHOLDER';
