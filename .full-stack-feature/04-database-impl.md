# Database Implementation: Phase 3.1 Auth & Users Refactoring

**Status**: Complete
**Build**: Clean (0 errors)
**Lint**: Clean (0 warnings)
**Tests**: 29/29 passing (0 regressions)

---

## Changes Made

### 1. Entity Modifications

#### `core-application-users.entity.ts` — 5 indexes added
- `IDX_users_userName` — covers login by userName
- `IDX_users_email` — covers refreshToken lookup, email uniqueness
- `IDX_users_isDeleted` — covers getAll, getEmails soft-delete filter
- `IDX_users_email_isDeleted` — covers login email branch, selfUpdate uniqueness
- `IDX_users_userName_isDeleted` — covers login userName branch, register duplicate check

#### `core-privileges.entity.ts` — PascalCase→camelCase + composite index
- Properties renamed: `Id`→`id`, `UserId`→`userId`, `RoleId`→`roleId`, `ModuleId`→`moduleId`
- Uses `@Column({ name: 'ColumnName' })` to map DB PascalCase columns to TS camelCase
- Added `IDX_privileges_userId_moduleId` composite index (most critical missing index)

#### `core-application-refresh-token.entity.ts` — 1 index added
- `IDX_refreshToken_jwtId` — covers logout by jwtId

#### `core-minimum-privileges.entity.ts` — enhanced
- Added `IDX_minPriv_request_method` composite index
- Added `@ManyToOne` relation to `CoreApplicationRoles` via `roleRequired` FK

### 2. Downstream Code Updates (camelCase)

| File | Changes |
|------|---------|
| `src/modules/auth/auth.service.ts` | `UserId:` → `userId:`, `ModuleId:` → `moduleId:` (1 location) |
| `src/modules/users/users.service.ts` | All `Id`/`UserId`/`RoleId`/`ModuleId` → camelCase (6 locations) |
| `src/modules/auth/auth.service.spec.ts` | Mock objects updated to camelCase (2 locations) |

### 3. Guard Refactoring (raw SQL → TypeORM repos)

#### `privilege.guard.ts`
- Replaced `@InjectDataSource() DataSource` with `@InjectRepository(CoreMinimumPrivileges)` + `@InjectRepository(CorePrivileges)`
- Query 1: `minPrivRepo.findOne({ where: { request, method }, relations: ['role'] })`
- Query 2: `privilegesRepo.findOne({ where: { userId, moduleId }, relations: ['role'] })`
- Uses new composite indexes on both tables

#### `roles.guard.ts`
- Replaced `@InjectDataSource() DataSource` with `@InjectRepository(CorePrivileges)` + `@InjectRepository(CoreModules)`
- Now finds module by name, then looks up privilege with role relation
- Uses `IDX_privileges_userId_moduleId` composite index

#### `auth.module.ts`
- Added `TypeOrmModule.forFeature([CoreMinimumPrivileges, CorePrivileges, CoreApplicationRoles, CoreModules])`
- All 4 entities registered for guard repositories

### 4. Migration Infrastructure

#### `src/database/data-source.ts` (NEW)
- Standalone DataSource for TypeORM CLI
- Uses dotenv for env vars, same DB config as DatabaseModule

#### `src/database/migrations/1709500000000-AddAuthIndexes.ts` (NEW)
- Single idempotent migration: `CREATE INDEX IF NOT EXISTS` for all 8 indexes
- Rollback: `DROP INDEX IF EXISTS` for all 8 indexes
- Tables: core_application_users (5), core_privileges (1), core_application_refresh_token (1), core_minimum_privileges (1)

---

## Files Created
- `src/database/data-source.ts`
- `src/database/migrations/1709500000000-AddAuthIndexes.ts`

## Files Modified
- `src/database/entities/core-application-users.entity.ts`
- `src/database/entities/core-privileges.entity.ts`
- `src/database/entities/core-application-refresh-token.entity.ts`
- `src/database/entities/core-minimum-privileges.entity.ts`
- `src/auth/auth.module.ts`
- `src/auth/guards/privilege.guard.ts`
- `src/auth/guards/roles.guard.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/users/users.service.ts`
- `src/modules/auth/auth.service.spec.ts`
