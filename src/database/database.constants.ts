/** Shared MySQL pool configuration for legacy database modules */
export const MYSQL_POOL_DEFAULTS = {
  connectionLimit: 5,
  enableKeepAlive: true,
  keepAliveInitialDelay: 1000,
} as const;

/** TypeCast handler to fix VAR_STRING type coercion in mysql2 */

export const mysqlTypeCast = (field: any, next: () => any) => {
  if (field.type === 'VAR_STRING') {
    return field.string();
  }
  return next();
};
