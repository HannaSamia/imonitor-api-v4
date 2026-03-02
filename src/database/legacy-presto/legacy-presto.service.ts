import { Injectable, Inject, Logger } from '@nestjs/common';
import { PRESTO_CLIENT } from './legacy-presto.module';

interface PrestoConfig {
  host: string;
  port: number;
}

@Injectable()
export class LegacyPrestoService {
  private readonly logger = new Logger(LegacyPrestoService.name);
  private client: any;

  constructor(@Inject(PRESTO_CLIENT) private readonly prestoConfig: PrestoConfig) {}

  /**
   * Get or lazily initialize the Presto client singleton.
   */
  private getClient(): any {
    if (!this.client) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('presto-client');
      this.client = new Client({
        host: this.prestoConfig.host,
        port: this.prestoConfig.port,
      });
    }
    return this.client;
  }

  /**
   * Execute a Presto query with catalog/schema override per call.
   */
  async query<T>(sql: string, catalog = 'hive', schema = 'default'): Promise<T[]> {
    try {
      const client = this.getClient();

      return new Promise<T[]>((resolve, reject) => {
        const rows: T[] = [];
        client.execute({
          query: sql,
          catalog,
          schema,
          data: (error: Error | null, data: any) => {
            if (error) {
              reject(error);
              return;
            }
            rows.push(...data);
          },
          success: () => resolve(rows),
          error: (error: Error) => {
            this.logger.error('Presto query error', error);
            reject(error);
          },
        });
      });
    } catch (error) {
      this.logger.error('Presto query failed', error);
      throw error;
    }
  }
}
