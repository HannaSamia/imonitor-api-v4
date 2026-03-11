import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ConnectivityService } from './connectivity.service';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { ExportHelperService } from '../../shared/services/export-helper.service';
import { ConnectivityFilter } from '../../shared/enums';

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockModulesTablesRepo() {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
}

const mockLegacyDataDb = {
  query: jest.fn(),
  multiQuery: jest.fn(),
};

const mockSystemConfigService = {
  getConfigValue: jest.fn(),
  getConfigValues: jest.fn(),
};

const mockDateHelper = {
  formatDate: jest.fn().mockReturnValue('2026-03-11 10:00:00'),
};

const mockExportHelper = {
  exportTabularToExcel: jest.fn().mockResolvedValue('/tmp/export.xlsx'),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'DB_DATA_NAME') return 'iMonitorData';
    if (key === 'DB_CORE_NAME') return 'iMonitorV3_1';
    return undefined;
  }),
};

// ─── Test Data ───────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-abc-123';

const sampleConnectivityTable = {
  id: 'tbl-1',
  tableName: 'V3_sdp_connectivity_test',
  nodeNameColumn: 'node_name',
  statDateNameColumn: 'stat_date',
};

const sampleCurrentRow = {
  stat_date: '2026-03-11 10:00:00',
  module: 'SDP',
  node_name: 'sdp-node-01',
  ip: '10.0.0.1',
  ssh_user: 'admin',
  state: 'Reporting',
  status: 'OK',
};

