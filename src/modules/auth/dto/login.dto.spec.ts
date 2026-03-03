import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';

function toDto(partial: Partial<LoginDto>): LoginDto {
  return plainToInstance(LoginDto, partial);
}

describe('LoginDto validation', () => {
  it('should pass with valid data', async () => {
    const errors = await validate(toDto({ credential: 'testuser', password: 'password123' }));
    expect(errors).toHaveLength(0);
  });

  it('should fail when credential is empty', async () => {
    const errors = await validate(toDto({ credential: '', password: 'password123' }));
    expect(errors.some((e) => e.property === 'credential')).toBe(true);
  });

  it('should fail when credential is missing', async () => {
    const errors = await validate(toDto({ password: 'password123' }));
    expect(errors.some((e) => e.property === 'credential')).toBe(true);
  });

  it('should fail when password is empty', async () => {
    const errors = await validate(toDto({ credential: 'testuser', password: '' }));
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('should fail when password is missing', async () => {
    const errors = await validate(toDto({ credential: 'testuser' }));
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('should fail when both fields are missing', async () => {
    const errors = await validate(toDto({}));
    expect(errors).toHaveLength(2);
  });
});
