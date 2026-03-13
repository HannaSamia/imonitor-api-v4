import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DeploymentService } from './deployment.service';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { AppModuleDto } from './dto/deployment.dto';

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('test-uuid') }));

const MOCK_APP_MODULE: AppModuleDto = {
  id: 'module-uuid-001',
  pId: undefined,
  isMenuItem: true,
  priority: 10,
  name: 'TestModule',
  isDefault: false,
  nestedLevel: 1,
  icon: 'icon-test',
  path: '/test',
  color: '#ffffff',
  font: 'Roboto',
};

const MOCK_TABLE = { id: 'table-uuid-001', tableName: 'V3_test_nodes', tableType: 'node' };
const MOCK_COLUMNS = [
  { name: 'stat_date', type: 'datetime' },
  { name: 'nodeName', type: 'varchar(50)' },
  { name: 'count', type: 'int(11)' },
  { name: 'flag', type: 'tinyint(1)' },
];

describe('DeploymentService', () => {
  let service: DeploymentService;
  let coreModulesRepo: any;
  let coreModulesTablesRepo: any;
  let coreTablesFieldRepo: any;
  let corePrivilegesRepo: any;
  let coreUsersRepo: any;
  let coreRolesRepo: any;
  let legacyDataDb: jest.Mocked<LegacyDataDbService>;

  beforeEach(async () => {
    coreModulesRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
    };

    coreModulesTablesRepo = {
      find: jest.fn(),
    };

    coreTablesFieldRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
    };

    corePrivilegesRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
    };

    coreUsersRepo = {
      find: jest.fn(),
    };

    coreRolesRepo = {
      findOne: jest.fn(),
    };

    legacyDataDb = {
      query: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeploymentService,
        { provide: getRepositoryToken(CoreModules), useValue: coreModulesRepo },
        { provide: getRepositoryToken(CoreModulesTables), useValue: coreModulesTablesRepo },
        { provide: getRepositoryToken(CoreTablesField), useValue: coreTablesFieldRepo },
        { provide: getRepositoryToken(CorePrivileges), useValue: corePrivilegesRepo },
        { provide: getRepositoryToken(CoreApplicationUsers), useValue: coreUsersRepo },
        { provide: getRepositoryToken(CoreApplicationRoles), useValue: coreRolesRepo },
        { provide: LegacyDataDbService, useValue: legacyDataDb },
      ],
    }).compile();

    service = module.get<DeploymentService>(DeploymentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────── tableFieldsFixer ───────────────────────

  describe('tableFieldsFixer', () => {
    it('should save a CoreTablesField entry for each column', async () => {
      coreModulesTablesRepo.find.mockResolvedValue([MOCK_TABLE]);
      legacyDataDb.query.mockResolvedValue(MOCK_COLUMNS);

      await service.tableFieldsFixer('node');

      expect(coreTablesFieldRepo.save).toHaveBeenCalledTimes(MOCK_COLUMNS.length);
    });

    it('should resolve "alpha" type for varchar when tableType is not "node"', async () => {
      coreModulesTablesRepo.find.mockResolvedValue([{ id: 't1', tableName: 'V3_param_table', tableType: 'param' }]);
      legacyDataDb.query.mockResolvedValue([{ name: 'field1', type: 'varchar(50)' }]);

      await service.tableFieldsFixer('param');

      expect(coreTablesFieldRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'alpha' }));
    });

    it('should resolve "textbox" type for varchar when tableType is "node"', async () => {
      coreModulesTablesRepo.find.mockResolvedValue([MOCK_TABLE]);
      legacyDataDb.query.mockResolvedValue([{ name: 'field1', type: 'varchar(50)' }]);

      await service.tableFieldsFixer('node');

      expect(coreTablesFieldRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'textbox' }));
    });

    it('should uppercase display name for short columns (<=4 chars)', async () => {
      coreModulesTablesRepo.find.mockResolvedValue([MOCK_TABLE]);
      legacyDataDb.query.mockResolvedValue([{ name: 'id', type: 'varchar(36)' }]);

      await service.tableFieldsFixer('node');

      expect(coreTablesFieldRepo.create).toHaveBeenCalledWith(expect.objectContaining({ columnDisplayName: 'ID' }));
    });

    it('should do nothing when no tables match tableType', async () => {
      coreModulesTablesRepo.find.mockResolvedValue([]);

      await service.tableFieldsFixer('unknown');

      expect(legacyDataDb.query).not.toHaveBeenCalled();
      expect(coreTablesFieldRepo.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on error', async () => {
      coreModulesTablesRepo.find.mockRejectedValue(new Error('DB fail'));

      await expect(service.tableFieldsFixer('node')).rejects.toThrow(BadRequestException);
      await expect(service.tableFieldsFixer('node')).rejects.toThrow(ErrorMessages.ERROR_WHILE_FIXING_TABLE_FIELDS);
    });
  });

  // ─────────────────────── moduleInserter ───────────────────────

  describe('moduleInserter', () => {
    it('should save the module entity with correct fields including lightColor from color', async () => {
      coreUsersRepo.find.mockResolvedValue([]);
      coreRolesRepo.findOne.mockResolvedValue({ id: 'role-na-001' });

      await service.moduleInserter(MOCK_APP_MODULE);

      expect(coreModulesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: MOCK_APP_MODULE.id,
          name: MOCK_APP_MODULE.name,
          lightColor: MOCK_APP_MODULE.color,
          darkColor: '#1f1f1f',
        }),
      );
      expect(coreModulesRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should create one privilege per user with N/A roleId', async () => {
      coreUsersRepo.find.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);
      coreRolesRepo.findOne.mockResolvedValue({ id: 'role-na-001' });

      await service.moduleInserter(MOCK_APP_MODULE);

      expect(corePrivilegesRepo.save).toHaveBeenCalledTimes(2);
      expect(corePrivilegesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ roleId: 'role-na-001' }));
    });

    it('should skip privilege creation when N/A role is not found', async () => {
      coreUsersRepo.find.mockResolvedValue([{ id: 'user-1' }]);
      coreRolesRepo.findOne.mockResolvedValue(null);

      await service.moduleInserter(MOCK_APP_MODULE);

      expect(corePrivilegesRepo.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on error', async () => {
      coreModulesRepo.save.mockRejectedValue(new Error('DB fail'));
      coreUsersRepo.find.mockResolvedValue([]);
      coreRolesRepo.findOne.mockResolvedValue({ id: 'role-na-001' });

      await expect(service.moduleInserter(MOCK_APP_MODULE)).rejects.toThrow(BadRequestException);
      await expect(service.moduleInserter(MOCK_APP_MODULE)).rejects.toThrow(ErrorMessages.ERROR_WHILE_INSERTING_MODULE);
    });
  });
});
