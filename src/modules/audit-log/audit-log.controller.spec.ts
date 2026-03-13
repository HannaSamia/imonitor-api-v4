import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { ErrorMessages } from '../../shared/constants/error-messages';

const MOCK_OPERATIONS = ['LOGIN', 'LOGOUT'];
const MOCK_HEADER = [
  {
    text: 'Stat Date',
    datafield: 'stat_date',
    columnName: 'stat_date',
    aggregates: [],
    pinned: false,
    hidden: false,
    editable: true,
    columntype: 'datetime',
  },
];
const MOCK_BODY = [
  {
    stat_date: '2026-01-01 00:01:00',
    sdp_name: 'SDP1',
    user: 'admin',
    origin: 'web',
    operation: 'LOGIN',
    r_id: 'abc123',
  },
];

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let service: jest.Mocked<AuditLogService>;

  const mockService = {
    getAuditLogsTable: jest.fn().mockResolvedValue({ header: MOCK_HEADER, body: MOCK_BODY }),
    getAuditDetails: jest.fn().mockResolvedValue('cleaned-value'),
    getAuditOperations: jest.fn().mockResolvedValue(MOCK_OPERATIONS),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [{ provide: AuditLogService, useValue: mockService }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuditLogController>(AuditLogController);
    service = module.get(AuditLogService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────── guard metadata ───────────────────────

  describe('PrivilegeGuard', () => {
    it('should have PrivilegeGuard applied to the controller', () => {
      const guards: any[] = Reflect.getMetadata(GUARDS_METADATA, AuditLogController) ?? [];
      expect(guards).toContain(PrivilegeGuard);
    });
  });

  // ─────────────────────── GET /operations ───────────────────────

  describe('getOperations (GET /operations)', () => {
    it('should call service.getAuditOperations and return operations list', async () => {
      const result = await controller.getOperations();
      expect(service.getAuditOperations).toHaveBeenCalledTimes(1);
      expect(result).toEqual(MOCK_OPERATIONS);
    });
  });

  // ─────────────────────── GET /:fromdate/:todate/:operation ───────────────────────

  describe('getAuditLogsTable (GET /:fromdate/:todate/:operation)', () => {
    it('should parse operation JSON and call service', async () => {
      const operationJson = JSON.stringify(MOCK_OPERATIONS);

      const result = await controller.getAuditLogsTable('2026-01-01', '2026-01-31', operationJson);

      expect(service.getAuditLogsTable).toHaveBeenCalledWith('2026-01-01', '2026-01-31', MOCK_OPERATIONS);
      expect(result).toEqual({ header: MOCK_HEADER, body: MOCK_BODY });
    });

    it('should throw BadRequestException when operation JSON parses to empty array', async () => {
      await expect(controller.getAuditLogsTable('2026-01-01', '2026-01-31', '[]')).rejects.toThrow(BadRequestException);
      await expect(controller.getAuditLogsTable('2026-01-01', '2026-01-31', '[]')).rejects.toThrow(
        ErrorMessages.AUDIT_MISSING_OPERATION,
      );
    });

    it('should throw BadRequestException when operation JSON is invalid', async () => {
      await expect(controller.getAuditLogsTable('2026-01-01', '2026-01-31', 'not-json')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─────────────────────── GET /:id/:request ───────────────────────

  describe('getAuditDetails (GET /:id/:request)', () => {
    it("should call service.getAuditDetails with isRequest=true when param is 'true'", async () => {
      const result = await controller.getAuditDetails('abc123', 'true');

      expect(service.getAuditDetails).toHaveBeenCalledWith('abc123', true);
      expect(result).toBe('cleaned-value');
    });

    it("should call service.getAuditDetails with isRequest=false when param is 'false'", async () => {
      await controller.getAuditDetails('abc123', 'false');

      expect(service.getAuditDetails).toHaveBeenCalledWith('abc123', false);
    });
  });
});
