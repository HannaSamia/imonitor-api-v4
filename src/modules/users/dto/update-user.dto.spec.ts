import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateUserDto, EditSelfDto } from './update-user.dto';

// ─── UpdateUserDto ────────────────────────────────────────────────────────────

describe('UpdateUserDto validation', () => {
  const VALID: Partial<UpdateUserDto> = {
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phoneNumber: '1234567890',
    allowMultipleSessions: false,
    keepLogin: true,
  };

  function toDto(partial: Partial<UpdateUserDto>): UpdateUserDto {
    return plainToInstance(UpdateUserDto, partial);
  }

  it('should pass with valid data', async () => {
    const errors = await validate(toDto(VALID));
    expect(errors).toHaveLength(0);
  });

  it('should fail when id is empty', async () => {
    const errors = await validate(toDto({ ...VALID, id: '' }));
    expect(errors.some((e) => e.property === 'id')).toBe(true);
  });

  it('should fail with firstName shorter than 2 chars', async () => {
    const errors = await validate(toDto({ ...VALID, firstName: 'J' }));
    expect(errors.some((e) => e.property === 'firstName')).toBe(true);
  });

  it('should fail with invalid email', async () => {
    const errors = await validate(toDto({ ...VALID, email: 'bad-email' }));
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('should fail when booleans are not boolean', async () => {
    const errors = await validate(toDto({ ...VALID, allowMultipleSessions: 'true' as any }));
    expect(errors.some((e) => e.property === 'allowMultipleSessions')).toBe(true);
  });

  it('should fail when required fields are missing', async () => {
    const errors = await validate(toDto({}));
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── EditSelfDto ──────────────────────────────────────────────────────────────

describe('EditSelfDto validation', () => {
  const VALID: Partial<EditSelfDto> = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phoneNumber: '1234567890',
  };

  function toDto(partial: Partial<EditSelfDto>): EditSelfDto {
    return plainToInstance(EditSelfDto, partial);
  }

  it('should pass with valid data', async () => {
    const errors = await validate(toDto(VALID));
    expect(errors).toHaveLength(0);
  });

  it('should fail when firstName has special chars', async () => {
    const errors = await validate(toDto({ ...VALID, firstName: 'John!' }));
    expect(errors.some((e) => e.property === 'firstName')).toBe(true);
  });

  it('should fail when firstName is too short', async () => {
    const errors = await validate(toDto({ ...VALID, firstName: 'Jo' }));
    expect(errors.some((e) => e.property === 'firstName')).toBe(true);
  });

  it('should fail when lastName has special chars', async () => {
    const errors = await validate(toDto({ ...VALID, lastName: 'Doe@' }));
    expect(errors.some((e) => e.property === 'lastName')).toBe(true);
  });

  it('should fail with invalid email', async () => {
    const errors = await validate(toDto({ ...VALID, email: 'not-email' }));
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('should fail when required fields are missing', async () => {
    const errors = await validate(toDto({}));
    const props = errors.map((e) => e.property);
    expect(props).toContain('firstName');
    expect(props).toContain('email');
    expect(props).toContain('phoneNumber');
  });
});
