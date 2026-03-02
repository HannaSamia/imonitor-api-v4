import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { LEGACY_DATA_DB, LEGACY_DATA_LIMITED_DB } from './legacy-data-db.module';
import { AbstractLegacyDbService } from '../abstract-legacy-db.service';

@Injectable()
export class LegacyDataDbService extends AbstractLegacyDbService implements OnModuleDestroy {
  protected readonly logger = new Logger(LegacyDataDbService.name);

  constructor(
    @Inject(LEGACY_DATA_DB) protected readonly db: Pool,
    @Inject(LEGACY_DATA_LIMITED_DB) private readonly limitedDb: Pool,
  ) {
    super();
  }

  async onModuleDestroy(): Promise<void> {
    await this.closePool(this.db, 'LEGACY_DATA_DB');
    await this.closePool(this.limitedDb, 'LEGACY_DATA_LIMITED_DB');
  }

  async nativeQuery(sql: string, values: Array<string | number | boolean | unknown> = []): Promise<unknown> {
    return this.limitedDb.query(sql, [...values]);
  }
}
