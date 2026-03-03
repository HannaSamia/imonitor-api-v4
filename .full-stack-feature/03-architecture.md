# Phase 3.1 - Backend Architecture: Auth & Users Module Refactoring

**Status**: Architecture Design
**Depends on**: [01-requirements.md](./01-requirements.md), [02-database-design.md](./02-database-design.md)
**Produces**: File-by-file implementation guide for all 49 findings

---

## Table of Contents

1. [Module Structure Refactoring](#1-module-structure-refactoring)
2. [@nestjs/jwt Integration](#2-nestjsjwt-integration)
3. [Security Fixes Architecture](#3-security-fixes-architecture)
4. [Performance Fixes Architecture](#4-performance-fixes-architecture)
5. [DTO Fixes](#5-dto-fixes)
6. [File-by-File Change Map](#6-file-by-file-change-map)
7. [Implementation Order](#7-implementation-order)

---

## 1. Module Structure Refactoring

### 1.1 Current Module Dependency Graph

```
AppModule
  +-- DatabaseModule           (TypeOrmModule.forRootAsync, autoLoadEntities: true)
  +-- AuthModule               (src/auth/auth.module.ts -- guards infrastructure)
  |     Provides: JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard
  |     Imports: (none -- guards use @InjectDataSource() directly)
  +-- SharedModule (@Global)   (services: DateHelper, Password, SystemConfig)
  |     Imports: TypeOrmModule.forFeature([CoreSysConfig])
  +-- AuthEndpointsModule      (src/modules/auth/auth.module.ts -- endpoints)
  |     Imports: TypeOrmModule.forFeature([Users, Roles, RefreshToken, Privileges, Modules])
  |     Provides: AuthService, AuthController
  +-- UsersModule
        Imports: TypeOrmModule.forFeature([Users, Roles, Privileges, Modules])
        Provides: UsersService, UsersController
```

**Problems identified:**
- `AuthEndpointsModule` and `UsersModule` both register `CoreApplicationUsers`, `CoreApplicationRoles`, `CorePrivileges`, and `CoreModules` via `TypeOrmModule.forFeature()` -- duplicate registration.
- `AuthModule` (guards) has zero imports -- guards use `@InjectDataSource()` for raw SQL instead of repositories.
- `UsersService` is a 560-line god service violating SRP (user CRUD, privilege management, password workflows, system settings).
- File name collision: `src/auth/auth.module.ts` (guards) vs. `src/modules/auth/auth.module.ts` (endpoints). The endpoints module already exports as `AuthEndpointsModule` class name but the file is still named `auth.module.ts`.

### 1.2 Target Module Dependency Graph

```
AppModule
  +-- DatabaseModule           (unchanged)
  +-- CoreDataModule (NEW)     (shared entity repos -- @Global)
  |     Imports: TypeOrmModule.forFeature([
  |       CoreApplicationUsers, CoreApplicationRoles,
  |       CoreApplicationRefreshToken, CorePrivileges,
  |       CoreModules, CoreMinimumPrivileges
  |     ])
  |     Exports: TypeOrmModule (re-export)
  +-- AuthModule               (src/auth/auth.module.ts -- guards infrastructure)
  |     Imports: CoreDataModule (for PrivilegeGuard + RolesGuard repo injection)
  |     Imports: JwtModule.registerAsync() (for JwtAuthGuard)
  |     Provides: JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard
  +-- SharedModule (@Global)   (unchanged -- DateHelper, Password, SystemConfig)
  |     Imports: TypeOrmModule.forFeature([CoreSysConfig])  (kept -- CoreSysConfig not in CoreDataModule)
  +-- AuthEndpointsModule      (src/modules/auth/auth-endpoints.module.ts -- RENAMED)
  |     Imports: CoreDataModule (replaces direct forFeature)
  |     Provides: AuthService, AuthController
  +-- UsersModule              (src/modules/users/users.module.ts)
        Imports: CoreDataModule (replaces direct forFeature)
        Provides: UsersService, UserPrivilegesService (NEW), UserPasswordService (NEW)
        Controllers: UsersController, SettingsController (NEW)
```

### 1.3 CoreDataModule Design

**File**: `src/database/core-data.module.ts` (NEW)

**Purpose**: Single source of truth for all entity repository registrations used by the Auth & Users modules. Eliminates duplicate `TypeOrmModule.forFeature()` calls. Marked `@Global()` so that any module in the application can inject these repositories without importing CoreDataModule explicitly.

**Entities registered:**

| Entity | Used By |
|--------|---------|
| `CoreApplicationUsers` | AuthService, UsersService, UserPasswordService, JwtAuthGuard |
| `CoreApplicationRoles` | AuthService, UsersService, UserPrivilegesService |
| `CoreApplicationRefreshToken` | AuthService, UserPasswordService |
| `CorePrivileges` | AuthService, UsersService, UserPrivilegesService, PrivilegeGuard, RolesGuard |
| `CoreModules` | AuthService, UsersService, UserPrivilegesService |
| `CoreMinimumPrivileges` | PrivilegeGuard |

**Design decision -- CoreSysConfig stays in SharedModule**: `CoreSysConfig` is only used by `SystemConfigService` in `SharedModule`. It has no cross-module sharing need beyond what `SharedModule` already provides. Moving it to `CoreDataModule` would create unnecessary coupling. It stays registered in `SharedModule`.

**Module definition:**

```
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoreApplicationUsers,
      CoreApplicationRoles,
      CoreApplicationRefreshToken,
      CorePrivileges,
      CoreModules,
      CoreMinimumPrivileges,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CoreDataModule {}
```

**Rationale for @Global()**: The guards in `AuthModule` are registered as `APP_GUARD` in `AppModule` -- they need access to repositories without explicit module imports. Making `CoreDataModule` global mirrors the pattern already established by `SharedModule`.

### 1.4 UsersService Split

The current `UsersService` (560 lines) handles four distinct concerns. It will be split into three focused services:

#### 1.4.1 UsersService (retained, trimmed)

**File**: `src/modules/users/users.service.ts`
**Estimated size**: ~200 lines
**Responsibility**: Pure user CRUD operations

**Methods retained:**
- `register(body, currentUserId)` -- user creation (privilege assignment moves to UserPrivilegesService call)
- `getUserById(id)`
- `getAll(excludeCurrentUser?, currentUserId?)`
- `getEmails()`
- `selfUpdate(userId, body)`
- `update(userId, currentUserId, body)`
- `delete(currentUserId, targetUserId)`
- `lock(currentUserId, targetUserId)`
- `unlock(currentUserId, targetUserId)`
- `themeUpdate(userId, theme)`

**Dependencies:**
- `Repository<CoreApplicationUsers>` (injected)
- `PasswordService` (for register)
- `DateHelperService`
- `UserPrivilegesService` (for register -- to assign default privileges)

**Change to register()**: The current `register()` method creates the user, then queries roles and modules to create privilege records. After the split, the privilege-creation block (`lines 93-108` in the current file) will be extracted to `UserPrivilegesService.assignDefaultPrivileges(userId)`. The `register()` method in `UsersService` will call this service after user creation, inside a transaction (see Section 4.3).

#### 1.4.2 UserPrivilegesService (NEW)

**File**: `src/modules/users/user-privileges.service.ts` (NEW)
**Estimated size**: ~250 lines
**Responsibility**: All privilege management operations

**Methods extracted from UsersService:**
- `getUserPrivileges(userId)` -- builds privilege tree (current line 363-374)
- `updateUserPrivileges(userId, body)` -- updates privilege tree (current line 378-387)
- `getUserRoleOnModule(userId, moduleName)` -- single module role lookup (current line 417-429)
- `getSideMenu(userId, theme)` -- builds filtered menu tree (current line 391-402)
- `assignDefaultPrivileges(userId)` -- extracted from register() (current lines 93-108)

**Private helpers moved along (no API change):**
- `groupModulesByParent(modules)`
- `buildTreeFromMaps(modulesByParent, privMap, parentId)`
- `buildMenuTreeFromMaps(modulesByParent, privMap, parentId, theme)`
- `collectPrivilegeUpdates(nodes, roleMap)`
- `mapRoleFlags(roleName)`

**Dependencies:**
- `Repository<CorePrivileges>` (injected)
- `Repository<CoreApplicationRoles>` (injected)
- `Repository<CoreModules>` (injected)

#### 1.4.3 UserPasswordService (NEW)

**File**: `src/modules/users/user-password.service.ts` (NEW)
**Estimated size**: ~80 lines
**Responsibility**: Password change and reset workflows, including refresh token invalidation

**Methods extracted from UsersService:**
- `changePassword(currentUserId, body)` -- current lines 266-293, **enhanced with refresh token invalidation**
- `resetPassword(currentUserId, targetUserId)` -- current lines 297-322, **enhanced with refresh token invalidation**

**Dependencies:**
- `Repository<CoreApplicationUsers>` (injected)
- `Repository<CoreApplicationRefreshToken>` (injected -- NEW, for token invalidation)
- `PasswordService`
- `DateHelperService`
- `EventEmitter2` (for password reset email event)

**New behavior -- refresh token invalidation on password change/reset (H-14):**

Both `changePassword()` and `resetPassword()` will invalidate all active refresh tokens for the target user after updating the password. This is a critical security fix -- without it, a compromised session can keep refreshing tokens even after the password is changed.

```
// After password update:
await this.refreshTokenRepo.update(
  { userId: targetUserId, invalidated: false, used: false },
  { invalidated: true },
);
```

This uses the existing `userId_refreshTokenid_fk` index on `core_application_refresh_token.userId`.

#### 1.4.4 SettingsController (NEW)

**File**: `src/modules/users/settings.controller.ts` (NEW)
**Estimated size**: ~30 lines
**Responsibility**: System configuration endpoints currently on UsersController

**Endpoints moved from UsersController:**
- `GET /api/v1/users/settings` -- `listSystemConfigurations()` (calls `SystemConfigService.getConfigValues()`)
- `GET /api/v1/users/settings/:name` -- `moduleSettings(name)` (calls `SystemConfigService.getSettingsByColumn()`)

**Route preservation**: The routes stay under `/api/v1/users/settings` for v3 parity. The controller is registered in `UsersModule` alongside `UsersController`. NestJS allows multiple controllers to share route prefixes -- `SettingsController` uses `@Controller('api/v1/users')` with routes `@Get('settings')` and `@Get('settings/:name')`.

**Design decision**: These endpoints do not touch user data at all. They delegate entirely to `SystemConfigService`. Placing them on `UsersController` was a v3 carryover. Separating them into `SettingsController` makes `UsersController` purely about user operations while preserving the exact route paths.

**Dependency**: `SystemConfigService` (already @Global via SharedModule -- no additional import needed).

### 1.5 AuthEndpointsModule Rename

**Current state**: `src/modules/auth/auth.module.ts` exports class `AuthEndpointsModule`. The class name is already correct -- the file name causes the collision.

**Change**: Rename the file from `auth.module.ts` to `auth-endpoints.module.ts`. This aligns the file name with the class name and eliminates any ambiguity with `src/auth/auth.module.ts`.

**Impact**: Only `src/app.module.ts` imports this module, and it already imports the class by name (`AuthEndpointsModule`), so only the `import ... from` path changes:

```
// Before
import { AuthEndpointsModule } from './modules/auth/auth.module';

// After
import { AuthEndpointsModule } from './modules/auth/auth-endpoints.module';
```

### 1.6 Updated UsersModule Registration

After the split, `UsersModule` registers the new services and controllers:

```
@Module({
  imports: [],  // CoreDataModule is @Global -- no explicit import needed
  controllers: [UsersController, SettingsController],
  providers: [UsersService, UserPrivilegesService, UserPasswordService],
  exports: [UsersService, UserPrivilegesService, UserPasswordService],
})
export class UsersModule {}
```

**Note**: The `TypeOrmModule.forFeature([...])` import is removed entirely from `UsersModule` because `CoreDataModule` is global. Same for `AuthEndpointsModule`.

---

## 2. @nestjs/jwt Integration

### 2.1 Installation

```bash
npm install @nestjs/jwt
```

The `jsonwebtoken` package remains as a transitive dependency of `@nestjs/jwt` -- it does not need to be uninstalled. However, all direct `import * as jwt from 'jsonwebtoken'` will be removed.

### 2.2 JwtModule Registration

**Location**: `src/auth/auth.module.ts` (the guards infrastructure module)

The `JwtModule` is registered here because:
1. `JwtAuthGuard` (global guard) needs `JwtService` for token verification
2. `AuthService` (in `AuthEndpointsModule`) needs `JwtService` for token signing and verification
3. Centralizing JWT configuration in one place prevents configuration drift

```
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_KEY'),
        signOptions: {
          algorithm: 'HS256',
        },
        verifyOptions: {
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard],
  exports: [JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard, JwtModule],
})
export class AuthModule {}
```

**Critical design decisions:**

| Decision | Rationale |
|----------|-----------|
| `algorithm: 'HS256'` in both `signOptions` and `verifyOptions` | Fixes the JWT algorithm confusion vulnerability. Prevents algorithm substitution attacks where an attacker could use `none` or switch to RS256 with the HMAC secret as a public key. |
| `JwtModule` exported from `AuthModule` | Allows `AuthEndpointsModule` to import `AuthModule` and get access to `JwtService` for token signing in `AuthService`. |
| `secret` set at module level, not per-call | Centralizes the key. Individual `sign()` and `verify()` calls no longer need to pass the secret. |
| `expiresIn` NOT set at module level | The token expiration is dynamic (read from `core_sys_config` via `SystemConfigService`). It must be passed per-call in `signOptions`. |

### 2.3 AuthService Migration (Token Signing)

**Current** (raw jsonwebtoken):
```typescript
import * as jwt from 'jsonwebtoken';

const token = jwt.sign(payload, jwtKey, {
  expiresIn: expiresInSeconds,
  subject: userId,
  jwtid: jwtId,
});
```

**After** (@nestjs/jwt):
```typescript
import { JwtService } from '@nestjs/jwt';

// In constructor:
constructor(
  private readonly jwtService: JwtService,
  // ... other deps
) {}

// In generateTokenAndRefreshToken():
const token = this.jwtService.sign(payload, {
  expiresIn: expiresInSeconds,
  subject: userId,
  jwtid: jwtId,
});
```

The `JwtService.sign()` method automatically uses the `secret` and `algorithm` from the module configuration. No need to pass them per-call.

**AuthService verification** (logout, refreshToken):

```typescript
// Before:
const decoded = jwt.verify(token, jwtKey, { ignoreExpiration: true }) as JwtPayload;

// After:
const decoded = this.jwtService.verify<JwtPayload>(token, { ignoreExpiration: true });
```

**getJwtKey() removal**: The private `getJwtKey()` helper in `AuthService` becomes unnecessary. The JWT key is configured centrally in `JwtModule.registerAsync()`. Remove the method entirely.

### 2.4 JwtAuthGuard Migration (Token Verification)

**Current flow:**
1. `jwt.decode(token)` to extract payload (no signature check)
2. Raw SQL query for `keepLogin` flag
3. If `keepLogin`, attach decoded payload and return (NO SIGNATURE VERIFICATION -- Critical bug)
4. If not `keepLogin`, `jwt.verify(token, jwtKey, { clockTolerance: 60 })`

**After flow:**
1. `jwtService.verify(token)` -- always verifies signature first
2. If verification fails with `TokenExpiredError`, check `keepLogin` via repository
3. If `keepLogin`, re-verify with `{ ignoreExpiration: true }` (still verifies signature)
4. Attach verified payload to request

```typescript
constructor(
  private readonly reflector: Reflector,
  private readonly jwtService: JwtService,
  @InjectRepository(CoreApplicationUsers)
  private readonly usersRepo: Repository<CoreApplicationUsers>,
) {}

async canActivate(context: ExecutionContext): Promise<boolean> {
  // 1. Check @Public()
  if (this.isPublicRoute(context)) return true;

  // 2. Extract token
  const request = context.switchToHttp().getRequest();
  const token = this.extractTokenFromHeader(request);
  if (!token) throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);

  // 3. Try normal verification (signature + expiration)
  try {
    const payload = this.jwtService.verify<JwtPayload>(token, {
      clockTolerance: 60,
    });
    request.user = payload;
    return true;
  } catch (error) {
    // 4. If expired, check keepLogin
    if (error?.name === 'TokenExpiredError') {
      return this.handleExpiredToken(request, token);
    }
    throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
  }
}

private async handleExpiredToken(request: any, token: string): Promise<boolean> {
  // Verify signature (ignore expiration) to get the payload safely
  let payload: JwtPayload;
  try {
    payload = this.jwtService.verify<JwtPayload>(token, {
      ignoreExpiration: true,
    });
  } catch {
    throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
  }

  if (!payload?.id) {
    throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
  }

  // Check keepLogin flag via repository (not raw SQL)
  const user = await this.usersRepo.findOne({
    where: { id: payload.id },
    select: ['id', 'keepLogin'],
  });

  if (user?.keepLogin) {
    request.user = payload;
    return true;
  }

  throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
}
```

**Key improvements:**
- Signature is ALWAYS verified (fixes CR-001 and CR-002)
- `keepLogin` only bypasses expiration, never signature
- Raw SQL replaced with TypeORM repository (fixes H-09)
- Dev bypass removed entirely (fixes CR-001)
- `@InjectDataSource()` replaced with `@InjectRepository(CoreApplicationUsers)`

### 2.5 AuthEndpointsModule Import Update

`AuthEndpointsModule` needs `JwtService` for `AuthService`. Since `AuthModule` now exports `JwtModule`, the endpoints module must import `AuthModule`:

```
@Module({
  imports: [AuthModule],  // gets JwtModule (re-exported) + guards
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthEndpointsModule {}
```

**Note**: The `TypeOrmModule.forFeature([...])` import is removed because `CoreDataModule` is global.

---

## 3. Security Fixes Architecture

### 3.1 CR-001 + CR-002: JwtAuthGuard -- Remove Dev Bypass and Always Verify Signatures

**Finding**: In non-production environments, the guard calls `jwt.decode()` (no signature check) and returns `true` even with invalid tokens. For `keepLogin` users, the guard calls `jwt.decode()` and skips `jwt.verify()` entirely.

**Fix**: Described fully in Section 2.4 above. Summary:
- Remove the entire `nodeEnv !== 'production' && nodeEnv !== 'test'` block (lines 32-48 of current guard)
- Always call `jwtService.verify()` first
- `keepLogin` only bypasses expiration via `{ ignoreExpiration: true }` -- signature is still checked
- No environment-conditional behavior remains in the guard

**Rationale for removing dev bypass entirely**: The v3 codebase did not have a dev bypass in its JWT middleware. This was added during v4 development for convenience. Removing it aligns with v3 behavior and eliminates the attack surface. Developers should use valid tokens in all environments.

### 3.2 H-01: PrivilegeGuard Deny-by-Default Discussion

**Current behavior**: If a route is not registered in `core_minimum_privileges`, the guard returns `true` (allow through).

**Decision: KEEP allow-through for v3 parity.**

The v3 `authorize()` middleware has identical behavior -- unregistered routes are allowed. Changing to deny-by-default would:
1. Break all routes not in `core_minimum_privileges` (including any newly added endpoints)
2. Require populating the table for every route before deployment
3. Violate the "no breaking changes" constraint

**Documented as intentionally deferred**: This is documented in the requirements as requiring a future Phase 4 migration where all routes are registered in `core_minimum_privileges` before flipping to deny-by-default.

**What we DO fix**: The raw SQL is replaced with TypeORM repositories (as designed in 02-database-design.md Section 4.5). The guard logic remains functionally identical.

### 3.3 H-02: Validate Refresh Token Even for keepLogin Users

**Finding**: In `AuthService.refreshToken()`, if `user.keepLogin` is true, the method skips ALL refresh token validation (lines 170-172) and immediately generates a new token pair.

**Current (dangerous):**
```typescript
if (user.keepLogin) {
  return this.generateTokenAndRefreshToken(user.id, user.email, user.userName, user.theme ?? 'light');
}
```

**Fix**: Move the `keepLogin` check AFTER the refresh token validation block. The `keepLogin` flag should only bypass the "token has not expired yet" check (lines 175-181), not the refresh token validation.

**After:**
```typescript
async refreshToken(body: RefreshTokenDto): Promise<AuthenticationResult> {
  const { token, refreshToken: refreshTokenId } = body;

  // Verify JWT signature (ignore expiration -- this is a refresh flow)
  let decoded: JwtPayload;
  try {
    decoded = this.jwtService.verify<JwtPayload>(token, { ignoreExpiration: true });
  } catch {
    throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
  }

  if (!decoded.email) {
    throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
  }

  // Fetch user
  const user = await this.usersRepo.findOne({
    where: { email: decoded.email },
    select: ['id', 'email', 'userName', 'allowMultipleSessions', 'theme', 'keepLogin'],
  });

  if (!user || !user.email || !user.userName) {
    throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
  }

  // *** ALWAYS validate the refresh token ***

  // Fetch refresh token
  const storedRefreshToken = await this.refreshTokenRepo.findOne({
    where: { id: refreshTokenId },
  });
  if (!storedRefreshToken) {
    throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
  }

  // Validate jwtId link
  if (!decoded.jti || storedRefreshToken.jwtId !== decoded.jti) {
    throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
  }

  // Check not expired
  if (new Date() > storedRefreshToken.expiryDate) {
    throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
  }

  // Check not used or invalidated
  if (storedRefreshToken.used || storedRefreshToken.invalidated) {
    throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
  }

  // keepLogin users bypass the "token hasn't expired yet" check
  // Non-keepLogin users must wait until token is near expiry
  if (!user.keepLogin) {
    if (decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      const gracePeriod = decoded.exp - 60;
      if (now < gracePeriod) {
        throw new BadRequestException(ErrorMessages.TOKEN_HAS_NOT_EXPIRED_YET);
      }
    }
  }

  // Mark old refresh token as used
  await this.refreshTokenRepo.update(storedRefreshToken.id, { used: true });

  // Generate new pair
  return this.generateTokenAndRefreshToken(user.id, user.email, user.userName, user.theme ?? 'light');
}
```

**Impact**: `keepLogin` users still get seamless token refresh (they can refresh anytime without waiting for expiry), but the refresh token itself is always validated. Prevents token reuse attacks and stolen refresh token exploitation.

### 3.4 H-03: Remove keepLogin/allowMultipleSessions from EditSelfDto

**Finding**: `EditSelfDto` allows users to set `keepLogin` and `allowMultipleSessions` on themselves. These are admin-only fields -- a regular user should not be able to grant themselves persistent login or multi-session access.

**Fix**: Remove the two fields from `EditSelfDto`:

```typescript
export class EditSelfDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MinLength(3) @Matches(/^[a-zA-Z0-9]+$/) firstName: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MinLength(3) @Matches(/^[a-zA-Z0-9]+$/) lastName: string;
  @ApiProperty() @IsEmail() @IsNotEmpty() email: string;
  @ApiProperty() @IsString() @IsNotEmpty() phoneNumber: string;
  // keepLogin: REMOVED
  // allowMultipleSessions: REMOVED
}
```

**Corresponding UsersService.selfUpdate() change**: Remove the conditional blocks that set `keepLogin` and `allowMultipleSessions` from the update data (current lines 223-228).

**Note**: `UpdateUserDto` (admin edit) retains both fields. Admins should be able to set these on other users.

### 3.5 H-04: Fix API Key Guard Non-Production Bypass

**Finding**: `ApiKeyGuard` returns `true` for all non-production environments, meaning API key validation is never tested during development.

**Fix**: Always validate the API key, regardless of environment. The guard becomes:

```typescript
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest();
  const apiKey = request.headers['access_token'];

  if (!apiKey) {
    throw new UnauthorizedException(ErrorMessages.UNAUTHORIZED);
  }

  try {
    const result = await this.sysConfigRepo.findOne({
      where: { confKey: SystemKeys.utilityApiKey },
    });

    if (!result) {
      this.logger.error('utilityApiKey not found in core_sys_config');
      throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
    }

    if (apiKey !== result.confVal) {
      throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
    }

    return true;
  } catch (error: unknown) {
    if (error instanceof UnauthorizedException) throw error;
    this.logger.error(`ApiKeyGuard error: ${(error as Error).message}`);
    throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
  }
}
```

**Additional changes:**
- Replace `@InjectDataSource()` + raw SQL with `@InjectRepository(CoreSysConfig)` (or use `SystemConfigService.getConfigValue()`)
- Remove `ConfigService` dependency (no longer checking `NODE_ENV`)

**Design choice -- SystemConfigService vs. direct repo**: Since `ApiKeyGuard` is in the infrastructure `AuthModule` and `SystemConfigService` is in `SharedModule` (which is `@Global`), we can inject `SystemConfigService` directly. This is cleaner and benefits from the TTL cache designed in Section 4.1. The guard becomes:

```typescript
constructor(
  private readonly systemConfigService: SystemConfigService,
) {}

async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest();
  const apiKey = request.headers['access_token'];

  if (!apiKey) {
    throw new UnauthorizedException(ErrorMessages.UNAUTHORIZED);
  }

  const storedKey = await this.systemConfigService.getConfigValue(SystemKeys.utilityApiKey);
  if (!storedKey) {
    this.logger.error('utilityApiKey not found in core_sys_config');
    throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
  }

  if (apiKey !== storedKey) {
    throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
  }

  return true;
}
```

### 3.6 H-14: Password Change Token Invalidation

Covered in Section 1.4.3 (UserPasswordService design). Both `changePassword()` and `resetPassword()` will invalidate all active refresh tokens for the target user.

### 3.7 JWT Algorithm Enforcement (HS256)

Covered in Section 2.2. The `JwtModule.registerAsync()` configuration explicitly sets `algorithm: 'HS256'` in both `signOptions` and `verifyOptions`. This prevents:
- Algorithm confusion attacks (attacker sets `alg: none`)
- RS256/HS256 confusion attacks
- Any algorithm not explicitly allowed

### 3.8 H-09: Convert Guard Raw SQL to TypeORM Repositories

**PrivilegeGuard**: Fully redesigned in 02-database-design.md Section 4.5. Replaces `@InjectDataSource()` with `@InjectRepository(CoreMinimumPrivileges)` and `@InjectRepository(CorePrivileges)`.

**RolesGuard**: Currently uses `@InjectDataSource()` for a complex EXISTS query. This will be refactored to use the repository pattern:

```typescript
constructor(
  private readonly reflector: Reflector,
  @InjectRepository(CorePrivileges)
  private readonly privilegesRepo: Repository<CorePrivileges>,
  @InjectRepository(CoreModules)
  private readonly modulesRepo: Repository<CoreModules>,
) {}

async canActivate(context: ExecutionContext): Promise<boolean> {
  // ... (reflector logic unchanged)

  // Find module by name
  const mod = await this.modulesRepo.findOne({ where: { name: moduleName } });
  if (!mod) {
    throw new ForbiddenException(ErrorMessages.UNAUTHORIZED);
  }

  // Check user has required role on this module
  const privilege = await this.privilegesRepo.findOne({
    where: { userId: user.id, moduleId: parseInt(mod.id, 10) },
    relations: ['role'],
  });

  if (!privilege?.role?.name) {
    throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE);
  }

  const userRoleName = privilege.role.name;
  const hasRequiredRole = requiredRoles.some(
    (requiredRole) => userRoleName === requiredRole,
  );

  if (!hasRequiredRole) {
    throw new ForbiddenException(ErrorMessages.UNAUTHORIZED_ROLE);
  }

  return true;
}
```

**Note on RolesGuard semantics**: The current raw SQL uses `IN` to check if the user's role matches ANY of the required roles (exact match). The refactored version preserves this exact-match semantics -- it checks if the user's role name matches any entry in the `requiredRoles` array. It does NOT use `hasPrivilege()` (which checks hierarchy), because `@Roles()` is for exact role requirement, while `PrivilegeGuard` uses `hasPrivilege()` for hierarchical checks.

**JwtAuthGuard**: Replaces `@InjectDataSource()` with `@InjectRepository(CoreApplicationUsers)` (covered in Section 2.4).

**ApiKeyGuard**: Replaces `@InjectDataSource()` with `SystemConfigService` injection (covered in Section 3.5).

---

## 4. Performance Fixes Architecture

### 4.1 H-05: SystemConfigService In-Memory TTL Cache

**Problem**: `SystemConfigService.getConfigValue()` hits the database on every call. It is called during every `generateTokenAndRefreshToken()` invocation (twice -- once for token expiry, once for refresh token expiry), meaning every login and every token refresh triggers 2 database queries for config values that rarely change.

**Design**: Add an in-memory `Map`-based TTL cache to `SystemConfigService`.

```typescript
@Injectable()
export class SystemConfigService {
  private static readonly VALID_SETTING_COLUMNS = new Set([...]);

  private readonly cache = new Map<string, { value: string; expiresAt: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(CoreSysConfig)
    private readonly sysConfigRepo: Repository<CoreSysConfig>,
  ) {}

  async getConfigValue(key: string): Promise<string | null> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    // Cache miss or expired -- fetch from DB
    const row = await this.sysConfigRepo.findOne({ where: { confKey: key } });
    const value = row?.confVal ?? null;

    if (value !== null) {
      this.cache.set(key, {
        value,
        expiresAt: Date.now() + SystemConfigService.CACHE_TTL_MS,
      });
    }

    return value;
  }

  async getConfigValues(keys: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const missingKeys: string[] = [];

    // Check cache for each key
    for (const key of keys) {
      const cached = this.cache.get(key);
      if (cached && Date.now() < cached.expiresAt) {
        result[key] = cached.value;
      } else {
        missingKeys.push(key);
      }
    }

    // Batch-fetch missing keys
    if (missingKeys.length > 0) {
      const rows = await this.sysConfigRepo.find({
        where: { confKey: In(missingKeys) },
      });
      for (const row of rows) {
        result[row.confKey] = row.confVal;
        this.cache.set(row.confKey, {
          value: row.confVal,
          expiresAt: Date.now() + SystemConfigService.CACHE_TTL_MS,
        });
      }
    }

    return result;
  }

  // getSettingsByColumn() is NOT cached -- it returns arrays and is called infrequently
  async getSettingsByColumn(columnName: string): Promise<CoreSysConfig[]> {
    // ... unchanged
  }

  /** Manual cache invalidation (for admin config updates in future phases) */
  clearCache(): void {
    this.cache.clear();
  }
}
```

**Why not Redis cache**: The config values are small (a few strings), process-local, and the TTL is short (5 minutes). A Redis roundtrip would be slower than an in-memory Map lookup. Redis caching is appropriate for shared cross-instance state, which is not needed here.

**Why 5-minute TTL**: Config values (token expiry, API key) change extremely rarely (admin operations only). A 5-minute TTL means at most a 5-minute lag between a config change and it taking effect. This is acceptable for the use case. The `clearCache()` method allows immediate invalidation when needed.

### 4.2 H-06: Batch Privilege Updates with Transaction

**Problem**: `updateUserPrivileges()` currently issues one `UPDATE` per module in a `for` loop (N queries for N modules, typically 20-40).

**Fix**: Group updates by `roleId`, then execute one `UPDATE` per distinct role using an `IN` clause, all within a transaction.

**Location**: `UserPrivilegesService.updateUserPrivileges()`

```typescript
async updateUserPrivileges(userId: string, body: UserPrivilegesDto[]): Promise<void> {
  const allRoles = await this.rolesRepo.find();
  const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));
  const updates = this.collectPrivilegeUpdates(body, roleMap);

  // Group by roleId for batch UPDATE
  const groupedByRole = new Map<string, number[]>();
  for (const { moduleId, roleId } of updates) {
    if (!groupedByRole.has(roleId)) groupedByRole.set(roleId, []);
    groupedByRole.get(roleId)!.push(moduleId);
  }

  // Execute in transaction
  await this.privilegesRepo.manager.transaction(async (manager) => {
    for (const [roleId, moduleIds] of groupedByRole) {
      await manager
        .createQueryBuilder()
        .update(CorePrivileges)
        .set({ roleId })
        .where('userId = :userId AND moduleId IN (:...moduleIds)', { userId, moduleIds })
        .execute();
    }
  });
}
```

**Performance impact**: Reduces N queries to R queries (where R is the number of distinct roles, typically 3-5). Wrapping in a transaction ensures atomicity -- either all privilege updates succeed or none do.

### 4.3 H-07: Registration Transaction

**Problem**: `register()` creates the user first, then creates privilege records. If privilege creation fails, the user exists without any privileges -- an inconsistent state.

**Fix**: Wrap user creation + default privilege assignment in a database transaction.

**Location**: `UsersService.register()`

```typescript
async register(body: CreateUserDto, currentUserId: string): Promise<UserResponseDto> {
  // ... validation (duplicate check) ...

  const userId = uuidv4();
  const now = this.dateHelper.currentDate();
  const passwordHash = await this.passwordService.hashPassword(body.password);

  // Wrap user creation + privilege assignment in a transaction
  await this.usersRepo.manager.transaction(async (manager) => {
    const user = manager.create(CoreApplicationUsers, {
      id: userId,
      firstName: body.firstName,
      lastName: body.lastName,
      userName: body.userName,
      email: body.email,
      passwordHash,
      phoneNumber: body.phoneNumber,
      isLocked: false,
      keepLogin: body.keepLogin,
      allowMultipleSessions: body.allowMultipleSessions,
      isDeleted: false,
      createdBy: currentUserId,
      createdOn: now,
    });
    await manager.save(user);

    // Delegate privilege assignment (passes transaction manager)
    await this.userPrivilegesService.assignDefaultPrivileges(userId, manager);
  });

  return {
    id: userId,
    firstName: body.firstName,
    lastName: body.lastName,
    userName: body.userName,
    email: body.email,
    phoneNumber: body.phoneNumber,
  };
}
```

**UserPrivilegesService.assignDefaultPrivileges()** accepts an optional `EntityManager` to participate in the caller's transaction:

```typescript
async assignDefaultPrivileges(userId: string, manager?: EntityManager): Promise<void> {
  const em = manager ?? this.privilegesRepo.manager;
  const defaultRole = await em.findOne(CoreApplicationRoles, { where: { name: AvailableRoles.DEFAULT } });
  if (!defaultRole) return;

  const allModules = await em.find(CoreModules, {});
  const privileges = allModules.map((mod) =>
    em.create(CorePrivileges, {
      id: uuidv4(),
      userId,
      roleId: defaultRole.id,
      moduleId: parseInt(mod.id, 10),
    }),
  );

  if (privileges.length > 0) {
    await em.save(privileges);
  }
}
```

### 4.4 M-09: canAccessModule Parallelization

**Problem**: `AuthService.canAccessModule()` executes three sequential queries: role lookup, module lookup, then privilege lookup. The role and module lookups are independent.

**Fix**: Parallelize the role and module lookups with `Promise.all()`:

```typescript
async canAccessModule(userId: string, body: CanAccessModuleDto): Promise<void> {
  const { role, module } = body;

  // Parallel: role + module lookups are independent
  const [roleExists, moduleExists] = await Promise.all([
    this.rolesRepo.findOne({ where: { name: role } }),
    this.modulesRepo.findOne({ where: { name: module } }),
  ]);

  if (!roleExists) {
    throw new BadRequestException(ErrorMessages.ROLE_NOT_FOUND);
  }
  if (!moduleExists) {
    throw new BadRequestException(ErrorMessages.MODULE_NOT_FOUND);
  }

  // Sequential: privilege lookup depends on moduleExists.id
  const privilege = await this.privilegesRepo.findOne({
    where: { userId, moduleId: parseInt(moduleExists.id, 10) },
    relations: ['role'],
  });

  const userRole = privilege?.role?.name;
  if (!userRole || !hasPrivilege(userRole, role)) {
    throw new BadRequestException(ErrorMessages.UNAUTHORIZED_ROLE);
  }
}
```

### 4.5 M-10: Cache Roles and Modules Reference Data

**Problem**: `CoreApplicationRoles` and `CoreModules` are reference data tables that rarely change. They are queried repeatedly by:
- `AuthService.canAccessModule()` (every access check)
- `UsersService.register()` (every registration)
- `UserPrivilegesService.getUserPrivileges()`, `getSideMenu()`, `updateUserPrivileges()`

**Design**: Add a `ReferenceDataCacheService` in `SharedModule` that caches roles and modules with a 10-minute TTL.

**File**: `src/shared/services/reference-data-cache.service.ts` (NEW)

```
@Injectable()
export class ReferenceDataCacheService {
  private rolesCache: { data: CoreApplicationRoles[]; expiresAt: number } | null = null;
  private modulesCache: { data: CoreModules[]; expiresAt: number } | null = null;
  private static readonly TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    @InjectRepository(CoreApplicationRoles) private rolesRepo: Repository<CoreApplicationRoles>,
    @InjectRepository(CoreModules) private modulesRepo: Repository<CoreModules>,
  ) {}

  async getRoles(): Promise<CoreApplicationRoles[]> { /* cache-through */ }
  async findRoleByName(name: string): Promise<CoreApplicationRoles | null> { /* filter cached */ }
  async getModules(): Promise<CoreModules[]> { /* cache-through */ }
  async findModuleByName(name: string): Promise<CoreModules | null> { /* filter cached */ }
  clearCache(): void { /* manual invalidation */ }
}
```

**Usage**: Services that currently do `this.rolesRepo.findOne({ where: { name } })` or `this.modulesRepo.find()` will inject `ReferenceDataCacheService` instead of the raw repositories. This eliminates repeated DB hits for static reference data.

**Dependency impact**: `CoreDataModule` must be imported in `SharedModule` (or `ReferenceDataCacheService` must be placed in a module that has access to these repositories). Since `CoreDataModule` is `@Global`, `SharedModule` automatically has access.

**Alternative considered -- not chosen**: Caching inside each service (UsersService, AuthService) would create duplicate caches and inconsistent invalidation. A centralized cache service is cleaner.

### 4.6 Database Indexes

All 8 indexes designed in 02-database-design.md. No additional architecture beyond what is documented there.

---

## 5. DTO Fixes

### 5.1 M-02: ChangePasswordDto -- Add MinLength/MaxLength

**Current**: Only `@IsString()` and `@IsNotEmpty()` -- accepts any non-empty string as a password.

**Fix**: Add `@MinLength(6)` and `@MaxLength(30)` to match `CreateUserDto.password` constraints:

```typescript
export class ChangePasswordDto {
  @ApiProperty({ description: 'New password', minLength: 6, maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(30)
  password: string;

  @ApiProperty({ description: 'Confirm new password', minLength: 6, maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(30)
  confirmPassword: string;

  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;
}
```

### 5.2 M-12: UserPrivilegesDto Split

**Problem**: `UserPrivilegesDto` is used for both input (update privileges) and output (get privileges, get side menu). The output includes fields like `icon`, `color`, `font`, `path`, `isUser`, `isSuperUser`, `isAdmin`, `toggle` -- none of which are needed on input. Validation decorators on output-only fields add unnecessary overhead.

**Decision: Keep single DTO for v3 parity.**

The v3 frontend sends the full privilege tree back on update, including all output fields. Splitting into separate input/output DTOs would require the frontend to strip fields, which violates the "no breaking changes" constraint.

**What we DO fix**: Add a comment documenting the dual-use nature:

```typescript
/**
 * Shared input/output DTO for user privilege tree nodes.
 *
 * Used as OUTPUT by: getUserPrivileges(), getSideMenu()
 * Used as INPUT by: updateUserPrivileges()
 *
 * On INPUT, only `id` (moduleId), `roleName`, and `children` are consumed.
 * All other fields are ignored by the service but are validated to match
 * the v3 frontend contract which sends the complete tree back.
 *
 * Splitting into separate Input/Output DTOs is deferred until the v3
 * frontend is retired, as it would constitute a breaking API change.
 */
export class UserPrivilegesDto { ... }
```

### 5.3 M-13: Response Format Standardization

**Problem**: Some controller methods return `{ message, result }`, others return `{ result }`, and some return `{ result: null }`. The `TransformInterceptor` handles the wrapping, but the inconsistency makes the codebase harder to maintain.

**Fix**: Standardize all controller return values to `{ message, result }`:

| Endpoint | Current | After |
|----------|---------|-------|
| `GET /users` | `{ result }` | `{ message: '200_SUCCESS', result }` |
| `GET /users/all` | `{ result }` | `{ message: '200_SUCCESS', result }` |
| `GET /users/emails` | `{ result }` | `{ message: '200_SUCCESS', result }` |
| `GET /users/me` | `{ result }` | `{ message: '200_SUCCESS', result }` |
| `GET /users/settings` | `{ result }` | `{ message: '200_SUCCESS', result }` |
| `GET /users/settings/:name` | `{ result }` | `{ message: '200_SUCCESS', result }` |
| `GET /users/sidemenu` | `{ result }` | `{ message: '200_SUCCESS', result }` |
| `GET /users/module/:name/role` | `{ result }` | `{ message: '200_SUCCESS', result }` |
| `GET /users/:id` | `{ result }` | `{ message: '200_SUCCESS', result }` |
| `GET /users/:id/privileges` | `{ result }` | `{ message: '200_SUCCESS', result }` |
| `PUT /users/theme` | `{ result: null }` | `{ message: '200_SUCCESS', result: null }` |
| `PUT /users` | `{ result: null }` | `{ message: '200_SUCCESS', result: null }` |
| `PUT /users/:id` | `{ result: null }` | `{ message: '200_SUCCESS', result: null }` |
| `PUT /users/:id/privileges` | `{ result: null }` | `{ message: '200_SUCCESS', result: null }` |
| `PUT /users/:id/lock` | `{ result: null }` | `{ message: '200_SUCCESS', result: null }` |
| `PUT /users/:id/unlock` | `{ result: null }` | `{ message: '200_SUCCESS', result: null }` |
| `PATCH /users/resetpassword` | `{ result: null }` | `{ message: '200_SUCCESS', result: null }` |
| `PATCH /users/changepassword/:id` | `{ result: null }` | `{ message: '200_SUCCESS', result: null }` |
| `DELETE /users/:id` | `{ result: null }` | `{ message: '200_SUCCESS', result: null }` |

**Wire format impact**: NONE. The `TransformInterceptor` already handles both formats:
- If handler returns `{ message, result }`: uses the message directly
- If handler returns only `{ result }`: derives message from status code (always `'200_SUCCESS'` for 200)

The wire format is identical either way. This change is purely for codebase consistency.

### 5.4 M-16: Document Duplicate refreshToken/refreshTokenTimer

`POST /api/v1/auth/token` and `POST /api/v1/auth/token/timer` are identical endpoints calling the same `AuthService.refreshToken()` method. This is v3 parity -- the v3 frontend uses both paths. Document with a comment:

```typescript
/**
 * Duplicate of /token -- v3 frontend uses both paths.
 * The "timer" variant is called by the frontend's automatic
 * token refresh timer. Functionally identical.
 */
@Post('token/timer')
```

### 5.5 M-17: Register Returns 200

`POST /api/v1/users/register` uses `@HttpCode(HttpStatus.OK)` (200) instead of the RESTful 201. This is v3 parity. Document with a comment:

```typescript
/**
 * Returns 200 instead of 201 for v3 frontend parity.
 * The v3 frontend checks for status 200 on registration responses.
 */
@Post('register')
@HttpCode(HttpStatus.OK)
```

---

## 6. File-by-File Change Map

### 6.1 New Files

| # | File Path | Description |
|---|-----------|-------------|
| N1 | `src/database/core-data.module.ts` | CoreDataModule -- shared entity repository registration. Registers 6 entities via TypeOrmModule.forFeature(), marked @Global(), exports TypeOrmModule. |
| N2 | `src/modules/users/user-privileges.service.ts` | UserPrivilegesService -- privilege tree operations extracted from UsersService. Methods: getUserPrivileges, updateUserPrivileges, getUserRoleOnModule, getSideMenu, assignDefaultPrivileges + private helpers. |
| N3 | `src/modules/users/user-password.service.ts` | UserPasswordService -- password workflows extracted from UsersService. Methods: changePassword, resetPassword. Adds refresh token invalidation (H-14). |
| N4 | `src/modules/users/settings.controller.ts` | SettingsController -- system configuration endpoints moved from UsersController. Routes: GET /api/v1/users/settings, GET /api/v1/users/settings/:name. |
| N5 | `src/shared/services/reference-data-cache.service.ts` | ReferenceDataCacheService -- in-memory TTL cache for CoreApplicationRoles and CoreModules reference data. |
| N6 | `src/database/migrations/<timestamp>-AddAuthIndexes.ts` | Database migration adding 8 indexes (see 02-database-design.md Section 5). |
| N7 | `src/modules/users/user-privileges.service.spec.ts` | Unit tests for UserPrivilegesService. |
| N8 | `src/modules/users/user-password.service.spec.ts` | Unit tests for UserPasswordService. |
| N9 | `src/modules/auth/auth.controller.spec.ts` | Unit tests for AuthController. |
| N10 | `src/modules/users/users.controller.spec.ts` | Unit tests for UsersController. |

### 6.2 Modified Files

| # | File Path | Change Description |
|---|-----------|-------------------|
| M1 | `src/app.module.ts` | Add `CoreDataModule` to imports. Update import path for `AuthEndpointsModule` from `./modules/auth/auth.module` to `./modules/auth/auth-endpoints.module`. |
| M2 | `src/auth/auth.module.ts` | Add `JwtModule.registerAsync()` import with HS256 config. Add `CoreDataModule` import (though @Global, explicit for clarity is optional). Export `JwtModule`. Remove direct DataSource dependency from guards. |
| M3 | `src/auth/guards/jwt-auth.guard.ts` | Complete rewrite: remove dev bypass, remove raw `jsonwebtoken` import, inject `JwtService` + `Repository<CoreApplicationUsers>`, always verify signature, handle keepLogin as ignoreExpiration only after signature check. Remove `ConfigService` dependency (no NODE_ENV check). Remove `@InjectDataSource()`. |
| M4 | `src/auth/guards/privilege.guard.ts` | Replace `@InjectDataSource()` + raw SQL with `@InjectRepository(CoreMinimumPrivileges)` + `@InjectRepository(CorePrivileges)`. Use findOne with relations instead of subqueries. (Full design in 02-database-design.md Section 4.5.) |
| M5 | `src/auth/guards/roles.guard.ts` | Replace `@InjectDataSource()` + raw SQL with `@InjectRepository(CorePrivileges)` + `@InjectRepository(CoreModules)`. Two-step: find module by name, then find user privilege on that module. |
| M6 | `src/auth/guards/api-key.guard.ts` | Remove NODE_ENV bypass. Replace `@InjectDataSource()` + raw SQL with `SystemConfigService` injection. Remove `ConfigService` dependency. |
| M7 | `src/modules/auth/auth.service.ts` | Replace `import * as jwt from 'jsonwebtoken'` with `JwtService` injection. Update `generateTokenAndRefreshToken()` to use `jwtService.sign()`. Update `logout()` and `refreshToken()` to use `jwtService.verify()`. Remove `getJwtKey()` helper. Fix refreshToken() keepLogin bypass (H-02): always validate refresh token. Parallelize canAccessModule (M-09). Update CorePrivileges property references to camelCase. Inject `ReferenceDataCacheService` for roles/modules lookups. |
| M8 | `src/modules/users/users.service.ts` | Remove privilege methods (getUserPrivileges, updateUserPrivileges, getUserRoleOnModule, getSideMenu, assignDefaultPrivileges block in register). Remove password methods (changePassword, resetPassword). Remove settings methods (listSystemConfigurations, moduleSettings). Remove all private helpers (groupModulesByParent, buildTreeFromMaps, buildMenuTreeFromMaps, collectPrivilegeUpdates, mapRoleFlags). Add `UserPrivilegesService` dependency for register(). Wrap register() in transaction. Update CorePrivileges property references to camelCase. Remove `Repository<CoreApplicationRoles>`, `Repository<CoreModules>` injections (no longer needed). Remove `SystemConfigService` injection (no longer needed). Update selfUpdate() to remove keepLogin/allowMultipleSessions handling (H-03). |
| M9 | `src/modules/users/users.controller.ts` | Remove settings endpoints (moved to SettingsController). Update privilege endpoint to delegate to `UserPrivilegesService`. Update password endpoints to delegate to `UserPasswordService`. Standardize all return values to `{ message, result }` pattern. |
| M10 | `src/modules/users/users.module.ts` | Remove `TypeOrmModule.forFeature([...])` import (CoreDataModule is @Global). Add `UserPrivilegesService`, `UserPasswordService` to providers/exports. Add `SettingsController` to controllers. |
| M11 | `src/modules/auth/auth-endpoints.module.ts` | **RENAMED** from `auth.module.ts`. Remove `TypeOrmModule.forFeature([...])` import. Add `AuthModule` import (for JwtModule re-export). |
| M12 | `src/database/entities/core-application-users.entity.ts` | Add 5 `@Index` decorators (IDX_users_userName, IDX_users_email, IDX_users_isDeleted, IDX_users_email_isDeleted, IDX_users_userName_isDeleted). Add `Index` to imports. |
| M13 | `src/database/entities/core-privileges.entity.ts` | Add `@Index('IDX_privileges_userId_moduleId', ['userId', 'moduleId'])`. Rename PascalCase properties to camelCase with `@Column({ name: 'OriginalName' })` mapping: `Id`->`id`, `UserId`->`userId`, `RoleId`->`roleId`, `ModuleId`->`moduleId`. Add `Index` to imports. |
| M14 | `src/database/entities/core-application-refresh-token.entity.ts` | Add `@Index('IDX_refreshToken_jwtId', ['jwtId'])` class-level decorator. |
| M15 | `src/database/entities/core-minimum-privileges.entity.ts` | Add `@Index('IDX_minPriv_request_method', ['request', 'method'])`. Add `@ManyToOne` relation to `CoreApplicationRoles` via `roleRequired` FK. Add `Index, ManyToOne, JoinColumn` to imports. |
| M16 | `src/shared/services/system-config.service.ts` | Add in-memory TTL cache (Map-based). Update `getConfigValue()` and `getConfigValues()` to check cache first. Add `clearCache()` method. |
| M17 | `src/shared/shared.module.ts` | Add `ReferenceDataCacheService` to providers and exports. (No new import needed since CoreDataModule is @Global.) |
| M18 | `src/modules/users/dto/change-password.dto.ts` | Add `@MinLength(6)` and `@MaxLength(30)` to `password` and `confirmPassword` fields. Add `MinLength, MaxLength` to imports. |
| M19 | `src/modules/users/dto/update-user.dto.ts` | Remove `keepLogin` and `allowMultipleSessions` from `EditSelfDto` (retain in `UpdateUserDto`). Remove associated `@IsOptional`, `@IsBoolean`, `ApiPropertyOptional` for those fields. |
| M20 | `src/modules/users/dto/user-privileges.dto.ts` | Add documentation comment explaining dual input/output use. No structural changes. |
| M21 | `src/modules/auth/auth.service.spec.ts` | Update mock objects for CorePrivileges camelCase properties. Update jwt mock to use JwtService mock instead of `jsonwebtoken`. Add tests for keepLogin refresh bypass fix. Add missing branch tests (refreshToken, logout, login). |
| M22 | `src/modules/users/users.service.spec.ts` | Update mock objects for CorePrivileges camelCase properties. Remove tests for methods moved to UserPrivilegesService and UserPasswordService. Add tests for register() transaction behavior. Add tests for selfUpdate() without keepLogin/allowMultipleSessions. |
| M23 | `src/modules/users/dto/index.ts` | No change needed (exports are already correct). |
| M24 | `src/auth/interfaces/jwt-payload.interface.ts` | No change needed. |

### 6.3 Deleted Files

| # | File Path | Reason |
|---|-----------|--------|
| D1 | `src/modules/auth/auth.module.ts` | Renamed to `auth-endpoints.module.ts` (M11). Git will track as rename if content is similar enough. |

### 6.4 Unchanged Files (In Scope but No Changes Needed)

| File Path | Reason |
|-----------|--------|
| `src/shared/services/password.service.ts` | No changes required. |
| `src/shared/services/date-helper.service.ts` | No changes required. |
| `src/shared/interceptors/transform.interceptor.ts` | No changes required -- already handles both `{ message, result }` and bare data. |
| `src/shared/filters/global-exception.filter.ts` | No changes required. |
| `src/shared/constants/error-messages.ts` | No changes required (preserve v3 messages including typos). |
| `src/shared/constants/system-keys.ts` | No changes required. |
| `src/shared/constants/index.ts` | No changes required. |
| `src/auth/helpers/privilege.helper.ts` | No changes required. |
| `src/auth/decorators/public.decorator.ts` | No changes required. |
| `src/auth/decorators/current-user.decorator.ts` | No changes required. |
| `src/auth/decorators/roles.decorator.ts` | No changes required. |
| `src/auth/decorators/module-name.decorator.ts` | No changes required. |
| `src/database/database.module.ts` | No changes required. |
| `src/database/entities/core-application-roles.entity.ts` | No changes required. |
| `src/database/entities/core-modules.entity.ts` | No changes required. |
| `src/database/entities/core-sys-config.entity.ts` | No changes required. |
| `src/modules/auth/dto/login.dto.ts` | No changes required. |
| `src/modules/auth/dto/refresh-token.dto.ts` | No changes required. |
| `src/modules/auth/dto/can-access-module.dto.ts` | No changes required. |
| `src/modules/auth/dto/index.ts` | No changes required. |
| `src/modules/users/dto/create-user.dto.ts` | No changes required. |
| `src/modules/users/dto/change-theme.dto.ts` | No changes required. |
| `src/modules/users/dto/user-response.dto.ts` | No changes required. |
| `src/modules/users/dto/body-id.dto.ts` | No changes required. |

---

## 7. Implementation Order

The implementation must follow a strict dependency order to avoid breaking changes. Each step should result in a compilable, testable state.

### Step 1: Install @nestjs/jwt

```bash
npm install @nestjs/jwt
```

**Validation**: `npm run build` -- should succeed (no code changes yet).

### Step 2: Create CoreDataModule

Create `src/database/core-data.module.ts` (N1).

Add `CoreDataModule` to `AppModule` imports.

**Validation**: `npm run build` -- should succeed. Existing modules still have their own `TypeOrmModule.forFeature()` registrations (redundant but not conflicting).

### Step 3: Update Entity Files

Apply changes to entities (M12, M13, M14, M15):
- Add `@Index` decorators to `CoreApplicationUsers`, `CorePrivileges`, `CoreApplicationRefreshToken`, `CoreMinimumPrivileges`
- Rename `CorePrivileges` PascalCase properties to camelCase with `@Column({ name })` mapping

**DO NOT** update service code yet -- the entity changes are purely declarative (`synchronize: false`).

**Validation**: `npm run build` -- will FAIL because service code still references PascalCase properties. Proceed immediately to Step 4.

### Step 4: Update Service Code for camelCase

Update all PascalCase references in service code (M7 partial, M8 partial):
- `auth.service.ts`: `UserId` -> `userId`, `ModuleId` -> `moduleId` (1 location)
- `users.service.ts`: `Id` -> `id`, `UserId` -> `userId`, `RoleId` -> `roleId`, `ModuleId` -> `moduleId` (6 locations)
- `auth.service.spec.ts`: Update mock objects (M21 partial)
- `users.service.spec.ts`: Update mock objects (M22 partial)

**Validation**: `npm run build` AND `npm run test` -- both should pass. The application is functionally identical; only TypeScript property names changed (SQL is identical due to `@Column({ name })` mapping).

### Step 5: Create Database Migration

Create `src/database/migrations/<timestamp>-AddAuthIndexes.ts` (N6).

**Validation**: Migration file compiles. Actual migration execution is a deployment step, not a code step. The application works with or without the indexes.

### Step 6: Refactor Guards

This is the highest-risk step because guards are global. Implement in sub-steps:

**6a. Update AuthModule** (M2):
- Add `JwtModule.registerAsync()` with HS256 config
- Export `JwtModule`

**6b. Refactor JwtAuthGuard** (M3):
- Remove dev bypass entirely
- Replace `jsonwebtoken` with `JwtService`
- Replace `@InjectDataSource()` with `@InjectRepository(CoreApplicationUsers)`
- Implement verify-first, then keepLogin fallback pattern

**6c. Refactor PrivilegeGuard** (M4):
- Replace `@InjectDataSource()` with `@InjectRepository(CoreMinimumPrivileges)` + `@InjectRepository(CorePrivileges)`
- Use findOne with relations

**6d. Refactor RolesGuard** (M5):
- Replace `@InjectDataSource()` with `@InjectRepository(CorePrivileges)` + `@InjectRepository(CoreModules)`

**6e. Refactor ApiKeyGuard** (M6):
- Remove NODE_ENV bypass
- Replace `@InjectDataSource()` with `SystemConfigService`

**Validation**: `npm run build` AND `npm run test`. Manual testing of login/logout/heartbeat flow recommended due to global guard impact.

### Step 7: Add SystemConfigService Cache

Update `SystemConfigService` (M16) with in-memory TTL cache.

**Validation**: `npm run build` AND `npm run test`. Cache is transparent -- existing behavior unchanged, just faster.

### Step 8: Create ReferenceDataCacheService

Create `src/shared/services/reference-data-cache.service.ts` (N5).
Update `SharedModule` (M17) to register the new service.

**Validation**: `npm run build` -- should succeed. Service exists but is not yet consumed.

### Step 9: Split UsersService

This is the second highest-risk step. Implement in sub-steps:

**9a. Create UserPrivilegesService** (N2):
- Extract privilege methods and all private helpers
- Wire up repository injections

**9b. Create UserPasswordService** (N3):
- Extract password methods
- Add `Repository<CoreApplicationRefreshToken>` for token invalidation
- Implement refresh token invalidation in both changePassword and resetPassword

**9c. Create SettingsController** (N4):
- Move settings endpoints from UsersController

**9d. Trim UsersService** (M8):
- Remove extracted methods
- Add `UserPrivilegesService` dependency for register()
- Wrap register() in transaction
- Remove unused repository injections

**9e. Update UsersController** (M9):
- Remove settings endpoints
- Update privilege endpoints to use `UserPrivilegesService`
- Update password endpoints to use `UserPasswordService`
- Standardize return format

**9f. Update UsersModule** (M10):
- Remove `TypeOrmModule.forFeature()` import
- Register new services and SettingsController

**Validation**: `npm run build` AND `npm run test`. All existing 29 tests should pass after updating mocks.

### Step 10: Update AuthService and AuthEndpointsModule

**10a. Update AuthService** (M7):
- Replace `jsonwebtoken` with `JwtService`
- Fix refreshToken() keepLogin bypass
- Parallelize canAccessModule()
- Integrate ReferenceDataCacheService for roles/modules lookups

**10b. Rename and update AuthEndpointsModule** (M11, D1):
- Rename file from `auth.module.ts` to `auth-endpoints.module.ts`
- Remove `TypeOrmModule.forFeature()` import
- Import `AuthModule` (for JwtModule access)

**10c. Update AppModule import path** (M1):
- Update import from `./modules/auth/auth.module` to `./modules/auth/auth-endpoints.module`

**Validation**: `npm run build` AND `npm run test`.

### Step 11: Update DTOs

**11a.** Update `ChangePasswordDto` (M18) -- add MinLength/MaxLength
**11b.** Update `EditSelfDto` (M19) -- remove keepLogin/allowMultipleSessions
**11c.** Update `UserPrivilegesDto` (M20) -- add documentation comment

**Validation**: `npm run build` AND `npm run test`.

### Step 12: Update and Expand Tests

**12a.** Update existing tests for all refactoring changes (M21, M22)
**12b.** Create `UserPrivilegesService` tests (N7)
**12c.** Create `UserPasswordService` tests (N8)
**12d.** Create `AuthController` tests (N9)
**12e.** Create `UsersController` tests (N10)

**Validation**: `npm run test` -- all tests pass, no regressions.

### Step 13: Final Verification

1. `npm run build` -- zero errors
2. `npm run lint` -- zero warnings
3. `npm run test` -- all tests pass
4. Manual smoke test: login -> heartbeat -> sidemenu -> logout -> token refresh

---

## Appendix A: Finding-to-File Cross Reference

Every finding from the requirements is mapped to the file(s) that address it.

| Finding | Severity | Files | Section |
|---------|----------|-------|---------|
| CR-001: JwtAuthGuard dev bypass | Critical | M3 | 3.1, 2.4 |
| CR-002: keepLogin JWT signature bypass | Critical | M3 | 3.1, 2.4 |
| CR-003: Auth module naming collision | Critical | M11, D1, M1 | 1.5 |
| H-01: PrivilegeGuard deny-by-default | High | M4 (documented) | 3.2 |
| H-02: keepLogin refresh bypass | High | M7 | 3.3 |
| H-03: EditSelfDto keepLogin/allowMultipleSessions | High | M19, M8 | 3.4 |
| H-04: API key guard non-prod bypass | High | M6 | 3.5 |
| H-05: SystemConfig caching | High | M16 | 4.1 |
| H-06: Batch privilege updates | High | N2 | 4.2 |
| H-07: Registration transaction | High | M8 | 4.3 |
| H-08: Split UsersService | High | M8, N2, N3, N4 | 1.4 |
| H-09: Guard raw SQL to TypeORM | High | M3, M4, M5, M6 | 3.8 |
| H-10: CoreDataModule | High | N1, M1, M10, M11 | 1.3 |
| H-11: Logout GET (v3 parity) | High | (no change) | documented |
| H-14: Token invalidation on password change | High | N3 | 3.6, 1.4.3 |
| M-02: ChangePasswordDto MinLength/MaxLength | Medium | M18 | 5.1 |
| M-05/M-06: Pagination getAll/getEmails | Medium | M8 (deferred -- v3 parity) | (out of scope for Phase 3.1) |
| M-07: Users entity indexes | Medium | M12, N6 | 4.6 |
| M-08: Privileges composite index | Medium | M13, N6 | 4.6 |
| M-09: canAccessModule parallelization | Medium | M7 | 4.4 |
| M-10: Cache roles/modules | Medium | N5, M17 | 4.5 |
| M-11: RefreshToken jwtId index | Medium | M14, N6 | 4.6 |
| M-12: UserPrivilegesDto split | Medium | M20 (documented) | 5.2 |
| M-13: Response format standardization | Medium | M9 | 5.3 |
| M-16: Document duplicate refreshToken/Timer | Medium | M7 (comment) | 5.4 |
| M-17: Register 200 (v3 parity) | Medium | M9 (comment) | 5.5 |
| @nestjs/jwt adoption | Architecture | M2, M3, M7, M11 | 2.x |
| JWT algorithm enforcement (HS256) | Security | M2 | 2.2, 3.7 |

## Appendix B: Module Dependency Matrix (After Refactoring)

| Module | Imports | Providers | Exports | Controllers |
|--------|---------|-----------|---------|-------------|
| `CoreDataModule` (@Global) | TypeOrmModule.forFeature([6 entities]) | -- | TypeOrmModule | -- |
| `SharedModule` (@Global) | TypeOrmModule.forFeature([CoreSysConfig]) | DateHelperService, PasswordService, SystemConfigService, ReferenceDataCacheService | DateHelperService, PasswordService, SystemConfigService, ReferenceDataCacheService | -- |
| `AuthModule` (guards) | JwtModule.registerAsync() | JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard | JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard, JwtModule | -- |
| `AuthEndpointsModule` | AuthModule | AuthService | AuthService | AuthController |
| `UsersModule` | -- | UsersService, UserPrivilegesService, UserPasswordService | UsersService, UserPrivilegesService, UserPasswordService | UsersController, SettingsController |

## Appendix C: Deferred Items (Documented, Not Fixed)

| Item | Reason for Deferral | Future Phase |
|------|---------------------|--------------|
| PrivilegeGuard deny-by-default | v3 parity -- would break unregistered routes | Phase 4 |
| UserPrivilegesDto input/output split | v3 frontend sends full tree on update | Post-v3 frontend retirement |
| Pagination for getAll/getEmails | v3 frontend does not pass pagination params | Phase 4 |
| Account enumeration fix | Would change v3 error messages | Phase 4 |
| Rate limiting | Requires infrastructure decisions (Redis, config) | Phase 4 |
| Register returning 201 | v3 frontend checks for 200 | Post-v3 frontend retirement |
| Logout changing to POST | v3 frontend calls GET /logout | Post-v3 frontend retirement |