const sampleHistoryRow = {
  stat_date: '2026-03-11 10:00:00',
  module: 'SDP',
  node_name: 'sdp-node-01',
  ip: '10.0.0.1',
  ssh_user: 'admin',
  status: 'OK',
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('ConnectivityService', () => {
  let service: ConnectivityService;
  let modulesTablesRepo: ReturnType<typeof createMockModulesTablesRepo>;

  beforeEach(async () => {
    modulesTablesRepo = createMockModulesTablesRepo();

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectivityService,
        { provide: getRepositoryToken(CoreModulesTables), useValue: modulesTablesRepo },
        { provide: LegacyDataDbService, useValue: mockLegacyDataDb },
        { provide: SystemConfigService, useValue: mockSystemConfigService },
        { provide: DateHelperService, useValue: mockDateHelper },
        { provide: ExportHelperService, useValue: mockExportHelper },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ConnectivityService>(ConnectivityService);
  });

  // ─── getAllConnectivities ─────────────────────────────────────────────────

  describe('getAllConnectivities()', () => {
    it('should return headers with empty body when no connectivity tables are found', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);

      const result = await service.getAllConnectivities(TEST_USER_ID);

      expect(result.body).toEqual([]);
      expect(result.header).toHaveLength(7);
      expect(result.header[0].datafield).toBe('stat_date');
      expect(result.header[6].datafield).toBe('status');
    });

    it('should query legacy DB and return rows when connectivity tables exist', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValue.mockResolvedValue('3');
      mockLegacyDataDb.multiQuery.mockResolvedValue([[], [sampleCurrentRow]]);

      const result = await service.getAllConnectivities(TEST_USER_ID);

      expect(mockLegacyDataDb.multiQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [TEST_USER_ID]);
      expect(result.body).toEqual([sampleCurrentRow]);
      expect(result.header).toHaveLength(7);
    });

    it('should use default backPeriod of 3 when config returns null', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValue.mockResolvedValue(null);
      mockLegacyDataDb.multiQuery.mockResolvedValue([[], [sampleCurrentRow]]);

      await service.getAllConnectivities(TEST_USER_ID);

      expect(mockSystemConfigService.getConfigValue).toHaveBeenCalledWith('connectivityBackPeriod');
      expect(mockLegacyDataDb.multiQuery).toHaveBeenCalled();
    });

    it('should return empty body and log error when multiQuery throws', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValue.mockResolvedValue('5');
      mockLegacyDataDb.multiQuery.mockRejectedValue(new Error('DB error'));

      const result = await service.getAllConnectivities(TEST_USER_ID);

      expect(result.body).toEqual([]);
      expect(result.header).toHaveLength(7);
    });

    it('should build UNION ALL when multiple connectivity tables exist', async () => {
      const secondTable = {
        id: 'tbl-2',
        tableName: 'V3_air_connectivity_test',
        nodeNameColumn: 'node_name',
        statDateNameColumn: 'stat_date',
      };
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable, secondTable]);
      mockSystemConfigService.getConfigValue.mockResolvedValue('3');
      mockLegacyDataDb.multiQuery.mockResolvedValue([[], [sampleCurrentRow]]);

      await service.getAllConnectivities(TEST_USER_ID);

      const [sqlArg] = mockLegacyDataDb.multiQuery.mock.calls[0];
      expect(sqlArg).toContain('UNION ALL');
      expect(sqlArg).toContain('V3_sdp_connectivity_test');
      expect(sqlArg).toContain('V3_air_connectivity_test');
      // DB names sourced from ConfigService, not hardcoded
      expect(mockConfigService.get).toHaveBeenCalledWith('DB_DATA_NAME');
      expect(mockConfigService.get).toHaveBeenCalledWith('DB_CORE_NAME');
      expect(sqlArg).toContain('iMonitorData');
      expect(sqlArg).toContain('iMonitorV3_1');
    });
  });

  // ─── getUserConnectivityHistory ───────────────────────────────────────────

  describe('getUserConnectivityHistory()', () => {
    it('should return headers with empty body when no connectivity tables found', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);

      const result = await service.getUserConnectivityHistory(
        TEST_USER_ID,
        '2026-03-01',
        '2026-03-11',
        ConnectivityFilter.ALL,
      );

      expect(result.body).toEqual([]);
      expect(result.header).toHaveLength(6);
      expect(result.header[5].datafield).toBe('status');
    });

    it('should query history with ALL filter (no filter clause)', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValues.mockResolvedValue({ dateFormat1: '%Y-%m-%d %H:%i:%s' });
      mockLegacyDataDb.query.mockResolvedValue([sampleHistoryRow]);

      const result = await service.getUserConnectivityHistory(
        TEST_USER_ID,
        '2026-03-01',
        '2026-03-11',
        ConnectivityFilter.ALL,
      );

      const [sqlArg] = mockLegacyDataDb.query.mock.calls[0];
      expect(sqlArg).not.toContain('AND status =');
      expect(sqlArg).not.toContain('AND status <>');
      expect(result.body).toEqual([sampleHistoryRow]);
    });

    it('should apply ACTIVE filter clause for ConnectivityFilter.ACTIVE', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValues.mockResolvedValue({ dateFormat1: '%Y-%m-%d' });
      mockLegacyDataDb.query.mockResolvedValue([]);

      await service.getUserConnectivityHistory(TEST_USER_ID, '2026-03-01', '2026-03-11', ConnectivityFilter.ACTIVE);

      const [sqlArg] = mockLegacyDataDb.query.mock.calls[0];
      expect(sqlArg).toContain("AND status = 'OK'");
    });

    it('should apply INACTIVE filter clause for ConnectivityFilter.INACTIVE', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValues.mockResolvedValue({ dateFormat1: '%Y-%m-%d' });
      mockLegacyDataDb.query.mockResolvedValue([]);

      await service.getUserConnectivityHistory(TEST_USER_ID, '2026-03-01', '2026-03-11', ConnectivityFilter.INACTIVE);

      const [sqlArg] = mockLegacyDataDb.query.mock.calls[0];
      expect(sqlArg).toContain("AND status <> 'OK'");
    });

    it('should use fallback dateFormat when config returns no dateFormat1', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValues.mockResolvedValue({});
      mockLegacyDataDb.query.mockResolvedValue([]);

      await service.getUserConnectivityHistory(TEST_USER_ID, '2026-03-01', '2026-03-11', ConnectivityFilter.ALL);

      const [sqlArg] = mockLegacyDataDb.query.mock.calls[0];
      expect(sqlArg).toContain('%Y-%m-%d %H:%i:%s');
    });

    it('should return empty body and not throw when legacy query fails', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValues.mockResolvedValue({ dateFormat1: '%Y-%m-%d' });
      mockLegacyDataDb.query.mockRejectedValue(new Error('connection lost'));

      const result = await service.getUserConnectivityHistory(
        TEST_USER_ID,
        '2026-03-01',
        '2026-03-11',
        ConnectivityFilter.ALL,
      );

      expect(result.body).toEqual([]);
      expect(result.header).toHaveLength(6);
    });

    it('should use ? placeholders for dates and pass them in queryParams array', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValues.mockResolvedValue({ dateFormat1: '%Y-%m-%d %H:%i:%s' });
      mockLegacyDataDb.query.mockResolvedValue([]);

      await service.getUserConnectivityHistory(TEST_USER_ID, '2026-03-01', '2026-03-11', ConnectivityFilter.ALL);

      const [sqlArg, paramsArg] = mockLegacyDataDb.query.mock.calls[0];
      // SQL must use ? placeholders, not string-interpolated dates
      expect(sqlArg).not.toContain('2026-03-11 10:00:00');
      expect(sqlArg).toContain('?');
      // Params: [fromDate, toDate] per table, then userId at the end
      expect(paramsArg).toEqual(['2026-03-11 10:00:00', '2026-03-11 10:00:00', TEST_USER_ID]);
    });

    it('should push two date params per UNION arm when multiple tables exist', async () => {
      const secondTable = {
        id: 'tbl-2',
        tableName: 'V3_air_connectivity_test',
        nodeNameColumn: 'node_name',
        statDateNameColumn: 'stat_date',
      };
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable, secondTable]);
      mockSystemConfigService.getConfigValues.mockResolvedValue({ dateFormat1: '%Y-%m-%d %H:%i:%s' });
      mockLegacyDataDb.query.mockResolvedValue([]);

      await service.getUserConnectivityHistory(TEST_USER_ID, '2026-03-01', '2026-03-11', ConnectivityFilter.ALL);

      const [, paramsArg] = mockLegacyDataDb.query.mock.calls[0];
      // 2 tables × 2 date params + 1 userId = 5
      expect(paramsArg).toHaveLength(5);
      expect(paramsArg[paramsArg.length - 1]).toBe(TEST_USER_ID);
    });

    it('should use ConfigService for DB names, not hardcoded strings', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValues.mockResolvedValue({ dateFormat1: '%Y-%m-%d %H:%i:%s' });
      mockLegacyDataDb.query.mockResolvedValue([]);

      await service.getUserConnectivityHistory(TEST_USER_ID, '2026-03-01', '2026-03-11', ConnectivityFilter.ALL);

      expect(mockConfigService.get).toHaveBeenCalledWith('DB_DATA_NAME');
      expect(mockConfigService.get).toHaveBeenCalledWith('DB_CORE_NAME');
      const [sqlArg] = mockLegacyDataDb.query.mock.calls[0];
      expect(sqlArg).toContain('iMonitorData');
      expect(sqlArg).toContain('iMonitorV3_1');
    });

    it('should fall back to default dateFormat when config value contains invalid characters', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      // Simulate a tampered/invalid dateFormat from the DB
      mockSystemConfigService.getConfigValues.mockResolvedValue({ dateFormat1: "%Y'; DROP TABLE core_report; --" });
      mockLegacyDataDb.query.mockResolvedValue([]);

      await service.getUserConnectivityHistory(TEST_USER_ID, '2026-03-01', '2026-03-11', ConnectivityFilter.ALL);

      const [sqlArg] = mockLegacyDataDb.query.mock.calls[0];
      expect(sqlArg).toContain('%Y-%m-%d %H:%i:%s');
      expect(sqlArg).not.toContain('DROP TABLE');
    });
  });

  // ─── exportExcel ─────────────────────────────────────────────────────────

  describe('exportExcel()', () => {
    it('should call exportTabularToExcel and return file path', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValues.mockResolvedValue({ dateFormat1: '%Y-%m-%d' });
      mockLegacyDataDb.query.mockResolvedValue([sampleHistoryRow]);

      const result = await service.exportExcel(TEST_USER_ID, '2026-03-01', '2026-03-11', ConnectivityFilter.ALL);

      expect(mockExportHelper.exportTabularToExcel).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'connectivities_history' })]),
      );
      expect(result).toBe('/tmp/export.xlsx');
    });

    it('should pass sheet with header fields stripped to text/datafield only', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValues.mockResolvedValue({ dateFormat1: '%Y-%m-%d' });
      mockLegacyDataDb.query.mockResolvedValue([sampleHistoryRow]);

      await service.exportExcel(TEST_USER_ID, '2026-03-01', '2026-03-11', ConnectivityFilter.ALL);

      const [[sheets]] = mockExportHelper.exportTabularToExcel.mock.calls;
      const sheet = sheets[0];
      expect(sheet.header[0]).toEqual({ text: 'Date', datafield: 'stat_date' });
      expect(sheet.header[0]).not.toHaveProperty('width');
    });
  });

  // ─── getFailedNodes ───────────────────────────────────────────────────────

  describe('getFailedNodes()', () => {
    it('should return empty string when no connectivity tables exist', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);

      const result = await service.getFailedNodes(TEST_USER_ID);

      expect(result).toBe('');
      expect(mockLegacyDataDb.multiQuery).not.toHaveBeenCalled();
    });

    it('should return empty string when multiQuery returns no failed rows', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValue.mockResolvedValue('3');
      mockLegacyDataDb.multiQuery.mockResolvedValue([[], []]);

      const result = await service.getFailedNodes(TEST_USER_ID);

      expect(result).toBe('');
    });

    it('should return formatted message with node names when failed nodes exist', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValue.mockResolvedValue('3');
      mockLegacyDataDb.multiQuery.mockResolvedValue([[], [{ node_name: '"sdp-01"' }, { node_name: '"sdp-02"' }]]);

      const result = await service.getFailedNodes(TEST_USER_ID);

      expect(result).toContain('Connectivity error on 2 node(s)');
      expect(result).toContain('"sdp-01"');
      expect(result).toContain('"sdp-02"');
    });

    it('should return empty string and not throw when multiQuery fails', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValue.mockResolvedValue('3');
      mockLegacyDataDb.multiQuery.mockRejectedValue(new Error('timeout'));

      const result = await service.getFailedNodes(TEST_USER_ID);

      expect(result).toBe('');
    });

    it('should include WHERE status <> OK filter in failed nodes query', async () => {
      const qb = modulesTablesRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([sampleConnectivityTable]);
      mockSystemConfigService.getConfigValue.mockResolvedValue('3');
      mockLegacyDataDb.multiQuery.mockResolvedValue([[], []]);

      await service.getFailedNodes(TEST_USER_ID);

      const [sqlArg] = mockLegacyDataDb.multiQuery.mock.calls[0];
      expect(sqlArg).toContain("status <> 'OK'");
    });
  });
});
