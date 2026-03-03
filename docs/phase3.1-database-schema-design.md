# Phase 3.1 - Database Schema Design: Auth & Users Module Refactoring

**Database**: MariaDB (`iMonitorV3_1`)
**ORM**: TypeORM 0.3.17 / @nestjs/typeorm 10.x
**Config**: `synchronize: false`, `migrationsRun: false` (manual migration control)

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Index Additions](#2-index-additions)
3. [Entity Modifications - CorePrivileges Naming Fix](#3-entity-modifications---coreprivileges-naming-fix)
4. [New Entity - CoreMinimumPrivileges](#4-new-entity---coreminimumprivileges)
5. [Migration Strategy](#5-migration-strategy)
6. [Data Access Patterns & Repository Interfaces](#6-data-access-patterns--repository-interfaces)
7. [Impact Summary](#7-impact-summary)

---

## 1. Current State Analysis

### 1.1 Tables in Scope

| Table | Entity File | Primary Key | Current Indexes | Issues Found |
|-------|-------------|-------------|-----------------|--------------|
| `core_application_users` | `core-application-users.entity.ts` | `id` (varchar 64) | PK only | No index on `userName`, `email`, `isDeleted` -- all queried on login/register |
| `core_privileges` | `core-privileges.entity.ts` | `Id` (varchar 255) | PK only | No composite index on `(UserId, ModuleId)` -- queried on every privilege check; PascalCase property names break codebase convention |
| `core_application_refresh_token` | `core-application-refresh-token.entity.ts` | `id` (varchar 64) | `userId_refreshTokenid_fk` on `userId` | No index on `jwtId` -- queried on every logout |
| `core_application_roles` | `core-application-roles.entity.ts` | `id` (varchar 64) | PK only | Clean -- low cardinality table, no index needed |
| `core_modules` | `core-modules.entity.ts` | `id` (varchar 36) | `parent_key_idx` on `pId` | Clean |
| `core_sys_config` | `core-sys-config.entity.ts` | `confKey` (varchar 64) | `key` on `confKey` (redundant with PK) | Minor: redundant index, but harmless |
| `core_minimum_privileges` | `core-minimum-privileges.entity.ts` | `id` (auto-increment) | PK only | Entity exists but is unused; PrivilegeGuard uses raw SQL |

### 1.2 Query Hot Paths (no index coverage)

These are the high-frequency queries currently running without index support:

| Operation | Service Method | SQL Pattern | Missing Index |
|-----------|---------------|-------------|---------------|
| Login | `AuthService.login()` | `WHERE (userName = ? OR email = ?) AND isDeleted = 0` | `userName`, `email`, composites with `isDeleted` |
| Register (duplicate check) | `UsersService.register()` | `WHERE (userName = ? OR email = ? OR phoneNumber = ?) AND isDeleted = 0` | Same as login + `phoneNumber` |
| Self-update (email unique) | `UsersService.selfUpdate()` | `WHERE email = ? AND id <> ? AND isDeleted = 0` | `(email, isDeleted)` |
| Refresh token | `AuthService.refreshToken()` | `WHERE email = ?` (findOne) | `email` |
| Logout | `AuthService.logout()` | `WHERE jwtId = ?` (findOne) | `jwtId` |
| Privilege check | `AuthService.canAccessModule()` | `WHERE UserId = ? AND ModuleId = ?` (findOne) | `(UserId, ModuleId)` |
| Get user privileges | `UsersService.getUserPrivileges()` | `WHERE UserId = ?` (find) | Leading column of `(UserId, ModuleId)` covers this |
| Update privileges | `UsersService.updateUserPrivileges()` | `WHERE UserId = ? AND ModuleId = ?` (update) | `(UserId, ModuleId)` |
| Privilege guard | `PrivilegeGuard.canActivate()` | `WHERE request = ? AND method = ?` on `core_minimum_privileges` | `(request, method)` |
| Roles guard | `RolesGuard.canActivate()` | `WHERE ModuleId = ... AND UserId = ?` on `core_privileges` | `(UserId, ModuleId)` |

---

## 2. Index Additions

### 2.1 `core_application_users` -- 5 indexes

```typescript
// File: src/database/entities/core-application-users.entity.ts

import { Entity, PrimaryColumn, Column, OneToMany, Index } from 'typeorm';

@Entity('core_application_users')
@Index('IDX_users_userName', ['userName'])
@Index('IDX_users_email', ['email'])
@Index('IDX_users_isDeleted', ['isDeleted'])
@Index('IDX_users_email_isDeleted', ['email', 'isDeleted'])
@Index('IDX_users_userName_isDeleted', ['userName', 'isDeleted'])
export class CoreApplicationUsers {
  // ... existing columns unchanged
}
```

**Rationale per index:**

| Index | Covers Query | Justification |
|-------|-------------|---------------|
| `IDX_users_userName` | Login `WHERE userName = ?` branch of OR | Single-column index. The OR in login means MariaDB can index-merge `userName` and `email` indexes. |
| `IDX_users_email` | `refreshToken()` findOne by email; email uniqueness checks | Most common lookup after id. |
| `IDX_users_isDeleted` | `getAll()` `WHERE isDeleted = 0`; `getEmails()` `WHERE isDeleted = 0` | Low cardinality but filters every list query. Acts as a covering partition for soft-delete scans. |
| `IDX_users_email_isDeleted` | `selfUpdate()` / `update()` `WHERE email = ? AND isDeleted = 0`; `login()` email branch | Composite covers the two-predicate pattern exactly. MariaDB will use this over the single `email` index when both predicates are present. |
| `IDX_users_userName_isDeleted` | `login()` `WHERE userName = ? AND isDeleted = 0`; `register()` duplicate check | Same rationale as above for the userName branch. |

**Note on the login OR pattern**: The query `WHERE (userName = ? OR email = ?) AND isDeleted = 0` cannot use a single composite index for both branches. MariaDB will perform an index-merge of `IDX_users_userName_isDeleted` and `IDX_users_email_isDeleted`. This is the correct approach -- a single combined index cannot help an OR across different columns.

### 2.2 `core_privileges` -- 1 composite index

```typescript
// File: src/database/entities/core-privileges.entity.ts

@Entity('core_privileges')
@Index('IDX_privileges_userId_moduleId', ['userId', 'moduleId'])
export class CorePrivileges {
  // ... (after naming fix, see Section 3)
}
```

**Rationale:**

| Index | Covers Query | Justification |
|-------|-------------|---------------|
| `IDX_privileges_userId_moduleId` | `canAccessModule()`, `getUserPrivileges()`, `updateUserPrivileges()`, `getUserRoleOnModule()`, `getSideMenu()`, `RolesGuard`, `PrivilegeGuard` query 2 | This is the most critical missing index. Every single privilege check across the entire application queries by `(UserId, ModuleId)`. The leading column `UserId` alone also covers `getUserPrivileges()` which queries `WHERE UserId = ?`. |

**Why UserId is the leading column**: All privilege queries are user-scoped first. There is no query in the codebase that queries by `ModuleId` alone without `UserId`. Placing `UserId` first allows the index to serve both `WHERE UserId = ?` and `WHERE UserId = ? AND ModuleId = ?`.

### 2.3 `core_application_refresh_token` -- 1 index

```typescript
// File: src/database/entities/core-application-refresh-token.entity.ts

@Entity('core_application_refresh_token')
@Index('IDX_refreshToken_jwtId', ['jwtId'])
export class CoreApplicationRefreshToken {
  // ... existing columns unchanged
}
```

**Rationale:**

| Index | Covers Query | Justification |
|-------|-------------|---------------|
| `IDX_refreshToken_jwtId` | `logout()` `WHERE jwtId = ?` | Every logout operation looks up the refresh token by the JWT's `jti` claim. Without this index, it is a full table scan on a table that grows with every login. |

**Note**: The existing `userId_refreshTokenid_fk` index on `userId` is correct and should be kept -- it covers the active-session check in `login()`.

### 2.4 `core_minimum_privileges` -- 1 composite index

```typescript
// File: src/database/entities/core-minimum-privileges.entity.ts

@Entity('core_minimum_privileges')
@Index('IDX_minPriv_request_method', ['request', 'method'])
export class CoreMinimumPrivileges {
  // ... (see Section 4 for full entity)
}
```

**Rationale:**

| Index | Covers Query | Justification |
|-------|-------------|---------------|
| `IDX_minPriv_request_method` | `PrivilegeGuard` `WHERE request = ? AND method = ?` | This guard fires on every protected route. The table is small (~50-200 rows based on route count) but the query happens on every HTTP request, so an index eliminates any possibility of degradation as routes grow. |

---

## 3. Entity Modifications - CorePrivileges Naming Fix

### 3.1 Problem

`CorePrivileges` is the only entity using PascalCase for TypeScript properties:

```typescript
// CURRENT (inconsistent)
@PrimaryColumn({ type: 'varchar', length: 255 })
Id: string;

@Column({ type: 'varchar', length: 255, nullable: true, default: null })
UserId: string | null;

@Column({ type: 'varchar', length: 255, nullable: true, default: null })
RoleId: string | null;

@Column({ type: 'int', nullable: false })
ModuleId: number;
```

Every other entity in the codebase (`CoreApplicationUsers`, `CoreApplicationRefreshToken`, `CoreModules`, `CoreSysConfig`, etc.) uses camelCase. The PascalCase leaks into service code:

- `auth.service.ts` line 230: `{ UserId: userId, ModuleId: parseInt(moduleExists.id, 10) }`
- `users.service.ts` line 99-102: `Id: uuidv4(), UserId: userId, RoleId: defaultRole.id, ModuleId: parseInt(mod.id, 10)`
- `users.service.ts` line 367: `{ UserId: userId }`
- `users.service.ts` line 370: `p.ModuleId`
- `users.service.ts` line 385: `{ UserId: userId, ModuleId: moduleId }, { RoleId: roleId }`
- `users.service.ts` line 424: `{ UserId: userId, ModuleId: parseInt(mod.id, 10) }`

### 3.2 Solution

Use `@Column({ name: 'ColumnName' })` to map the database PascalCase column names to camelCase TypeScript properties. The database columns remain unchanged -- only the TypeScript interface changes.

```typescript
// AFTER (consistent camelCase)
import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CoreApplicationUsers } from './core-application-users.entity';
import { CoreApplicationRoles } from './core-application-roles.entity';

@Entity('core_privileges')
@Index('IDX_privileges_userId_moduleId', ['userId', 'moduleId'])
export class CorePrivileges {
  @PrimaryColumn({ name: 'Id', type: 'varchar', length: 255 })
  id: string;

  @Column({ name: 'UserId', type: 'varchar', length: 255, nullable: true, default: null })
  userId: string | null;

  @Column({ name: 'RoleId', type: 'varchar', length: 255, nullable: true, default: null })
  roleId: string | null;

  @Column({ name: 'ModuleId', type: 'int', nullable: false })
  moduleId: number;

  @ManyToOne(() => CoreApplicationUsers, (user) => user.privileges)
  @JoinColumn({ name: 'UserId' })
  user: CoreApplicationUsers;

  @ManyToOne(() => CoreApplicationRoles, (role) => role.privileges)
  @JoinColumn({ name: 'RoleId' })
  role: CoreApplicationRoles;
}
```

### 3.3 Downstream Code Changes Required

Every file that references the PascalCase properties must be updated. This is a find-and-replace operation:

| File | Change |
|------|--------|
| `src/modules/auth/auth.service.ts` (line 230) | `UserId:` to `userId:`, `ModuleId:` to `moduleId:` |
| `src/modules/users/users.service.ts` (lines 99-102) | `Id:` to `id:`, `UserId:` to `userId:`, `RoleId:` to `roleId:`, `ModuleId:` to `moduleId:` |
| `src/modules/users/users.service.ts` (line 367) | `UserId:` to `userId:` |
| `src/modules/users/users.service.ts` (line 370) | `p.ModuleId` to `p.moduleId` |
| `src/modules/users/users.service.ts` (line 385) | `UserId:`, `ModuleId:`, `RoleId:` to camelCase |
| `src/modules/users/users.service.ts` (line 424) | `UserId:`, `ModuleId:` to camelCase |
| `src/modules/auth/auth.service.spec.ts` | All mock objects referencing `UserId`, `RoleId`, `ModuleId`, `Id` |

**Important**: The raw SQL in `PrivilegeGuard` and `RolesGuard` references column names directly (`p.UserId`, `p.ModuleId`, `p.RoleId`). These are SQL column names, NOT TypeScript property names, so they remain PascalCase in the SQL strings. Only TypeScript property references change.

---

## 4. New Entity - CoreMinimumPrivileges

### 4.1 Current State

The entity file already exists at `src/database/entities/core-minimum-privileges.entity.ts` with a basic definition. However, it is not registered in any module and the `PrivilegeGuard` uses raw `dataSource.query()` instead of the repository pattern.

### 4.2 Updated Entity Definition

```typescript
// File: src/database/entities/core-minimum-privileges.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CoreApplicationRoles } from './core-application-roles.entity';

@Entity('core_minimum_privileges')
@Index('IDX_minPriv_request_method', ['request', 'method'])
export class CoreMinimumPrivileges {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: false })
  request: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  roleRequired: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  method: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  moduleId: number | null;

  @ManyToOne(() => CoreApplicationRoles)
  @JoinColumn({ name: 'roleRequired', referencedColumnName: 'id' })
  role: CoreApplicationRoles;
}
```

### 4.3 Changes from Current Definition

| Aspect | Before | After |
|--------|--------|-------|
| Imports | `Entity, PrimaryGeneratedColumn, Column` | Added `Index, ManyToOne, JoinColumn` |
| Class-level decorator | `@Entity` only | Added `@Index('IDX_minPriv_request_method', ['request', 'method'])` |
| Role relation | None | Added `@ManyToOne` to `CoreApplicationRoles` via `roleRequired` FK |
| Module registration | Not in any module | Must be added to `AuthModule` (see 4.4) |

### 4.4 Module Registration

The entity must be registered in the auth guard's module context. Since `PrivilegeGuard` is provided in `AuthModule`:

```typescript
// File: src/auth/auth.module.ts (the guards module, not the endpoints module)

import { CoreMinimumPrivileges } from '../database/entities/core-minimum-privileges.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CoreMinimumPrivileges]),
  ],
  // ...
})
export class AuthModule {}
```

### 4.5 PrivilegeGuard Refactored to Use Repository

```typescript
// File: src/auth/guards/privilege.guard.ts

import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoreMinimumPrivileges } from '../../database/entities/core-minimum-privileges.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { hasPrivilege } from '../helpers/privilege.helper';
import { ErrorMessages } from '../../shared/constants';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class PrivilegeGuard implements CanActivate {
  private readonly logger = new Logger(PrivilegeGuard.name);

  constructor(
    @InjectRepository(CoreMinimumPrivileges)
    private readonly minPrivRepo: Repository<CoreMinimumPrivileges>,
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user?.id) {
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
    }

    const routePath = request.route?.path || request.path;
    const method = request.method;

    try {
      // Query 1: Find minimum role required for this route + method
      const minPriv = await this.minPrivRepo.findOne({
        where: { request: routePath, method },
        relations: ['role'],
      });

      // If route is not registered, allow through (v3 behavior)
      if (!minPriv) {
        return true;
      }

      const roleRequired = minPriv.role?.name;
      if (!roleRequired || !minPriv.moduleId) {
        return true;
      }

      // Query 2: Get user's current role on this module
      const userPrivilege = await this.privilegesRepo.findOne({
        where: { userId: user.id, moduleId: minPriv.moduleId },
        relations: ['role'],
      });

      if (!userPrivilege?.role?.name) {
        throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE);
      }

      if (!hasPrivilege(userPrivilege.role.name, roleRequired)) {
        throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE);
      }

      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.error(`PrivilegeGuard error: ${(error as Error).message}`);
      throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
    }
  }
}
```

**Benefits of the refactored guard:**
- Eliminates raw SQL -- all queries go through TypeORM repository
- Uses the new `(request, method)` composite index on `core_minimum_privileges`
- Uses the new `(userId, moduleId)` composite index on `core_privileges`
- Leverages `relations: ['role']` for the JOIN instead of a subquery
- Fully testable with mock repositories (no `DataSource` mock needed)

---

## 5. Migration Strategy

### 5.1 Context

- `synchronize: false` and `migrationsRun: false` -- migrations are run manually.
- The project has migration scripts configured: `npm run migration:generate` / `migration:run`.
- No `data-source.ts` file exists yet (needed for the CLI). This must be created first.
- All changes are additive (indexes) or entity-level only (column mapping). **No DDL changes to column definitions or table structure.**

### 5.2 Migration Script

A single migration handles all index additions. This must run in a maintenance window or during low traffic since `CREATE INDEX` on MariaDB acquires a metadata lock.

```typescript
// File: src/database/migrations/<timestamp>-AddAuthIndexes.ts

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthIndexes<timestamp> implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── core_application_users ──────────────────────────────────────
    // Check if index exists before creating (idempotent)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_users_userName
      ON core_application_users (userName)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_users_email
      ON core_application_users (email)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_users_isDeleted
      ON core_application_users (isDeleted)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_users_email_isDeleted
      ON core_application_users (email, isDeleted)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_users_userName_isDeleted
      ON core_application_users (userName, isDeleted)
    `);

    // ── core_privileges ─────────────────────────────────────────────

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_privileges_userId_moduleId
      ON core_privileges (UserId, ModuleId)
    `);

    // ── core_application_refresh_token ──────────────────────────────

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_refreshToken_jwtId
      ON core_application_refresh_token (jwtId)
    `);

    // ── core_minimum_privileges ─────────────────────────────────────

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_minPriv_request_method
      ON core_minimum_privileges (request, method)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_userName ON core_application_users`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_email ON core_application_users`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_isDeleted ON core_application_users`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_email_isDeleted ON core_application_users`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_userName_isDeleted ON core_application_users`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_privileges_userId_moduleId ON core_privileges`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_refreshToken_jwtId ON core_application_refresh_token`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_minPriv_request_method ON core_minimum_privileges`);
  }
}
```

### 5.3 Deployment Order

The migration and code changes must be deployed in a specific order to avoid runtime errors:

```
Step 1: Run the migration (add indexes)
        - Indexes are additive; existing code works fine with or without them.
        - No downtime required for index creation on small tables.
        - For core_application_users (potentially large), use ALGORITHM=INPLACE if needed:
          ALTER TABLE core_application_users ADD INDEX ... , ALGORITHM=INPLACE, LOCK=NONE;

Step 2: Deploy entity changes (CorePrivileges naming fix + CoreMinimumPrivileges update)
        - The @Column({ name: 'UserId' }) mapping produces identical SQL.
        - TypeORM generates the same query regardless of TypeScript property name
          when the `name` option is specified.
        - Zero risk of runtime breakage.

Step 3: Deploy service code changes (camelCase property references)
        - Must deploy simultaneously with Step 2 (same build artifact).

Step 4: Deploy PrivilegeGuard refactor (raw SQL to repository)
        - Can be deployed with Step 2/3 or separately after.
        - The repository queries use the same indexes and produce equivalent SQL.
```

**Steps 2, 3, and 4 are all in the same build** -- they deploy together. Step 1 (the migration) should run before or simultaneously with the deployment.

### 5.4 Rollback Plan

- **Index migration**: Run `down()` method. Indexes are dropped. The application continues to work (just slower).
- **Entity naming**: Revert the git commit. The old PascalCase properties produce identical SQL since the DB column names never changed.
- **PrivilegeGuard**: Revert to the `DataSource.query()` version. The raw SQL still works.

### 5.5 Verification Queries

Run these after migration to confirm indexes exist:

```sql
-- Verify core_application_users indexes
SHOW INDEX FROM core_application_users;
-- Expected: PK + IDX_users_userName + IDX_users_email + IDX_users_isDeleted
--           + IDX_users_email_isDeleted + IDX_users_userName_isDeleted

-- Verify core_privileges index
SHOW INDEX FROM core_privileges;
-- Expected: PK + IDX_privileges_userId_moduleId

-- Verify core_application_refresh_token indexes
SHOW INDEX FROM core_application_refresh_token;
-- Expected: PK + userId_refreshTokenid_fk + IDX_refreshToken_jwtId

-- Verify core_minimum_privileges index
SHOW INDEX FROM core_minimum_privileges;
-- Expected: PK + IDX_minPriv_request_method

-- Test that the login query uses the index
EXPLAIN SELECT id, isLocked, email, userName, passwordHash, allowMultipleSessions, theme
FROM core_application_users
WHERE userName = 'test' AND isDeleted = 0;
-- Expected: key = IDX_users_userName_isDeleted

-- Test that the privilege query uses the index
EXPLAIN SELECT * FROM core_privileges WHERE UserId = 'test-uuid' AND ModuleId = 1;
-- Expected: key = IDX_privileges_userId_moduleId

-- Test that the logout query uses the index
EXPLAIN SELECT * FROM core_application_refresh_token WHERE jwtId = 'test-jti';
-- Expected: key = IDX_refreshToken_jwtId
```

---

## 6. Data Access Patterns & Repository Interfaces

### 6.1 CoreApplicationUsers Repository

Used by: `AuthService`, `UsersService`

```typescript
// Key query patterns the indexes now cover:

// Login (auth.service.ts:54-60)
// Uses: IDX_users_userName_isDeleted OR IDX_users_email_isDeleted (index merge)
usersRepo.createQueryBuilder('u')
  .where('(u.userName = :credential OR u.email = :credential) AND u.isDeleted = :deleted',
    { credential, deleted: false })
  .getOne();

// Refresh token user lookup (auth.service.ts:156-158)
// Uses: IDX_users_email
usersRepo.findOne({ where: { email: decoded.email } });

// Get user by ID (users.service.ts:124-126)
// Uses: PK (already indexed)
usersRepo.findOne({ where: { id, isDeleted: false } });

// Duplicate check on register (users.service.ts:50-61)
// Uses: IDX_users_userName_isDeleted, IDX_users_email_isDeleted (index merge)
usersRepo.createQueryBuilder('u')
  .where('(u.userName = :userName OR u.email = :email OR u.phoneNumber = :phoneNumber) AND u.isDeleted = :deleted')
  .getOne();

// Email uniqueness check (users.service.ts:202-209)
// Uses: IDX_users_email_isDeleted
usersRepo.createQueryBuilder('u')
  .where('u.email = :email AND u.id <> :userId AND u.isDeleted = :deleted')
  .getExists();

// Get all active users (users.service.ts:146-167)
// Uses: IDX_users_isDeleted
usersRepo.createQueryBuilder('u')
  .where('u.isDeleted = :deleted', { deleted: false })
  .getMany();

// Get emails (users.service.ts:187-193)
// Uses: IDX_users_isDeleted
usersRepo.find({ where: { isDeleted: false }, select: ['email'] });
```

### 6.2 CorePrivileges Repository

Used by: `AuthService`, `UsersService`, `RolesGuard` (raw SQL), `PrivilegeGuard` (raw SQL, to be refactored)

```typescript
// Key query patterns the composite index now covers:

// Can access module check (auth.service.ts:229-232)
// Uses: IDX_privileges_userId_moduleId (exact match)
privilegesRepo.findOne({
  where: { userId, moduleId: parseInt(moduleExists.id, 10) },
  relations: ['role'],
});

// Get all user privileges (users.service.ts:367)
// Uses: IDX_privileges_userId_moduleId (leading column prefix)
privilegesRepo.find({ where: { userId }, relations: ['role'] });

// Update user privilege (users.service.ts:385)
// Uses: IDX_privileges_userId_moduleId (exact match for WHERE clause)
privilegesRepo.update({ userId, moduleId }, { roleId });

// Get user role on module (users.service.ts:423-426)
// Uses: IDX_privileges_userId_moduleId (exact match)
privilegesRepo.findOne({
  where: { userId, moduleId: parseInt(mod.id, 10) },
  relations: ['role'],
});
```

### 6.3 CoreApplicationRefreshToken Repository

Used by: `AuthService`

```typescript
// Key query patterns:

// Logout - find by jwtId (auth.service.ts:123)
// Uses: IDX_refreshToken_jwtId (NEW)
refreshTokenRepo.findOne({ where: { jwtId: decoded.jti } });

// Active session check (auth.service.ts:82-88)
// Uses: userId_refreshTokenid_fk (EXISTING)
refreshTokenRepo.createQueryBuilder('rt')
  .where('rt.userId = :userId AND rt.invalidated = :inv AND rt.used = :used')
  .getExists();

// Find by ID for refresh flow (auth.service.ts:184)
// Uses: PK (already indexed)
refreshTokenRepo.findOne({ where: { id: refreshTokenId } });
```

### 6.4 CoreMinimumPrivileges Repository (NEW)

Used by: `PrivilegeGuard` (after refactor)

```typescript
// Route privilege lookup (privilege.guard.ts - refactored)
// Uses: IDX_minPriv_request_method
minPrivRepo.findOne({
  where: { request: routePath, method },
  relations: ['role'],
});
```

---

## 7. Impact Summary

### 7.1 Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `src/database/entities/core-application-users.entity.ts` | Add imports + decorators | Add `Index` import, add 5 `@Index` decorators to class |
| `src/database/entities/core-privileges.entity.ts` | Refactor | Add `Index` import, add `@Index` decorator, change 4 properties from PascalCase to camelCase with `name` mapping |
| `src/database/entities/core-application-refresh-token.entity.ts` | Add decorator | Add 1 class-level `@Index` decorator for `jwtId` |
| `src/database/entities/core-minimum-privileges.entity.ts` | Enhance | Add `Index, ManyToOne, JoinColumn` imports, add `@Index` decorator, add `role` relation |
| `src/modules/auth/auth.service.ts` | Property rename | Change `UserId` to `userId`, `ModuleId` to `moduleId` (1 location) |
| `src/modules/users/users.service.ts` | Property rename | Change `Id`/`UserId`/`RoleId`/`ModuleId` to camelCase (6 locations) |
| `src/modules/auth/auth.service.spec.ts` | Property rename | Update mock objects to use camelCase properties |
| `src/auth/guards/privilege.guard.ts` | Refactor | Replace `DataSource` + raw SQL with `Repository<CoreMinimumPrivileges>` + `Repository<CorePrivileges>` |
| `src/auth/auth.module.ts` | Registration | Add `CoreMinimumPrivileges` and `CorePrivileges` to `TypeOrmModule.forFeature()` |
| `src/database/migrations/<ts>-AddAuthIndexes.ts` | New file | Migration to add all 8 indexes |

### 7.2 Database Changes Summary

| Table | Indexes Added | DDL Risk |
|-------|--------------|----------|
| `core_application_users` | 5 | Low -- additive only, `CREATE INDEX IF NOT EXISTS` |
| `core_privileges` | 1 | Low -- additive only |
| `core_application_refresh_token` | 1 | Low -- additive only |
| `core_minimum_privileges` | 1 | Low -- additive only |
| **Total** | **8 new indexes** | **Zero schema-breaking changes** |

### 7.3 Performance Impact

| Operation | Before (no index) | After (with index) | Frequency |
|-----------|-------------------|-------------------|-----------|
| Login | Full table scan on `core_application_users` | Index seek on composite | Every login |
| Logout | Full table scan on `core_application_refresh_token` | Index seek on `jwtId` | Every logout |
| Privilege check | Full table scan on `core_privileges` | Index seek on composite | Every protected route |
| Route privilege | Full table scan on `core_minimum_privileges` | Index seek on composite | Every request through PrivilegeGuard |
| User registration | Full table scan for duplicate check | Index merge on composites | Every registration |
| Token refresh | Full table scan by email | Index seek on `email` | Every token refresh |

### 7.4 Storage Overhead

Estimated additional disk usage for indexes (assuming typical iMonitor deployment):

| Table | Est. Rows | Index Size Estimate |
|-------|-----------|-------------------|
| `core_application_users` | ~500 | ~50 KB (5 indexes, varchar columns) |
| `core_privileges` | ~5,000 | ~100 KB (1 composite index) |
| `core_application_refresh_token` | ~10,000 | ~200 KB (1 index on varchar) |
| `core_minimum_privileges` | ~100 | ~5 KB (1 composite index) |
| **Total** | | **~355 KB** |

Negligible overhead for significant query performance improvement.
