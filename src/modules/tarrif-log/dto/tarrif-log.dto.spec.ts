import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TarrifLogDto } from './tarrif-log.dto';

describe('TarrifLogDto', () => {
  it('should validate a valid DTO', async () => {
    const dto = plainToInstance(TarrifLogDto, { tarrifId: 123, date: '2026-03-01', compareDate: '2026-02-01' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when tarrifId is missing', async () => {
    const dto = plainToInstance(TarrifLogDto, { date: '2026-03-01', compareDate: '2026-02-01' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'tarrifId')).toBe(true);
  });

  it('should fail when date is missing', async () => {
    const dto = plainToInstance(TarrifLogDto, { tarrifId: 123, compareDate: '2026-02-01' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'date')).toBe(true);
  });

  it('should fail when compareDate is missing', async () => {
    const dto = plainToInstance(TarrifLogDto, { tarrifId: 123, date: '2026-03-01' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'compareDate')).toBe(true);
  });

  it('should fail when all fields are missing', async () => {
    const dto = plainToInstance(TarrifLogDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
