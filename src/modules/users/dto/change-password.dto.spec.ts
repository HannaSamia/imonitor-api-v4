import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ChangePasswordDto } from './change-password.dto';

function toDto(partial: Partial<ChangePasswordDto>): ChangePasswordDto {
  return plainToInstance(ChangePasswordDto, partial);
}

const VALID: Partial<ChangePasswordDto> = {
  password: 'newPass123',
  confirmPassword: 'newPass123',
  oldPassword: 'oldPass123',
};

describe('ChangePasswordDto validation', () => {
  it('should pass with valid data', async () => {
    const errors = await validate(toDto(VALID));
    expect(errors).toHaveLength(0);
  });

  describe('password', () => {
    it('should fail when shorter than 6 chars', async () => {
      const errors = await validate(toDto({ ...VALID, password: '12345' }));
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });

    it('should fail when longer than 30 chars', async () => {
      const errors = await validate(toDto({ ...VALID, password: 'x'.repeat(31) }));
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });

    it('should fail when empty', async () => {
      const errors = await validate(toDto({ ...VALID, password: '' }));
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });
  });

  describe('confirmPassword', () => {
    it('should fail when shorter than 6 chars', async () => {
      const errors = await validate(toDto({ ...VALID, confirmPassword: 'abc' }));
      expect(errors.some((e) => e.property === 'confirmPassword')).toBe(true);
    });

    it('should fail when empty', async () => {
      const errors = await validate(toDto({ ...VALID, confirmPassword: '' }));
      expect(errors.some((e) => e.property === 'confirmPassword')).toBe(true);
    });
  });

  describe('oldPassword', () => {
    it('should fail when empty', async () => {
      const errors = await validate(toDto({ ...VALID, oldPassword: '' }));
      expect(errors.some((e) => e.property === 'oldPassword')).toBe(true);
    });

    it('should fail when not a string', async () => {
      const errors = await validate(toDto({ ...VALID, oldPassword: 123 as any }));
      expect(errors.some((e) => e.property === 'oldPassword')).toBe(true);
    });
  });

  it('should fail when all fields are missing', async () => {
    const errors = await validate(toDto({}));
    const props = errors.map((e) => e.property);
    expect(props).toContain('password');
    expect(props).toContain('confirmPassword');
    expect(props).toContain('oldPassword');
  });
});
