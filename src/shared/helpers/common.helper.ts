import { randomUUID, createHash } from 'crypto';
import { existsSync, mkdirSync, statSync } from 'fs';

export function generateGuid(): string {
  return randomUUID();
}

export function multipleColumnSet(
  object: Record<string, unknown>,
  forWhere = false,
): { columnSet: string; values: unknown[] } {
  const keys = Object.keys(object);
  const values = Object.values(object);
  const separator = forWhere ? ' AND ' : ', ';
  const columnSet = keys.map((key) => `\`${key}\` = ?`).join(separator);
  return { columnSet, values };
}

export function isEmptyString(str: string | unknown[]): boolean {
  return !str || str.length === 0;
}

export function isBlankString(str: string): boolean {
  return /^\s*$/.test(str);
}

export function isUndefinedOrNull(obj: unknown): obj is undefined | null {
  return obj === undefined || obj == null;
}

export function deepCopy<T>(inObject: T): T {
  if (typeof inObject !== 'object' || inObject === null) {
    return inObject;
  }
  const outObject = (Array.isArray(inObject) ? [] : {}) as T;
  for (const key in inObject) {
    (outObject as Record<string, unknown>)[key] = deepCopy(inObject[key]);
  }
  return outObject;
}

export function generateRandomPassword(): string {
  const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numeric = '0123456789';
  const special = '!@#$%^&*()_+-=';
  const all = alpha + numeric + special;

  let password = '';
  for (let i = 0; i < 5; i++) password += alpha[Math.floor(Math.random() * alpha.length)];
  for (let i = 0; i < 3; i++) password += numeric[Math.floor(Math.random() * numeric.length)];
  for (let i = 0; i < 3; i++) password += special[Math.floor(Math.random() * special.length)];
  for (let i = 0; i < 10; i++) password += all[Math.floor(Math.random() * all.length)];

  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

export function normalizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.]/g, '_').toLowerCase();
}

export async function ensureDirCreation(path: string): Promise<void> {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

export async function generateHash(str: string, size = 36): Promise<string> {
  return createHash('sha256').update(str).digest('hex').slice(0, size);
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isNumeric(str: unknown): boolean {
  if (typeof str === 'number') return true;
  if (typeof str !== 'string') return false;
  return !isNaN(Number(str)) && !isNaN(parseFloat(str));
}

export function timeOut(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format MSISDN: strip leading +, 0, spaces, and country code prefix.
 * Mirrors v3 msisdnFormater() logic exactly.
 * @param msisdn Raw phone number input
 * @param countryCode Country code from system config (e.g. '234')
 * @param forceIntl If true, prepend country code back after stripping
 */
export function msisdnFormatter(msisdn: string, countryCode: string, forceIntl = false): string {
  let formatted = msisdn.replace(/^[+0\s]+/, '').replace(/\s+/g, '');

  if (formatted.startsWith('0')) {
    formatted = formatted.substring(1);
  }

  if (formatted.startsWith(`${countryCode}0`)) {
    formatted = formatted.substring(countryCode.length + 1);
  } else if (formatted.startsWith(countryCode)) {
    formatted = formatted.substring(countryCode.length);
  }

  if (forceIntl) {
    formatted = `${countryCode}${formatted}`;
  }

  return formatted;
}
