import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool, ResultSetHeader } from 'mysql2/promise';
import { LEGACY_ETL_DB } from './legacy-etl-db.module';

@Injectable()
export class LegacyEtlDbService {
  private readonly logger = new Logger(LegacyEtlDbService.name);

  constructor(@Inject(LEGACY_ETL_DB) private readonly db: Pool) {}

  async query<T>(sql: string, values: Array<string | number | boolean | unknown> = [], retryCount = 3): Promise<T[]> {
    const connection = await this.db.getConnection();
    try {
      const result = JSON.parse(JSON.stringify((await connection.query(sql, [...values]))[0])) as T[];
      connection.release();
      return result;
    } catch (error) {
      connection.release();
      if ((error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'EHOSTUNREACH') && retryCount > 0) {
        this.logger.warn(`query encountered ${error.code}, retrying... (${retryCount})`);
        return this.query(sql, values, retryCount - 1);
      }
      this.logger.error('Error from query function', error);
      throw error;
    }
  }

  async multiQuery<T>(sql: string, values: Array<string | number | boolean | unknown> = []): Promise<Array<T[]>> {
    try {
      return JSON.parse(JSON.stringify((await this.db.query(sql, [...values]))[0])) as Array<T[]>;
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
