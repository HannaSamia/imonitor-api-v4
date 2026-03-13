import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { ErrorMessages } from '../../shared/constants/error-messages';

const FROM_DATE = '2026-01-01 00:00:00';
const TO_DATE = '2026-01-31 23:59:59';
const OPERATIONS = ['LOGIN', 'LOGOUT'];

const MOCK_TABLE_RECORD = {
  id: 'table-uuid-001',
  tableName: 'V3_audit_logs_stats',
};

const MOCK_FIELDS = [
  { id: 'f1', tId: 'table-uuid-001', columnName: 'stat_date', columnDisplayName: 'Stat Date', type: 'datetime' },
  { id: 'f2', tId: 'table-uuid-001', columnName: 'sdp_name', columnDisplayName: 'SDP Name', type: 'alpha' },
  { id: 'f3', tId: 'table-uuid-001', columnName: 'id1', columnDisplayName: 'ID1', type: 'alpha' },
  { id: 'f4', tId: 'table-uuid-001', columnName: 'id2', columnDisplayName: 'ID2', type: 'alpha' },
];

describe('AuditLogService', () => {
  let service: AuditLogService;
  let coreModulesTablesRepo: any;
  let coreTablesFieldRepo: any;
  let legacyDataDb: jest.Mocked<LegacyDataDbService>;

  beforeEach(async () => {
    coreModulesTablesRepo = {
      findOne: jest.fn(),
    };

    coreTablesFieldRepo = {
      find: jest.fn(),
    };

    legacyDataDb = {
      query: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(CoreModulesTables), useValue: coreModulesTablesRepo },
        { provide: getRepositoryToken(CoreTablesField), useValue: coreTablesFieldRepo },
        { provide: LegacyDataDbService, useValue: legacyDataDb },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────── getAuditLogsTable ───────────────────────

  describe('getAuditLogsTable', () => {
    it('should return header and body with skipped id1/id2 columns and extra r_id column appended', async () => {
      coreModulesTablesRepo.findOne.mockResolvedValue(MOCK_TABLE_RECORD);
      coreTablesFieldRepo.find.mockResolvedValue(MOCK_FIELDS);
      legacyDataDb.query.mockResolvedValue([
        {
          stat_date: '2026-01-01 00:01:00',
          sdp_name: 'SDP1',
          user: 'admin',
          origin: 'web',
          operation: 'LOGIN',
          r_id: 'abc123',
        },
      ]);

      const result = await service.getAuditLogsTable(FROM_DATE, TO_DATE, OPERATIONS);

      // id1 and id2 should be filtered out
      const columnNames = result.header.map((h) => h.columnName);
      expect(columnNames).not.toContain('id1');
      expect(columnNames).not.toContain('id2');

      // r_id extra column should be last
      const lastHeader = result.header[result.header.length - 1];
      expect(lastHeader.columnName).toBe('r_id');
      expect(lastHeader.hidden).toBe(true);
      expect(lastHeader.aggregates).toContain('count');

      expect(result.body).toHaveLength(1);
      expect(result.body[0]).toMatchObject({ operation: 'LOGIN', r_id: 'abc123' });
    });

    it('should return empty header columns (only r_id) when no table record found', async () => {
      coreModulesTablesRepo.findOne.mockResolvedValue(null);
      legacyDataDb.query.mockResolvedValue([]);

      const result = await service.getAuditLogsTable(FROM_DATE, TO_DATE, OPERATIONS);

      expect(result.header).toHaveLength(1);
      expect(result.header[0].columnName).toBe('r_id');
      expect(result.body).toHaveLength(0);
    });

    it('should pass fromDate, toDate and operations as query parameters', async () => {
      coreModulesTablesRepo.findOne.mockResolvedValue(MOCK_TABLE_RECORD);
      coreTablesFieldRepo.find.mockResolvedValue([]);
      legacyDataDb.query.mockResolvedValue([]);

      await service.getAuditLogsTable(FROM_DATE, TO_DATE, OPERATIONS);

      expect(legacyDataDb.query).toHaveBeenCalledWith(expect.stringContaining('V3_audit_logs_stats'), [
        FROM_DATE,
        TO_DATE,
        ...OPERATIONS,
      ]);
    });

    it('should return empty body when no rows match', async () => {
      coreModulesTablesRepo.findOne.mockResolvedValue(MOCK_TABLE_RECORD);
      coreTablesFieldRepo.find.mockResolvedValue([]);
      legacyDataDb.query.mockResolvedValue([]);

      const result = await service.getAuditLogsTable(FROM_DATE, TO_DATE, OPERATIONS);

      expect(result.body).toEqual([]);
    });
  });

  // ─────────────────────── getAuditDetails ───────────────────────

  describe('getAuditDetails', () => {
    it('should call query with request column when request=true', async () => {
      legacyDataDb.query.mockResolvedValue([{ auditValue: 'some-xml' }]);

      await service.getAuditDetails('abc123', true);

      expect(legacyDataDb.query).toHaveBeenCalledWith(expect.stringContaining('request'), ['abc123']);
    });

    it('should call query with response column when request=false', async () => {
      legacyDataDb.query.mockResolvedValue([{ auditValue: 'some-xml' }]);

      await service.getAuditDetails('abc123', false);

      expect(legacyDataDb.query).toHaveBeenCalledWith(expect.stringContaining('response'), ['abc123']);
    });

    it('should return cleaned string (quotes removed via JSON.stringify)', async () => {
      legacyDataDb.query.mockResolvedValue([{ auditValue: 'value' }]);

      const result = await service.getAuditDetails('abc123', true);

      expect(result).not.toContain('"');
    });

    it('should return empty string when no row found', async () => {
      legacyDataDb.query.mockResolvedValue([]);

      const result = await service.getAuditDetails('non-existent', true);

      // JSON.stringify('') → '""', remove quotes → ''
      expect(result).toBe('');
    });
  });

  // ─────────────────────── getAuditOperations ───────────────────────

  describe('getAuditOperations', () => {
    it('should return list of operation strings', async () => {
      legacyDataDb.query.mockResolvedValue([{ operation: 'LOGIN' }, { operation: 'LOGOUT' }]);

      const result = await service.getAuditOperations();

      expect(result).toEqual(['LOGIN', 'LOGOUT']);
    });

    it('should throw BadRequestException when no operations found', async () => {
      legacyDataDb.query.mockResolvedValue([]);

      await expect(service.getAuditOperations()).rejects.toThrow(BadRequestException);
      await expect(service.getAuditOperations()).rejects.toThrow(ErrorMessages.NOT_FOUND);
    });

    it('should throw BadRequestException when query returns null', async () => {
      legacyDataDb.query.mockResolvedValue(null as any);

      await expect(service.getAuditOperations()).rejects.toThrow(BadRequestException);
    });

    it('should query the correct iMonitorData table', async () => {
      legacyDataDb.query.mockResolvedValue([{ operation: 'LOGIN' }]);

      await service.getAuditOperations();

      expect(legacyDataDb.query).toHaveBeenCalledWith(expect.stringContaining('V3_audit_logs_operations'));
    });
  });
});
