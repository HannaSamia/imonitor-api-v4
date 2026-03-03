import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CoreSysConfig } from '../../database/entities/core-sys-config.entity';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class SystemConfigService {
  private static readonly VALID_SETTING_COLUMNS = new Set([
    'reportSetting',
    'selfAnalysisSetting',
    'widgetBuilderSetting',
    'dashboardSetting',
    'generalSetting',
    'operationSettings',
  ]);

  /** In-memory TTL cache for config values (H-05 performance fix) */
  private readonly cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 60_000; // 60 seconds

  constructor(
    @InjectRepository(CoreSysConfig)
    private readonly sysConfigRepo: Repository<CoreSysConfig>,
  ) {}

  async getConfigValue(key: string): Promise<string | null> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const row = await this.sysConfigRepo.findOne({ where: { confKey: key } });
    const value = row?.confVal ?? null;
    if (value !== null) {
      this.cache.set(key, { value, expiresAt: Date.now() + this.TTL_MS });
    }
    return value;
  }

  async getConfigValues(keys: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const uncachedKeys: string[] = [];
    const now = Date.now();

    for (const key of keys) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > now) {
        result[key] = cached.value;
      } else {
        uncachedKeys.push(key);
      }
    }

    if (uncachedKeys.length > 0) {
      const rows = await this.sysConfigRepo.find({ where: { confKey: In(uncachedKeys) } });
      const expiresAt = now + this.TTL_MS;
      for (const row of rows) {
        result[row.confKey] = row.confVal;
        this.cache.set(row.confKey, { value: row.confVal, expiresAt });
      }
    }

    return result;
  }

  async getSettingsByColumn(columnName: string): Promise<CoreSysConfig[]> {
    if (!SystemConfigService.VALID_SETTING_COLUMNS.has(columnName)) {
      return [];
    }
    return this.sysConfigRepo.createQueryBuilder('config').where(`config.${columnName} = :val`, { val: 1 }).getMany();
  }
}
