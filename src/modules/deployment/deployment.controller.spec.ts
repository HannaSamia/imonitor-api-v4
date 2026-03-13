import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DeploymentController } from './deployment.controller';
import { DeploymentService } from './deployment.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { AppModuleDto } from './dto/deployment.dto';

const MOCK_APP_MODULE: AppModuleDto = {
  id: 'module-uuid-001',
  isMenuItem: true,
  priority: 10,
  name: 'TestModule',
  isDefault: false,
};

describe('DeploymentController', () => {
  let controller: DeploymentController;
  let service: jest.Mocked<DeploymentService>;

  const mockService = {
    tableFieldsFixer: jest.fn().mockResolvedValue(undefined),
    moduleInserter: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeploymentController],
      providers: [{ provide: DeploymentService, useValue: mockService }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DeploymentController>(DeploymentController);
    service = module.get(DeploymentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────── guard metadata ───────────────────────

  describe('PrivilegeGuard', () => {
    it('should have PrivilegeGuard applied to the controller', () => {
      const guards: any[] = Reflect.getMetadata(GUARDS_METADATA, DeploymentController) ?? [];
      expect(guards).toContain(PrivilegeGuard);
    });
  });

  // ─────────────────────── POST /fix/:tableType ───────────────────────

  describe('tableFieldsFixer (POST /fix/:tableType)', () => {
    it('should call service.tableFieldsFixer with the tableType param', async () => {
      await controller.tableFieldsFixer('node');

      expect(service.tableFieldsFixer).toHaveBeenCalledWith('node');
    });

    it('should return void on success', async () => {
      const result = await controller.tableFieldsFixer('param');

      expect(result).toBeUndefined();
    });
  });

  // ─────────────────────── POST /module ───────────────────────

  describe('moduleInserter (POST /module)', () => {
    it('should call service.moduleInserter with the AppModuleDto', async () => {
      await controller.moduleInserter(MOCK_APP_MODULE);

      expect(service.moduleInserter).toHaveBeenCalledWith(MOCK_APP_MODULE);
    });

    it('should return void on success', async () => {
      const result = await controller.moduleInserter(MOCK_APP_MODULE);

      expect(result).toBeUndefined();
    });
  });
});
