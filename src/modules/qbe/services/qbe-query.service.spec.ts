import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { QbeQueryService, QbeErrorMessages } from './qbe-query.service';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { SystemConfigService } from '../../../shared/services/system-config.service';

// ─── Mocks ───────────────────────────────────────────────────────────────

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'DB_NAME') return 'iMonitorV3_1';
    if (key === 'DB_DATA_NAME') return 'iMonitorData';
    return null;
  }),
};

const mockDataSource = {
  query: jest.fn(),
};

const mockLegacyDataDb = {
  nativeQuery: jest.fn(),
  query: jest.fn(),
};

const mockDateHelper = {
  formatDate: jest.fn().mockReturnValue('2026-01-01 00:00:00'),
  parseISO: jest.fn().mockImplementation((d) => new Date(d)),
};

const mockSystemConfig = {
  getConfigValue: jest.fn().mockResolvedValue('1000000'),
};

// ─── Test Suite ──────────────────────────────────────────────────────────

describe('QbeQueryService', () => {
  let service: QbeQueryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QbeQueryService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: LegacyDataDbService, useValue: mockLegacyDataDb },
        { provide: DateHelperService, useValue: mockDateHelper },
        { provide: SystemConfigService, useValue: mockSystemConfig },
      ],
    }).compile();

    service = module.get<QbeQueryService>(QbeQueryService);
  });

  // ─── isQuerySafe ─────────────────────────────────────────────────────

  describe('isQuerySafe', () => {
    it('should return true for a simple SELECT', () => {
      expect(service.isQuerySafe('SELECT * FROM table1')).toBe(true);
    });

    it('should return true for SELECT with leading whitespace', () => {
      expect(service.isQuerySafe('  SELECT * FROM table1')).toBe(true);
    });

    it('should return true for case-insensitive SELECT', () => {
      expect(service.isQuerySafe('select * from table1')).toBe(true);
      expect(service.isQuerySafe('Select * FROM table1')).toBe(true);
    });

    it('should return false for INSERT', () => {
      expect(service.isQuerySafe('INSERT INTO table1 VALUES (1)')).toBe(false);
    });

    it('should return false for UPDATE', () => {
      expect(service.isQuerySafe('UPDATE table1 SET col=1')).toBe(false);
    });

    it('should return false for DELETE', () => {
      expect(service.isQuerySafe('DELETE FROM table1')).toBe(false);
    });

    it('should return false for DROP', () => {
      expect(service.isQuerySafe('DROP TABLE table1')).toBe(false);
    });

    it('should return false for ALTER', () => {
      expect(service.isQuerySafe('ALTER TABLE table1 ADD col INT')).toBe(false);
    });

    it('should return false for SELECT with embedded INSERT', () => {
      expect(service.isQuerySafe("SELECT * FROM t; INSERT INTO t VALUES('x')")).toBe(false);
    });

    it('should return false for SELECT with embedded DELETE', () => {
      expect(service.isQuerySafe('SELECT * FROM t WHERE DELETE FROM t')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(service.isQuerySafe('')).toBe(false);
    });

    it('should return false for non-SELECT statement', () => {
      expect(service.isQuerySafe('SHOW TABLES')).toBe(false);
    });
  });

  // ─── isDateSafe ──────────────────────────────────────────────────────

  describe('isDateSafe', () => {
    it('should pass with both date placeholders', () => {
      expect(() => service.isDateSafe('SELECT * WHERE date >= _fromDate_ AND date <= _toDate_')).not.toThrow();
    });

    it('should pass with quoted date placeholders', () => {
      expect(() => service.isDateSafe("SELECT * WHERE date >= '_fromDate_' AND date <= '_toDate_'")).not.toThrow();
    });

    it('should throw when both placeholders are missing', () => {
      expect(() => service.isDateSafe('SELECT * FROM table1')).toThrow(BadRequestException);
      expect(() => service.isDateSafe('SELECT * FROM table1')).toThrow(QbeErrorMessages.DATES_KEYS_MISSING);
    });

    it('should throw when only _fromDate_ is missing', () => {
      expect(() => service.isDateSafe('SELECT * WHERE date <= _toDate_')).toThrow(
        QbeErrorMessages.DATE_FROM_KEY_MISSING,
      );
    });

    it('should throw when only _toDate_ is missing', () => {
      expect(() => service.isDateSafe('SELECT * WHERE date >= _fromDate_')).toThrow(
        QbeErrorMessages.DATE_TO_KEY_MISSING,
      );
    });
  });

  // ─── checkQbeSafety ──────────────────────────────────────────────────

  describe('checkQbeSafety', () => {
    const validSql = 'SELECT * FROM table1 WHERE date >= _fromDate_ AND date <= _toDate_';

    it('should pass for a valid QBE query', () => {
      expect(() => service.checkQbeSafety(validSql)).not.toThrow();
    });

    it('should throw for empty SQL', () => {
      expect(() => service.checkQbeSafety('')).toThrow(QbeErrorMessages.SQL_EMPTY);
    });

    it('should throw for unsafe SQL', () => {
      expect(() => service.checkQbeSafety('INSERT INTO t VALUES(1); -- _fromDate_ _toDate_')).toThrow(
        QbeErrorMessages.UNSAFE_QUERY,
      );
    });

    it('should throw for missing date placeholders on safe SQL', () => {
      expect(() => service.checkQbeSafety('SELECT * FROM table1')).toThrow(QbeErrorMessages.DATES_KEYS_MISSING);
    });
  });
});
