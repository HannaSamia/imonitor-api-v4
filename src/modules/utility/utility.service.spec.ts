import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UtilityService } from './utility.service';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { LegacyEtlDbService } from '../../database/legacy-etl-db/legacy-etl-db.service';
import { EncryptionHelperService } from '../../shared/services/encryption-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';

const MOCK_FLOW_CONFIG = {
  nodeType: 'SDP',
  tableName: 'V3_sdp_stats',
  groupByDaily: 1,
  groupByHourly: 1,
  GroupByOperator: 'SUM',
};

const MOCK_COLUMNS = [
  { name: 'stat_date', type: 'datetime', key: '' },
  { name: 'sdp_name', type: 'varchar(50)', key: '' },
  { name: 'volume', type: 'int(11)', key: '' },
];

describe('UtilityService', () => {
  let service: UtilityService;
  let legacyDataDb: jest.Mocked<LegacyDataDbService>;
  let legacyEtlDb: jest.Mocked<LegacyEtlDbService>;
  let encryptionHelper: jest.Mocked<EncryptionHelperService>;

  beforeEach(async () => {
    legacyDataDb = {
      query: jest.fn(),
      affectedQuery: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    } as any;

    legacyEtlDb = {
      query: jest.fn(),
      affectedQuery: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    } as any;

    encryptionHelper = {
      getEncryptionKey: jest.fn().mockResolvedValue('test-aes-key'),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UtilityService,
        { provide: LegacyDataDbService, useValue: legacyDataDb },
        { provide: LegacyEtlDbService, useValue: legacyEtlDb },
        { provide: EncryptionHelperService, useValue: encryptionHelper },
      ],
    }).compile();

    service = module.get<UtilityService>(UtilityService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────── ping ───────────────────────

  describe('ping', () => {
    it('should return "pong"', () => {
      expect(service.ping()).toBe('pong');
    });
  });

  // ─────────────────────── consolidate ───────────────────────

  describe('consolidate', () => {
    it('should skip tables with no flow config and not throw', async () => {
      legacyEtlDb.query.mockResolvedValue([]);

      await expect(service.consolidate(['V3_missing_stats'], '2026-01-15')).resolves.not.toThrow();
    });

    it('should call processConsolidate for hourly when groupByHourly=1', async () => {
      legacyEtlDb.query
        .mockResolvedValueOnce([{ ...MOCK_FLOW_CONFIG, groupByDaily: 0, groupByHourly: 1 }])
        .mockResolvedValueOnce([]); // checkAndUpdateResult — no existing row

      legacyDataDb.query
        .mockResolvedValueOnce([]) // getEncryptionSet columns
        .mockResolvedValueOnce(MOCK_COLUMNS) // processConsolidate columns
        .mockResolvedValueOnce([{ confVal: '/tmp/secure' }]); // secureFilePath

      legacyEtlDb.affectedQuery.mockResolvedValue({ affectedRows: 1 } as any);

      await service.consolidate(['V3_sdp_stats'], '2026-01-15');

      expect(legacyDataDb.affectedQuery).toHaveBeenCalledTimes(2); // OUTFILE + LOAD DATA
    });

    it('should call processConsolidate for both hourly and daily when both flags set', async () => {
      legacyEtlDb.query.mockResolvedValueOnce([MOCK_FLOW_CONFIG]).mockResolvedValueOnce([]); // checkAndUpdateResult

      legacyDataDb.query
        .mockResolvedValueOnce([]) // getEncryptionSet
        .mockResolvedValueOnce(MOCK_COLUMNS) // hourly processConsolidate columns
        .mockResolvedValueOnce([{ confVal: '/tmp' }]) // hourly secureFilePath
        .mockResolvedValueOnce(MOCK_COLUMNS) // daily processConsolidate columns
        .mockResolvedValueOnce([{ confVal: '/tmp' }]); // daily secureFilePath

      await service.consolidate(['V3_sdp_stats'], '2026-01-15');

      // 2 OUTFILE + 2 LOAD DATA = 4 affectedQuery calls
      expect(legacyDataDb.affectedQuery).toHaveBeenCalledTimes(4);
    });

    it('should throw BadRequestException when consolidation errors', async () => {
      legacyEtlDb.query.mockRejectedValue(new Error('DB error'));

      await expect(service.consolidate(['V3_sdp_stats'], '2026-01-15')).rejects.toThrow(BadRequestException);
      await expect(service.consolidate(['V3_sdp_stats'], '2026-01-15')).rejects.toThrow(
        ErrorMessages.CONSOLIDATION_FAILED,
      );
    });

    it('should call checkAndUpdateResult with table and date', async () => {
      legacyEtlDb.query
        .mockResolvedValueOnce([{ ...MOCK_FLOW_CONFIG, groupByHourly: 0, groupByDaily: 0 }])
        .mockResolvedValueOnce([]); // checkAndUpdateResult — no existing row

      legacyDataDb.query.mockResolvedValueOnce([]); // getEncryptionSet

      await service.consolidate(['V3_sdp_stats'], '2026-01-15');

      // Should insert into V3_consolidation_check
      expect(legacyEtlDb.affectedQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO V3_consolidation_check'),
        ['V3_sdp_stats', '2026-01-15'],
      );
    });

    it('should handle multiple tables in sequence', async () => {
      legacyEtlDb.query
        .mockResolvedValueOnce([{ ...MOCK_FLOW_CONFIG, groupByHourly: 0, groupByDaily: 0 }])
        .mockResolvedValueOnce([]) // checkAndUpdateResult table1
        .mockResolvedValueOnce([{ ...MOCK_FLOW_CONFIG, groupByHourly: 0, groupByDaily: 0 }])
        .mockResolvedValueOnce([]); // checkAndUpdateResult table2

      legacyDataDb.query.mockResolvedValue([]); // getEncryptionSet for both

      await service.consolidate(['V3_sdp_stats', 'V3_air_stats'], '2026-01-15');

      expect(legacyEtlDb.query).toHaveBeenCalledTimes(4);
    });

    it('should throw CONSOLIDATION_UPDATE_FAILED when update returns 0 affected rows', async () => {
      legacyEtlDb.query
        .mockResolvedValueOnce([{ ...MOCK_FLOW_CONFIG, groupByHourly: 0, groupByDaily: 0 }])
        .mockResolvedValueOnce([{ id: 'existing' }]); // existing row

      legacyDataDb.query.mockResolvedValue([]); // getEncryptionSet

      legacyEtlDb.affectedQuery.mockResolvedValue({ affectedRows: 0 } as any);

      await expect(service.consolidate(['V3_sdp_stats'], '2026-01-15')).rejects.toThrow(BadRequestException);
    });

    it('should use secureFilePath from core_sys_config in OUTFILE query', async () => {
      legacyEtlDb.query
        .mockResolvedValueOnce([{ ...MOCK_FLOW_CONFIG, groupByDaily: 0, groupByHourly: 1 }])
        .mockResolvedValueOnce([]);

      legacyDataDb.query
        .mockResolvedValueOnce([]) // getEncryptionSet
        .mockResolvedValueOnce(MOCK_COLUMNS) // columns
        .mockResolvedValueOnce([{ confVal: '/custom/secure/path' }]); // secureFilePath

      await service.consolidate(['V3_sdp_stats'], '2026-01-15');

      // The OUTFILE path should contain the custom secure path
      expect(legacyDataDb.affectedQuery).toHaveBeenCalledWith(expect.stringContaining('/custom/secure/path'), []);
    });
  });
});
