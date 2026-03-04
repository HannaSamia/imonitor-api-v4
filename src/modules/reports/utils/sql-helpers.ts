/**
 * SQL helper functions ported from v3 database.util.ts.
 * These generate MySQL-compatible SQL fragments for use in dynamic query building.
 */

/**
 * Generate a DATE_ADD SQL expression.
 * @param date - The base date value or column reference
 * @param value - The interval value (can be negative for DATE_SUB effect)
 * @param unit - The interval unit (MINUTE, HOUR, DAY, WEEK, MONTH, YEAR)
 * @returns DATE_ADD(date, INTERVAL value unit)
 */
export function dbDateAdd(date: string, value: string, unit: string): string {
  return `DATE_ADD(${date}, INTERVAL ${value} ${unit})`;
}

/**
 * Generate a DATE_FORMAT SQL expression.
 * @param value - The date value or column to format
 * @param format - The MySQL date format string
 * @returns date_format(value, format)
 */
export function dbDateFormat(value: string, format: string): string {
  return `date_format(${value}, ${format})`;
}

/**
 * Generate an IFNULL SQL expression.
 * @param column - The column or expression to check for NULL
 * @param alternative - The alternative value if NULL
 * @returns ifnull(column, alternative)
 */
export function dbIfNull(column: string, alternative: string): string {
  return `ifnull(${column}, ${alternative})`;
}

/**
 * Generate a ROUND SQL expression.
 * @param column - The column or expression to round
 * @param decimals - The number of decimal places
 * @returns round(column, decimals)
 */
export function dbRound(column: string, decimals: string): string {
  return `round(${column},${decimals})`;
}

/**
 * Generate a TRUNCATE SQL expression.
 * @param column - The column or expression to truncate
 * @param decimals - The number of decimal places
 * @returns truncate(column, decimals)
 */
export function dbTruncate(column: string, decimals: string): string {
  return `truncate(${column},${decimals})`;
}

/**
 * Generate an AES_DECRYPT SQL expression.
 * @param column - The encrypted column
 * @param key - The encryption key expression
 * @returns aes_decrypt(column, key)
 */
export function dbDecrypt(column: string, key: string): string {
  return `aes_decrypt(${column}, ${key})`;
}

/**
 * Generate a SHA2 hash SQL expression.
 * @param value - The value or column to hash
 * @returns sha2(value, 256)
 */
export function returnHashedString(value: string): string {
  return `sha2(${value},256)`;
}
