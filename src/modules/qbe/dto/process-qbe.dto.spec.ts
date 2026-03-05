import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ProcessQbeDto } from './process-qbe.dto';

function toDto(partial: Partial<ProcessQbeDto>): ProcessQbeDto {
  return plainToInstance(ProcessQbeDto, partial);
}

const VALID_DATA = {
  timeFilter: 'hourly',
  fromDate: '2026-01-01T00:00:00',
  toDate: '2026-01-02T00:00:00',
  sql: 'SELECT * FROM table1 WHERE stat_date >= _fromDate_ AND stat_date <= _toDate_',
  isShared: false,
};

describe('ProcessQbeDto validation', () => {
  it('should pass with valid data', async () => {
    const errors = await validate(toDto(VALID_DATA));
    expect(errors).toHaveLength(0);
  });

  it('should fail when timeFilter is empty', async () => {
    const errors = await validate(toDto({ ...VALID_DATA, timeFilter: '' }));
    expect(errors.some((e) => e.property === 'timeFilter')).toBe(true);
  });

  it('should fail when timeFilter is missing', async () => {
    const { timeFilter: _, ...noTimeFilter } = VALID_DATA;
    const errors = await validate(toDto(noTimeFilter));
    expect(errors.some((e) => e.property === 'timeFilter')).toBe(true);
  });

  it('should fail when sql is empty', async () => {
    const errors = await validate(toDto({ ...VALID_DATA, sql: '' }));
    expect(errors.some((e) => e.property === 'sql')).toBe(true);
  });

  it('should fail when sql is missing', async () => {
    const { sql: _, ...noSql } = VALID_DATA;
    const errors = await validate(toDto(noSql));
    expect(errors.some((e) => e.property === 'sql')).toBe(true);
  });

  it('should fail when isShared is not a boolean', async () => {
    const errors = await validate(toDto({ ...VALID_DATA, isShared: 'yes' as any }));
    expect(errors.some((e) => e.property === 'isShared')).toBe(true);
  });

  it('should fail when fromDate is empty', async () => {
    const errors = await validate(toDto({ ...VALID_DATA, fromDate: '' }));
    expect(errors.some((e) => e.property === 'fromDate')).toBe(true);
  });

  it('should fail when toDate is empty', async () => {
    const errors = await validate(toDto({ ...VALID_DATA, toDate: '' }));
    expect(errors.some((e) => e.property === 'toDate')).toBe(true);
  });
});
