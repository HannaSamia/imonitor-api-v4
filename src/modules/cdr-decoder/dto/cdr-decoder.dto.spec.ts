import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DecodeBodyDto } from './cdr-decoder.dto';

describe('DecodeBodyDto', () => {
  it('should validate a valid DTO', async () => {
    const dto = plainToInstance(DecodeBodyDto, { name: 'My CDR Decode Job' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when name is missing', async () => {
    const dto = plainToInstance(DecodeBodyDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail when name is empty string', async () => {
    const dto = plainToInstance(DecodeBodyDto, { name: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail when name is not a string', async () => {
    const dto = plainToInstance(DecodeBodyDto, { name: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
