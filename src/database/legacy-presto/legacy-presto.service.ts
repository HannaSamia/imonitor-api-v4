import { Injectable, Inject, Logger } from '@nestjs/common';
import { PRESTO_CLIENT } from './legacy-presto.module';

interface PrestoConfig {
  host: string;
  port: number;
}

@Injectable()
export class LegacyPrestoService {
  private readonly logger = new Logger(LegacyPrestoService.name);

  constructor(@Inject(PRESTO_CLIENT) private readonly prestoConfig: PrestoConfig) {}

  /**
   * Execute a Presto query. The presto-client package is loaded lazily
   * since it's only used for bill run CDR analysis.
   */
  async query<T>(sql: string, catalog = 'hive', schema = 'default'): Promise<T[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('presto-client');
      const client = new Client({
        host: this.prestoConfig.host,
        port: this.prestoConfig.port,
        catalog,
        schema,
      });

      return new Promise<T[]>((resolve, reject) => {
        const rows: T[] = [];
        client.execute({
          query: sql,
          data: (error: Error, data: any) => {
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
