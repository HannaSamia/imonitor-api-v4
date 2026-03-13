import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddBulkProcessDto, BulkListQueryDto, ScheduleBulkProcessDto, UpdateBulkProcessDto } from './bulk-processing.dto';
import { BulkMethodsType } from '../enums/bulk-process.enum';

describe('AddBulkProcessDto', () => {
  it('should validate a valid DTO', async () => {
    const dto = plainToInstance(AddBulkProcessDto, { name: 'My Job', methodId: 1 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when name is missing', async () => {
    const dto = plainToInstance(AddBulkProcessDto, { methodId: 1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail when methodId is missing', async () => {
    const dto = plainToInstance(AddBulkProcessDto, { name: 'My Job' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'methodId')).toBe(true);
  });
});

describe('ScheduleBulkProcessDto', () => {
  it('should validate a valid DTO', async () => {
    const dto = plainToInstance(ScheduleBulkProcessDto, { name: 'Job', methodId: 1, date: '2026-03-12 10:00:00' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when date is missing', async () => {
    const dto = plainToInstance(ScheduleBulkProcessDto, { name: 'Job', methodId: 1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'date')).toBe(true);
  });

  it('should fail when name is missing', async () => {
    const dto = plainToInstance(ScheduleBulkProcessDto, { methodId: 1, date: '2026-03-12 10:00:00' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});

describe('UpdateBulkProcessDto', () => {
  it('should validate a valid DTO', async () => {
    const dto = plainToInstance(UpdateBulkProcessDto, { id: 'uuid-123', name: 'Updated Job' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should validate with optional fields', async () => {
    const dto = plainToInstance(UpdateBulkProcessDto, { id: 'uuid-123', name: 'Job', method: 'GetBalanceAndDate', date: '2026-03-15 10:00:00' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when id is missing', async () => {
    const dto = plainToInstance(UpdateBulkProcessDto, { name: 'Job' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'id')).toBe(true);
  });

  it('should fail when name is missing', async () => {
    const dto = plainToInstance(UpdateBulkProcessDto, { id: 'uuid-123' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});

describe('BulkListQueryDto', () => {
  it('should validate AIR type', async () => {
    const dto = plainToInstance(BulkListQueryDto, { type: 'AIR' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should validate EDA type', async () => {
    const dto = plainToInstance(BulkListQueryDto, { type: 'EDA' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when type is invalid', async () => {
    const dto = plainToInstance(BulkListQueryDto, { type: 'INVALID' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('should fail when type is missing', async () => {
    const dto = plainToInstance(BulkListQueryDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });
});
