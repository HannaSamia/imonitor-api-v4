import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants';

function createMockContext(headers: Record<string, string> = {}): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let systemConfigService: any;

  beforeEach(async () => {
    systemConfigService = {
      getConfigValue: jest.fn().mockResolvedValue('valid-api-key-12345'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeyGuard, { provide: SystemConfigService, useValue: systemConfigService }],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
  });

  it('should allow request with valid API key', async () => {
    const ctx = createMockContext({ access_token: 'valid-api-key-12345' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should reject request with no access_token header', async () => {
    const ctx = createMockContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(new UnauthorizedException(ErrorMessages.UNAUTHORIZED));
  });

  it('should reject request with wrong API key', async () => {
    const ctx = createMockContext({ access_token: 'wrong-key' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(new UnauthorizedException(ErrorMessages.API_KEY_INVALID));
  });

  it('should reject when stored key is null (not configured)', async () => {
    systemConfigService.getConfigValue.mockResolvedValue(null);
    const ctx = createMockContext({ access_token: 'some-key' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(new UnauthorizedException(ErrorMessages.API_KEY_INVALID));
  });

  it('should reject when systemConfigService throws', async () => {
    systemConfigService.getConfigValue.mockRejectedValue(new Error('DB down'));
    const ctx = createMockContext({ access_token: 'some-key' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(new UnauthorizedException(ErrorMessages.API_KEY_INVALID));
  });
});
