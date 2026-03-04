import { dbDateAdd, dbDateFormat, dbIfNull, dbRound, dbTruncate, dbDecrypt, returnHashedString } from './sql-helpers';

describe('SQL Helpers', () => {
  describe('dbDateAdd', () => {
    it('should generate DATE_ADD expression', () => {
      expect(dbDateAdd('stat_date', '1', 'HOUR')).toBe('DATE_ADD(stat_date, INTERVAL 1 HOUR)');
    });

    it('should handle negative intervals', () => {
      expect(dbDateAdd('col', '-7', 'DAY')).toBe('DATE_ADD(col, INTERVAL -7 DAY)');
    });
  });

  describe('dbDateFormat', () => {
    it('should generate date_format expression', () => {
      expect(dbDateFormat('stat_date', "'%Y-%m-%d'")).toBe("date_format(stat_date, '%Y-%m-%d')");
    });
  });

  describe('dbIfNull', () => {
    it('should generate ifnull expression', () => {
      expect(dbIfNull('col', '0')).toBe('ifnull(col, 0)');
    });
  });

  describe('dbRound', () => {
    it('should generate round expression', () => {
      expect(dbRound('col', '2')).toBe('round(col,2)');
    });
  });

  describe('dbTruncate', () => {
    it('should generate truncate expression', () => {
      expect(dbTruncate('col', '3')).toBe('truncate(col,3)');
    });
  });

  describe('dbDecrypt', () => {
    it('should generate aes_decrypt expression', () => {
      expect(dbDecrypt('gui_pass', "'key123'")).toBe("aes_decrypt(gui_pass, 'key123')");
    });
  });

  describe('returnHashedString', () => {
    it('should generate sha2 expression', () => {
      expect(returnHashedString("'columnName'")).toBe("sha2('columnName',256)");
    });
  });
});
