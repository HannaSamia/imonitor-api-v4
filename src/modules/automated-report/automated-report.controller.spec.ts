import { Test, TestingModule } from '@nestjs/testing';
import { AutomatedReportController } from './automated-report.controller';
import { AutomatedReportService } from './automated-report.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';

const mockService = {
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  toggleStatus: jest.fn(),
  listByUser: jest.fn(),
  listByReportId: jest.fn(),
  getById: jest.fn(),
};

const mockUser: JwtPayload = {
  id: 'user-001',
  email: 'test@example.com',
  credential: 'user',
  theme: 'dark',
};

describe('AutomatedReportController', () => {
  let controller: AutomatedReportController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomatedReportController],
      providers: [{ provide: AutomatedReportService, useValue: mockService }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AutomatedReportController>(AutomatedReportController);
    jest.clearAllMocks();
  });

  it('create() calls service.create and returns message', async () => {
    mockService.create.mockResolvedValue(undefined);
    const result = await controller.create({ method: 'email' } as any, mockUser);
    expect(mockService.create).toHaveBeenCalledWith({ method: 'email' }, mockUser.id);
    expect(result).toHaveProperty('message');
  });

  it('update() calls service.update and returns message', async () => {
    mockService.update.mockResolvedValue(undefined);
    const result = await controller.update({ method: 'email' } as any, 'ar-001', mockUser);
    expect(mockService.update).toHaveBeenCalledWith({ method: 'email' }, 'ar-001', mockUser.id);
    expect(result).toHaveProperty('message');
  });

  it('delete() calls service.delete and returns message', async () => {
    mockService.delete.mockResolvedValue(undefined);
    const result = await controller.delete('ar-001', mockUser);
    expect(mockService.delete).toHaveBeenCalledWith('ar-001', mockUser.id);
    expect(result).toHaveProperty('message');
  });

  it('toggleStatus() returns message and result', async () => {
    mockService.toggleStatus.mockResolvedValue(true);
    const result = await controller.toggleStatus('ar-001', mockUser);
    expect(result).toMatchObject({ message: expect.any(String), result: true });
  });

  it('listByUser() returns wrapped result', async () => {
    mockService.listByUser.mockResolvedValue([{ id: 'ar-001', title: 'T', isActive: true }]);
    const result = await controller.listByUser(mockUser);
    expect(result.result).toHaveLength(1);
  });

  it('listByReportId() returns wrapped result', async () => {
    mockService.listByReportId.mockResolvedValue([]);
    const result = await controller.listByReportId('rep-001', mockUser);
    expect(result.result).toEqual([]);
  });

  it('getById() returns wrapped result', async () => {
    mockService.getById.mockResolvedValue({ id: 'ar-001', method: 'email', emails: [] });
    const result = await controller.getById('ar-001', mockUser);
    expect(result.result).toHaveProperty('id', 'ar-001');
  });
});
