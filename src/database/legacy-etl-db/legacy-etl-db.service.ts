import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { LEGACY_ETL_DB } from './legacy-etl-db.module';

@Injectable()
export class LegacyEtlDbService implements OnModuleDestroy {
  private readonly logger = new Logger(LegacyEtlDbService.name);

  constructor(@Inject(LEGACY_ETL_DB) private readonly db: Pool) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.db.end();
      this.logger.log('LEGACY_ETL_DB pool closed');
    } catch (err: unknown) {
      this.logger.error(`Error closing LEGACY_ETL_DB pool: ${(err as Error).message}`);
    }
  }

  async query<T>(sql: string, values: Array<string | number | boolean | unknown> = [], retryCount = 3): Promise<T[]> {
    let connection: PoolConnection | undefined;
    try {
      connection = await this.db.getConnection();
      const [rows] = await connection.query(sql, [...values]);
      return rows as T[];
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if ((err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'EHOSTUNREACH') && retryCount > 0) {
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
    } catch (error) {
      this.logger.error('Error from multiQuery function', error);
      throw error;
    }
  }

  async affectedQuery(sql: string, values: Array<string | number | boolean | unknown> = []): Promise<ResultSetHeader> {
    try {
      const result = await this.db.query<ResultSetHeader>(sql, [...values]);
      return result[0];
    } catch (error) {
      this.logger.error('Error from affectedQuery function', error);
      throw error;
    }
  }

  async execute(sql: string, values: Array<string | number | boolean | unknown> = []): Promise<boolean> {
    try {
      const result = await this.db.execute<ResultSetHeader>(sql, values as any[]);
      return result[0].affectedRows > 0;
    } catch (error) {
      this.logger.error('Error from execute function', error);
      throw error;
    }
  }
}
