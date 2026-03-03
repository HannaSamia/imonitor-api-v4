import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUserDto } from './create-user.dto';

function toDto(partial: Partial<CreateUserDto>): CreateUserDto {
  return plainToInstance(CreateUserDto, partial);
}

const VALID_INPUT: Partial<CreateUserDto> = {
  firstName: 'John',
  lastName: 'Doe',
  userName: 'johndoe',
  email: 'john@example.com',
  password: 'securePass1',
  phoneNumber: '1234567890',
  allowMultipleSessions: true,
  keepLogin: false,
};

describe('CreateUserDto validation', () => {
  it('should pass with valid data', async () => {
    const errors = await validate(toDto(VALID_INPUT));
    expect(errors).toHaveLength(0);
  });

  // ─── firstName ──────────────────────────────────────────────────────

  describe('firstName', () => {
    it('should fail when empty', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, firstName: '' }));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('firstName');
    });

    it('should fail when shorter than 3 chars', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, firstName: 'Ab' }));
      expect(errors.some((e) => e.property === 'firstName')).toBe(true);
    });

    it('should fail with non-alphanumeric chars', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, firstName: 'Jo hn' }));
      expect(errors.some((e) => e.property === 'firstName')).toBe(true);
    });
  });

  // ─── lastName ───────────────────────────────────────────────────────

  describe('lastName', () => {
    it('should fail when empty', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, lastName: '' }));
      expect(errors.some((e) => e.property === 'lastName')).toBe(true);
    });

    it('should fail with special chars', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, lastName: 'Doe!' }));
      expect(errors.some((e) => e.property === 'lastName')).toBe(true);
    });
  });

  // ─── userName ───────────────────────────────────────────────────────

  describe('userName', () => {
    it('should fail when shorter than 5 chars', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, userName: 'abc' }));
      expect(errors.some((e) => e.property === 'userName')).toBe(true);
    });

    it('should fail when empty', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, userName: '' }));
      expect(errors.some((e) => e.property === 'userName')).toBe(true);
    });
  });

  // ─── email ──────────────────────────────────────────────────────────

  describe('email', () => {
    it('should fail with invalid email', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, email: 'not-an-email' }));
      expect(errors.some((e) => e.property === 'email')).toBe(true);
    });

    it('should fail when empty', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, email: '' }));
      expect(errors.some((e) => e.property === 'email')).toBe(true);
    });
  });

  // ─── password ───────────────────────────────────────────────────────

  describe('password', () => {
    it('should fail when shorter than 6 chars', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, password: '12345' }));
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });

    it('should fail when longer than 30 chars', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, password: 'a'.repeat(31) }));
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });

    it('should fail when empty', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, password: '' }));
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });
  });

  // ─── booleans ───────────────────────────────────────────────────────

  describe('boolean fields', () => {
    it('should fail when allowMultipleSessions is not boolean', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, allowMultipleSessions: 'yes' as any }));
      expect(errors.some((e) => e.property === 'allowMultipleSessions')).toBe(true);
    });

    it('should fail when keepLogin is not boolean', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, keepLogin: 1 as any }));
      expect(errors.some((e) => e.property === 'keepLogin')).toBe(true);
    });
  });

  // ─── missing fields ────────────────────────────────────────────────

  it('should fail when required fields are missing', async () => {
    const errors = await validate(toDto({}));
    const props = errors.map((e) => e.property);
    expect(props).toContain('firstName');
    expect(props).toContain('lastName');
    expect(props).toContain('userName');
    expect(props).toContain('email');
    expect(props).toContain('password');
    expect(props).toContain('phoneNumber');
  });
});
