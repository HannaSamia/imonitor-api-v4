import { Test, TestingModule } from '@nestjs/testing';
import { UtilityController } from './utility.controller';
import { UtilityService } from './utility.service';
import { ApiKeyGuard } from '../../auth/guards/api-key.guard';

describe('UtilityController', () => {
  let controller: UtilityController;
  let service: jest.Mocked<UtilityService>;

  const mockService = {
    ping: jest.fn().mockReturnValue('pong'),
    consolidate: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UtilityController],
      providers: [{ provide: UtilityService, useValue: mockService }],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UtilityController>(UtilityController);
    service = module.get(UtilityService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────── GET /ping ───────────────────────

  describe('ping (GET /ping)', () => {
    it('should call service.ping and return "pong"', () => {
      const result = controller.ping();
      expect(service.ping).toHaveBeenCalledTimes(1);
      expect(result).toBe('pong');
    });
  });

  // ─────────────────────── POST /consolidate ───────────────────────

  describe('consolidate (POST /consolidate)', () => {
    it('should call service.consolidate with tables and date from dto', async () => {
      const dto = { tables: ['V3_sdp_stats', 'V3_air_stats'], date: '2026-01-15' };

      await controller.consolidate(dto);

      expect(service.consolidate).toHaveBeenCalledWith(['V3_sdp_stats', 'V3_air_stats'], '2026-01-15');
    });

    it('should return void on success', async () => {
      const dto = { tables: ['V3_sdp_stats'], date: '2026-01-15' };

      const result = await controller.consolidate(dto);

      expect(result).toBeUndefined();
    });
  });
});
