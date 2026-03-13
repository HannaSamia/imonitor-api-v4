import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { WsJwtGuard } from './ws-jwt.guard';

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: JwtService;

  const mockJwtService = {
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WsJwtGuard, { provide: JwtService, useValue: mockJwtService }],
    }).compile();

    guard = module.get<WsJwtGuard>(WsJwtGuard);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => jest.clearAllMocks());

  function buildContext(token: string | undefined): ExecutionContext {
    const client = {
      handshake: { auth: { token } },
      data: {} as Record<string, unknown>,
    };
    return {
      switchToWs: () => ({
        getClient: () => client,
      }),
    } as unknown as ExecutionContext;
  }

  it('should return true and set client.data.user for a valid token', () => {
    const payload = { sub: 'user-id', email: 'test@example.com' };
    mockJwtService.verify.mockReturnValue(payload);

    const context = buildContext('valid-token');
    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtService.verify).toHaveBeenCalledWith('valid-token', { clockTolerance: 60 });
    const client = context.switchToWs().getClient<{ data: { user: unknown } }>();
    expect(client.data.user).toEqual(payload);
  });

  it('should throw WsException when token is missing', () => {
    const context = buildContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(WsException);
    expect(() => guard.canActivate(context)).toThrow('Unauthorized');
  });

  it('should throw WsException when token is empty string', () => {
    const context = buildContext('');
    // empty string is falsy — treated as missing
    expect(() => guard.canActivate(context)).toThrow(WsException);
  });

  it('should throw WsException when jwtService.verify throws', () => {
    mockJwtService.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const context = buildContext('bad-token');
    expect(() => guard.canActivate(context)).toThrow(WsException);
    expect(() => guard.canActivate(context)).toThrow('Unauthorized');
  });
});
