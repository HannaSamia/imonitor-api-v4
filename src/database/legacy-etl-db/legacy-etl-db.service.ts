import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { LEGACY_ETL_DB } from './legacy-etl-db.module';
import { AbstractLegacyDbService } from '../abstract-legacy-db.service';

@Injectable()
export class LegacyEtlDbService extends AbstractLegacyDbService implements OnModuleDestroy {
  protected readonly logger = new Logger(LegacyEtlDbService.name);

  constructor(@Inject(LEGACY_ETL_DB) protected readonly db: Pool) {
    super();
  }

  async onModuleDestroy(): Promise<void> {
    await this.closePool(this.db, 'LEGACY_ETL_DB');
  }
}
