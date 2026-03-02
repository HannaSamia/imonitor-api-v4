import { Logger } from '@nestjs/common';
import { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';

/** Retryable connection error codes */
const RETRYABLE_ERRORS = ['ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH'];

/**
 * Abstract base class for legacy database services (iMonitorData, EtlV3_2).
 * Provides query(), multiQuery(), affectedQuery(), execute() with connection
 * retry logic and proper connection release via finally blocks.
 */
export abstract class AbstractLegacyDbService {
  protected abstract readonly logger: Logger;
  protected abstract readonly db: Pool;

  async query<T>(sql: string, values: Array<string | number | boolean | unknown> = [], retryCount = 3): Promise<T[]> {
    let connection: PoolConnection | undefined;
    try {
      connection = await this.db.getConnection();
      const [rows] = await connection.query(sql, [...values]);
      return rows as T[];
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (RETRYABLE_ERRORS.includes(err.code || '') && retryCount > 0) {
        this.logger.warn(`query encountered ${err.code}, retrying... (${retryCount})`);
        return this.query(sql, values, retryCount - 1);
      }
      this.logger.error('Error from query function', error);
      throw error;
    } finally {
      connection?.release();
    }
  }

  async multiQuery<T>(sql: string, values: Array<string | number | boolean | unknown> = []): Promise<Array<T[]>> {
    try {
      const [rows] = await this.db.query(sql, [...values]);
      return rows as Array<T[]>;
    } catch (error: unknown) {
      this.logger.error('Error from multiQuery function', error);
      throw error;
    }
  }

  async affectedQuery(sql: string, values: Array<string | number | boolean | unknown> = []): Promise<ResultSetHeader> {
    try {
      const result = await this.db.query<ResultSetHeader>(sql, [...values]);
      return result[0];
    } catch (error: unknown) {
      this.logger.error('Error from affectedQuery function', error);
      throw error;
    }
  }

  async execute(sql: string, values: Array<string | number | boolean | unknown> = []): Promise<boolean> {
    try {
      const result = await this.db.execute<ResultSetHeader>(sql, values as (string | number | boolean | null)[]);
      return result[0].affectedRows > 0;
    } catch (error: unknown) {
      this.logger.error('Error from execute function', error);
      throw error;
    }
  }

  async checkConnection(): Promise<boolean> {
    let connection: PoolConnection | undefined;
    try {
      connection = await this.db.getConnection();
      return true;
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      this.logger.error(`Database connection failed: ${err.code || err.message}`);
      return false;
    } finally {
      connection?.release();
    }
  }

  protected async closePool(pool: Pool, name: string): Promise<void> {
    try {
      await Promise.race([pool.end(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))]);
      this.logger.log(`${name} pool closed`);
    } catch (err: unknown) {
      this.logger.error(`Error closing ${name} pool: ${(err as Error).message}`);
    }
  }
}
