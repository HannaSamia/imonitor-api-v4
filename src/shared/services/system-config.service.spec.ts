import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SystemConfigService } from './system-config.service';
import { CoreSysConfig } from '../../database/entities/core-sys-config.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfigRow(confKey: string, confVal: string): CoreSysConfig {
  return {
    confKey,
    confVal,
    reportSetting: null,
    selfAnalysisSetting: null,
    widgetBuilderSetting: null,
    dashboardSetting: null,
    generalSetting: null,
    operationSettings: null,
    description: null,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('SystemConfigService', () => {
  let service: SystemConfigService;
  let sysConfigRepo: any;

  /** Re-creates the module so the cache starts empty before every test. */
  async function buildModule(): Promise<void> {
    const mockQb: any = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    sysConfigRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SystemConfigService, { provide: getRepositoryToken(CoreSysConfig), useValue: sysConfigRepo }],
    }).compile();

    service = module.get<SystemConfigService>(SystemConfigService);
  }

  beforeEach(async () => {
    await buildModule();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // ─── getConfigValue ────────────────────────────────────────────────────────

  describe('getConfigValue', () => {
    it('should query the database and return the value on a cache miss', async () => {
      sysConfigRepo.findOne.mockResolvedValue(makeConfigRow('session_ttl', '30'));

      const result = await service.getConfigValue('session_ttl');

      expect(result).toBe('30');
      expect(sysConfigRepo.findOne).toHaveBeenCalledTimes(1);
      expect(sysConfigRepo.findOne).toHaveBeenCalledWith({ where: { confKey: 'session_ttl' } });
    });

    it('should return null and not cache anything when the key does not exist in the database', async () => {
      sysConfigRepo.findOne.mockResolvedValue(null);

      const first = await service.getConfigValue('missing_key');
      const second = await service.getConfigValue('missing_key');

      expect(first).toBeNull();
      expect(second).toBeNull();
      // Both calls should have hit the DB because null values are not cached
      expect(sysConfigRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('should return the cached value and skip the database on a cache hit', async () => {
      sysConfigRepo.findOne.mockResolvedValue(makeConfigRow('theme', 'dark'));

      // Prime the cache
      await service.getConfigValue('theme');
      // Second call — should use cache
      const cached = await service.getConfigValue('theme');

      expect(cached).toBe('dark');
      expect(sysConfigRepo.findOne).toHaveBeenCalledTimes(1); // DB hit only once
    });

    it('should re-query the database after the TTL expires', async () => {
      jest.useFakeTimers();

      sysConfigRepo.findOne.mockResolvedValue(makeConfigRow('refresh_ttl', '60'));

      // First call — populates cache
      await service.getConfigValue('refresh_ttl');

      // Advance time past 60-second TTL
      jest.advanceTimersByTime(61_000);

      // Second call — cache should be stale, DB queried again
      await service.getConfigValue('refresh_ttl');

      expect(sysConfigRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('should serve from cache before the TTL expires', async () => {
      jest.useFakeTimers();

      sysConfigRepo.findOne.mockResolvedValue(makeConfigRow('api_key_ttl', '120'));

      await service.getConfigValue('api_key_ttl');
      jest.advanceTimersByTime(59_000); // one second before expiry
      await service.getConfigValue('api_key_ttl');

      expect(sysConfigRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple distinct keys independently in the cache', async () => {
      sysConfigRepo.findOne
        .mockResolvedValueOnce(makeConfigRow('key_a', 'val_a'))
        .mockResolvedValueOnce(makeConfigRow('key_b', 'val_b'));

      const a = await service.getConfigValue('key_a');
      const b = await service.getConfigValue('key_b');
      // Both cached — no more DB calls
      const aCached = await service.getConfigValue('key_a');
      const bCached = await service.getConfigValue('key_b');

      expect(a).toBe('val_a');
      expect(b).toBe('val_b');
      expect(aCached).toBe('val_a');
      expect(bCached).toBe('val_b');
      expect(sysConfigRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  // ─── getConfigValues ───────────────────────────────────────────────────────

  describe('getConfigValues', () => {
    it('should query the database for all keys on a full cache miss', async () => {
      sysConfigRepo.find.mockResolvedValue([makeConfigRow('key1', 'val1'), makeConfigRow('key2', 'val2')]);

      const result = await service.getConfigValues(['key1', 'key2']);

      expect(result).toEqual({ key1: 'val1', key2: 'val2' });
      expect(sysConfigRepo.find).toHaveBeenCalledTimes(1);
    });

    it('should only query uncached keys when some keys are already in the cache', async () => {
      // Seed the cache for key1 via getConfigValue
      sysConfigRepo.findOne.mockResolvedValue(makeConfigRow('key1', 'cached_val'));
      await service.getConfigValue('key1');
      jest.clearAllMocks(); // reset call count

      // Now request key1 (cached) + key2 (not cached)
      sysConfigRepo.find.mockResolvedValue([makeConfigRow('key2', 'fresh_val')]);
      const result = await service.getConfigValues(['key1', 'key2']);

      expect(result['key1']).toBe('cached_val');
      expect(result['key2']).toBe('fresh_val');

      // DB query must only include key2 (key1 was cached)
      expect(sysConfigRepo.find).toHaveBeenCalledTimes(1);
      const findCall = sysConfigRepo.find.mock.calls[0][0];
      expect(findCall.where.confKey._value).toContain('key2');
      expect(findCall.where.confKey._value).not.toContain('key1');
    });

    it('should skip the database entirely when all keys are cached', async () => {
      // Seed cache
      sysConfigRepo.findOne
        .mockResolvedValueOnce(makeConfigRow('k1', 'v1'))
        .mockResolvedValueOnce(makeConfigRow('k2', 'v2'));
      await service.getConfigValue('k1');
      await service.getConfigValue('k2');
      jest.clearAllMocks();

      const result = await service.getConfigValues(['k1', 'k2']);

      expect(result).toEqual({ k1: 'v1', k2: 'v2' });
      expect(sysConfigRepo.find).not.toHaveBeenCalled();
    });

    it('should return an empty object for an empty keys array', async () => {
      const result = await service.getConfigValues([]);

      expect(result).toEqual({});
      expect(sysConfigRepo.find).not.toHaveBeenCalled();
    });

    it('should cache newly fetched values so subsequent calls do not re-query', async () => {
      sysConfigRepo.find.mockResolvedValue([makeConfigRow('batch_key', 'batch_val')]);

      await service.getConfigValues(['batch_key']);
      jest.clearAllMocks();

      // Second call — should hit the cache, not the DB
      const result = await service.getConfigValues(['batch_key']);

      expect(result['batch_key']).toBe('batch_val');
      expect(sysConfigRepo.find).not.toHaveBeenCalled();
    });

    it('should omit keys that are not found in the database from the result', async () => {
      // DB only returns one of the two requested keys
      sysConfigRepo.find.mockResolvedValue([makeConfigRow('exists', '42')]);

      const result = await service.getConfigValues(['exists', 'missing']);

      expect(result).toHaveProperty('exists', '42');
      expect(result).not.toHaveProperty('missing');
    });
  });

  // ─── getSettingsByColumn ───────────────────────────────────────────────────

  describe('getSettingsByColumn', () => {
    const VALID_COLUMNS = [
      'reportSetting',
      'selfAnalysisSetting',
      'widgetBuilderSetting',
      'dashboardSetting',
      'generalSetting',
      'operationSettings',
    ];

    it.each(VALID_COLUMNS)('should query the database for the valid column "%s"', async (column) => {
      const rows = [makeConfigRow('some_key', 'some_val')];
      const mockQb: any = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      sysConfigRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getSettingsByColumn(column);

      expect(sysConfigRepo.createQueryBuilder).toHaveBeenCalledWith('config');
      expect(mockQb.where).toHaveBeenCalledWith(`config.${column} = :val`, { val: 1 });
      expect(result).toEqual(rows);
    });

    it('should return an empty array for an invalid column name', async () => {
      const result = await service.getSettingsByColumn('passwordHash');

      expect(result).toEqual([]);
      expect(sysConfigRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return an empty array for an empty string column name', async () => {
      const result = await service.getSettingsByColumn('');

      expect(result).toEqual([]);
      expect(sysConfigRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return an empty array for a SQL injection attempt', async () => {
      const result = await service.getSettingsByColumn('1=1; DROP TABLE core_sys_config; --');

      expect(result).toEqual([]);
      expect(sysConfigRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return an empty array for a column that differs only in case', async () => {
      // 'ReportSetting' is not the same as 'reportSetting'
      const result = await service.getSettingsByColumn('ReportSetting');

      expect(result).toEqual([]);
      expect(sysConfigRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
