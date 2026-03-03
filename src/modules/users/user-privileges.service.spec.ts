import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserPrivilegesService } from './user-privileges.service';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { UserPrivilegesDto } from './dto';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-test-1';

/** Build a minimal CoreModules fixture. */
function makeModule(overrides: Partial<CoreModules> & { id: string }): CoreModules {
  return {
    pId: null,
    isMenuItem: true,
    priority: 1,
    name: 'Module',
    isDefault: false,
    nestedLevel: 0,
    icon: null,
    path: null,
    lightColor: null,
    darkColor: '#1f1f1f',
    font: null,
    isNode: null,
    tables: [],
    ...overrides,
  } as CoreModules;
}

/** Build a minimal CorePrivileges fixture. */
function makePrivilege(moduleId: number, roleName: string): CorePrivileges {
  return {
    id: `priv-${moduleId}`,
    userId: USER_ID,
    roleId: `role-${roleName}`,
    moduleId,
    user: {} as any,
    role: { id: `role-${roleName}`, name: roleName, privileges: [] } as CoreApplicationRoles,
  };
}

/** Root modules used across several tests. */
const ROOT_MODULE = makeModule({
  id: '1',
  name: 'Dashboard',
  pId: null,
  isMenuItem: true,
  priority: 1,
  nestedLevel: 0,
});
const CHILD_MODULE = makeModule({ id: '2', name: 'Reports', pId: 1, isMenuItem: true, priority: 2, nestedLevel: 1 });
const HIDDEN_MODULE = makeModule({
  id: '3',
  name: 'Hidden',
  pId: null,
  isMenuItem: false,
  priority: 3,
  nestedLevel: 0,
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('UserPrivilegesService', () => {
  let service: UserPrivilegesService;
  let privilegesRepo: any;
  let rolesRepo: any;
  let modulesRepo: any;
  let mockManager: any;

  beforeEach(async () => {
    // QueryBuilder mock used by updateUserPrivileges transaction
    const mockQb: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockManager = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((_entity: any, data: any) => data),
      save: jest.fn().mockResolvedValue([]),
    };

    privilegesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      manager: {
        transaction: jest.fn().mockImplementation(async (cb: (em: any) => Promise<any>) => cb(mockManager)),
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn().mockImplementation((_entity: any, data: any) => data),
        save: jest.fn().mockResolvedValue([]),
      },
    };

    rolesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    modulesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPrivilegesService,
        { provide: getRepositoryToken(CorePrivileges), useValue: privilegesRepo },
        { provide: getRepositoryToken(CoreApplicationRoles), useValue: rolesRepo },
        { provide: getRepositoryToken(CoreModules), useValue: modulesRepo },
      ],
    }).compile();

    service = module.get<UserPrivilegesService>(UserPrivilegesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── getUserPrivileges ─────────────────────────────────────────────────────

  describe('getUserPrivileges', () => {
    it('should build a flat list for root-level modules with correct role flags', async () => {
      modulesRepo.find.mockResolvedValue([ROOT_MODULE]);
      privilegesRepo.find.mockResolvedValue([makePrivilege(1, AvailableRoles.USER)]);

      const result = await service.getUserPrivileges(USER_ID);

      expect(result).toHaveLength(1);
      const node = result[0];
      expect(node.id).toBe(1);
      expect(node.name).toBe('Dashboard');
      expect(node.roleName).toBe(AvailableRoles.USER);
      expect(node.isUser).toBe(true);
      expect(node.isSuperUser).toBe(false);
      expect(node.isAdmin).toBe(false);
    });

    it('should nest child modules under their parent in the tree', async () => {
      modulesRepo.find.mockResolvedValue([ROOT_MODULE, CHILD_MODULE]);
      privilegesRepo.find.mockResolvedValue([
        makePrivilege(1, AvailableRoles.ADMIN),
        makePrivilege(2, AvailableRoles.USER),
      ]);

      const result = await service.getUserPrivileges(USER_ID);

      expect(result).toHaveLength(1);
      const root = result[0];
      expect(root.id).toBe(1);
      expect(root.children).toHaveLength(1);
      expect(root.children![0].id).toBe(2);
      expect(root.children![0].roleName).toBe(AvailableRoles.USER);
    });

    it('should default to N/A role for modules without an assigned privilege', async () => {
      modulesRepo.find.mockResolvedValue([ROOT_MODULE]);
      privilegesRepo.find.mockResolvedValue([]); // no privileges

      const result = await service.getUserPrivileges(USER_ID);

      expect(result[0].roleName).toBe(AvailableRoles.DEFAULT);
      expect(result[0].isUser).toBe(false);
    });

    it('should set isAdmin=true for admin and superadmin roles', async () => {
      modulesRepo.find.mockResolvedValue([ROOT_MODULE]);
      privilegesRepo.find.mockResolvedValue([makePrivilege(1, AvailableRoles.ADMIN)]);

      const result = await service.getUserPrivileges(USER_ID);

      expect(result[0].isAdmin).toBe(true);
      expect(result[0].isSuperUser).toBe(true);
      expect(result[0].isUser).toBe(true);
    });

    it('should set toggle equal to roleName', async () => {
      modulesRepo.find.mockResolvedValue([ROOT_MODULE]);
      privilegesRepo.find.mockResolvedValue([makePrivilege(1, AvailableRoles.SUPER_USER)]);

      const result = await service.getUserPrivileges(USER_ID);

      expect(result[0].toggle).toBe(result[0].roleName);
    });

    it('should return an empty array when there are no modules', async () => {
      modulesRepo.find.mockResolvedValue([]);
      privilegesRepo.find.mockResolvedValue([]);

      const result = await service.getUserPrivileges(USER_ID);

      expect(result).toEqual([]);
    });

    it('should load modules ordered by priority and privileges with relations in a single Promise.all', async () => {
      modulesRepo.find.mockResolvedValue([ROOT_MODULE]);
      privilegesRepo.find.mockResolvedValue([]);

      await service.getUserPrivileges(USER_ID);

      expect(modulesRepo.find).toHaveBeenCalledWith({ order: { priority: 'ASC' } });
      expect(privilegesRepo.find).toHaveBeenCalledWith({ where: { userId: USER_ID }, relations: { role: true } });
    });
  });

  // ─── updateUserPrivileges ──────────────────────────────────────────────────

  describe('updateUserPrivileges', () => {
    const ROLE_USER_ID = 'role-user-id';
    const ROLE_ADMIN_ID = 'role-admin-id';

    const allRoles: CoreApplicationRoles[] = [
      { id: ROLE_USER_ID, name: AvailableRoles.USER, privileges: [] },
      { id: ROLE_ADMIN_ID, name: AvailableRoles.ADMIN, privileges: [] },
    ];

    function buildPrivilegesDto(id: number, roleName: string, children?: UserPrivilegesDto[]): UserPrivilegesDto {
      return {
        id,
        pId: 0,
        name: `Module-${id}`,
        isMenuItem: true,
        priority: id,
        nestedLevel: 0,
        roleName,
        isUser: true,
        isSuperUser: false,
        isAdmin: false,
        toggle: roleName,
        children,
      };
    }

    it('should group modules by roleId and execute one UPDATE per unique role', async () => {
      rolesRepo.find.mockResolvedValue(allRoles);

      const body: UserPrivilegesDto[] = [
        buildPrivilegesDto(1, AvailableRoles.USER),
        buildPrivilegesDto(2, AvailableRoles.USER),
        buildPrivilegesDto(3, AvailableRoles.ADMIN),
      ];

      await service.updateUserPrivileges(USER_ID, body);

      // Transaction must have been started
      expect(privilegesRepo.manager.transaction).toHaveBeenCalledTimes(1);

      // Two distinct roles → two createQueryBuilder chains inside the transaction
      expect(mockManager.createQueryBuilder).toHaveBeenCalledTimes(2);
    });

    it('should wrap all updates inside a single database transaction', async () => {
      rolesRepo.find.mockResolvedValue(allRoles);
      const body: UserPrivilegesDto[] = [buildPrivilegesDto(1, AvailableRoles.USER)];

      await service.updateUserPrivileges(USER_ID, body);

      expect(privilegesRepo.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('should recursively collect privilege updates from nested children', async () => {
      rolesRepo.find.mockResolvedValue(allRoles);

      const body: UserPrivilegesDto[] = [
        buildPrivilegesDto(1, AvailableRoles.USER, [buildPrivilegesDto(2, AvailableRoles.ADMIN)]),
      ];

      await service.updateUserPrivileges(USER_ID, body);

      // Two modules with different roles → two QB calls
      expect(mockManager.createQueryBuilder).toHaveBeenCalledTimes(2);
    });

    it('should skip modules whose roleName is not present in the roles table', async () => {
      rolesRepo.find.mockResolvedValue(allRoles);
      const body: UserPrivilegesDto[] = [buildPrivilegesDto(99, 'unknownRole')];

      // Should not throw; simply no updates executed
      await service.updateUserPrivileges(USER_ID, body);

      expect(mockManager.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should pre-load all roles once before constructing the update groups', async () => {
      rolesRepo.find.mockResolvedValue(allRoles);
      const body: UserPrivilegesDto[] = [buildPrivilegesDto(1, AvailableRoles.USER)];

      await service.updateUserPrivileges(USER_ID, body);

      expect(rolesRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getSideMenu ──────────────────────────────────────────────────────────

  describe('getSideMenu', () => {
    const DEFAULT_THEME = 'light';

    it('should exclude modules where isMenuItem is false', async () => {
      modulesRepo.find.mockResolvedValue([ROOT_MODULE, HIDDEN_MODULE]);
      privilegesRepo.find.mockResolvedValue([
        makePrivilege(1, AvailableRoles.USER),
        makePrivilege(3, AvailableRoles.USER),
      ]);

      const result = await service.getSideMenu(USER_ID, DEFAULT_THEME);

      const ids = result.map((r) => r.id);
      expect(ids).not.toContain(3);
      expect(ids).toContain(1);
    });

    it('should exclude N/A-role modules that are not marked isDefault', async () => {
      const nonDefaultModule = makeModule({
        id: '4',
        name: 'NonDefault',
        pId: null,
        isMenuItem: true,
        isDefault: false,
        priority: 4,
      });
      modulesRepo.find.mockResolvedValue([nonDefaultModule]);
      privilegesRepo.find.mockResolvedValue([]); // no privilege → DEFAULT role

      const result = await service.getSideMenu(USER_ID, DEFAULT_THEME);

      expect(result).toHaveLength(0);
    });

    it('should include N/A-role modules that ARE marked isDefault', async () => {
      const defaultModule = makeModule({
        id: '5',
        name: 'DefaultVisible',
        pId: null,
        isMenuItem: true,
        isDefault: true,
        priority: 5,
      });
      modulesRepo.find.mockResolvedValue([defaultModule]);
      privilegesRepo.find.mockResolvedValue([]); // no privilege → DEFAULT role

      const result = await service.getSideMenu(USER_ID, DEFAULT_THEME);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(5);
    });

    it('should use lightColor for light theme', async () => {
      const colorModule = makeModule({
        id: '6',
        name: 'Colored',
        pId: null,
        isMenuItem: true,
        priority: 6,
        lightColor: '#ffffff',
        darkColor: '#000000',
      });
      modulesRepo.find.mockResolvedValue([colorModule]);
      privilegesRepo.find.mockResolvedValue([makePrivilege(6, AvailableRoles.USER)]);

      const result = await service.getSideMenu(USER_ID, 'light');

      expect(result[0].color).toBe('#ffffff');
    });

    it('should use darkColor for dark theme', async () => {
      const colorModule = makeModule({
        id: '7',
        name: 'DarkColored',
        pId: null,
        isMenuItem: true,
        priority: 7,
        lightColor: '#ffffff',
        darkColor: '#000000',
      });
      modulesRepo.find.mockResolvedValue([colorModule]);
      privilegesRepo.find.mockResolvedValue([makePrivilege(7, AvailableRoles.USER)]);

      const result = await service.getSideMenu(USER_ID, 'dark');

      expect(result[0].color).toBe('#000000');
    });

    it('should not include an empty children array on leaf nodes', async () => {
      // CHILD_MODULE pId=1 but ROOT_MODULE is the only module in list → no children for root
      modulesRepo.find.mockResolvedValue([ROOT_MODULE]);
      privilegesRepo.find.mockResolvedValue([makePrivilege(1, AvailableRoles.USER)]);

      const result = await service.getSideMenu(USER_ID, DEFAULT_THEME);

      // children should be undefined, not []
      expect(result[0].children).toBeUndefined();
    });
  });

  // ─── getUserRoleOnModule ───────────────────────────────────────────────────

  describe('getUserRoleOnModule', () => {
    it('should return the role name when the user has a privilege on the module', async () => {
      modulesRepo.findOne.mockResolvedValue({ id: '1', name: 'Dashboard' });
      privilegesRepo.findOne.mockResolvedValue(makePrivilege(1, AvailableRoles.ADMIN));

      const role = await service.getUserRoleOnModule(USER_ID, 'Dashboard');

      expect(role).toBe(AvailableRoles.ADMIN);
    });

    it('should return null when the module does not exist', async () => {
      modulesRepo.findOne.mockResolvedValue(null);

      const role = await service.getUserRoleOnModule(USER_ID, 'NonExistentModule');

      expect(role).toBeNull();
      expect(privilegesRepo.findOne).not.toHaveBeenCalled();
    });

    it('should return null when the user has no privilege record for the module', async () => {
      modulesRepo.findOne.mockResolvedValue({ id: '1', name: 'Dashboard' });
      privilegesRepo.findOne.mockResolvedValue(null);

      const role = await service.getUserRoleOnModule(USER_ID, 'Dashboard');

      expect(role).toBeNull();
    });

    it('should return null when the privilege has no associated role', async () => {
      modulesRepo.findOne.mockResolvedValue({ id: '1', name: 'Dashboard' });
      privilegesRepo.findOne.mockResolvedValue({
        id: 'priv-1',
        userId: USER_ID,
        roleId: null,
        moduleId: 1,
        user: {} as any,
        role: null, // no role loaded
      });

      const role = await service.getUserRoleOnModule(USER_ID, 'Dashboard');

      expect(role).toBeNull();
    });

    it('should look up the module by name', async () => {
      modulesRepo.findOne.mockResolvedValue({ id: '2', name: 'Reports' });
      privilegesRepo.findOne.mockResolvedValue(makePrivilege(2, AvailableRoles.USER));

      await service.getUserRoleOnModule(USER_ID, 'Reports');

      expect(modulesRepo.findOne).toHaveBeenCalledWith({ where: { name: 'Reports' } });
    });
  });

  // ─── assignDefaultPrivileges ───────────────────────────────────────────────

  describe('assignDefaultPrivileges', () => {
    const DEFAULT_ROLE: CoreApplicationRoles = { id: 'role-default', name: AvailableRoles.DEFAULT, privileges: [] };

    it('should create one privilege per module using the default role', async () => {
      const modules = [makeModule({ id: '1', name: 'Dashboard' }), makeModule({ id: '2', name: 'Reports' })];

      privilegesRepo.manager.findOne.mockResolvedValue(DEFAULT_ROLE);
      privilegesRepo.manager.find.mockResolvedValue(modules);
      privilegesRepo.manager.save.mockResolvedValue([]);

      await service.assignDefaultPrivileges(USER_ID);

      const savedPrivileges = privilegesRepo.manager.save.mock.calls[0][0];
      expect(savedPrivileges).toHaveLength(2);
      savedPrivileges.forEach((priv: any) => {
        expect(priv.userId).toBe(USER_ID);
        expect(priv.roleId).toBe(DEFAULT_ROLE.id);
        expect(priv.moduleId).toEqual(expect.any(Number));
        expect(priv.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      });
    });

    it('should do nothing when the default role does not exist in the database', async () => {
      privilegesRepo.manager.findOne.mockResolvedValue(null);

      await service.assignDefaultPrivileges(USER_ID);

      expect(privilegesRepo.manager.find).not.toHaveBeenCalled();
      expect(privilegesRepo.manager.save).not.toHaveBeenCalled();
    });

    it('should do nothing when there are no modules to assign', async () => {
      privilegesRepo.manager.findOne.mockResolvedValue(DEFAULT_ROLE);
      privilegesRepo.manager.find.mockResolvedValue([]); // no modules

      await service.assignDefaultPrivileges(USER_ID);

      expect(privilegesRepo.manager.save).not.toHaveBeenCalled();
    });

    it('should use the provided EntityManager when one is passed in', async () => {
      const externalManager: any = {
        findOne: jest.fn().mockResolvedValue(DEFAULT_ROLE),
        find: jest.fn().mockResolvedValue([makeModule({ id: '10', name: 'Test' })]),
        create: jest.fn().mockImplementation((_entity: any, data: any) => data),
        save: jest.fn().mockResolvedValue([]),
      };

      await service.assignDefaultPrivileges(USER_ID, externalManager);

      expect(externalManager.findOne).toHaveBeenCalled();
      expect(externalManager.save).toHaveBeenCalled();
      // Internal manager must NOT have been used
      expect(privilegesRepo.manager.findOne).not.toHaveBeenCalled();
    });

    it('should convert module id string to integer for the moduleId field', async () => {
      const modules = [makeModule({ id: '42', name: 'IntTest' })];
      privilegesRepo.manager.findOne.mockResolvedValue(DEFAULT_ROLE);
      privilegesRepo.manager.find.mockResolvedValue(modules);
      privilegesRepo.manager.save.mockResolvedValue([]);

      await service.assignDefaultPrivileges(USER_ID);

      const saved = privilegesRepo.manager.save.mock.calls[0][0];
      expect(saved[0].moduleId).toBe(42);
    });
  });
});
