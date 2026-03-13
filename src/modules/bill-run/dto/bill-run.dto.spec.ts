import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddBillRunDto } from './bill-run.dto';

describe('AddBillRunDto', () => {
  it('should validate a valid DTO', async () => {
    const dto = plainToInstance(AddBillRunDto, { name: 'March 2026 Bill Run' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when name is missing', async () => {
    const dto = plainToInstance(AddBillRunDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail when name is empty string', async () => {
    const dto = plainToInstance(AddBillRunDto, { name: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
