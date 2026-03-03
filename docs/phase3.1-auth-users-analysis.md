# Phase 3.1 — Auth & Users: v3 Code Analysis

> Complete mapping of all authentication and user management code in `imonitor-v3-api/`.
> Source files, endpoints, service methods, DB queries, middleware, Socket.IO auth, and DTOs.

---

## Table of Contents

1. [Endpoint Inventory](#1-endpoint-inventory)
2. [Auth Service — Methods & SQL](#2-auth-service)
3. [Users Service — Methods & SQL](#3-users-service)
4. [Repositories](#4-repositories)
5. [Middleware Stack](#5-middleware-stack)
6. [JWT & Token Logic](#6-jwt--token-logic)
7. [Socket.IO Authentication](#7-socketio-authentication)
8. [Database Schema](#8-database-schema)
9. [DTOs](#9-dtos)
10. [Enums & Constants](#10-enums--constants)
11. [Utility Classes](#11-utility-classes)
12. [Error Messages](#12-error-messages)
13. [DI Bindings](#13-di-bindings)
14. [Request Flows](#14-request-flows)

---

## 1. Endpoint Inventory

### 1.1 Auth Endpoints (`/api/v1/auth/`)

**File:** `src/application/api/v1/auth/auth.routes.ts`

| # | Method | Path | Handler | Middleware | Request Body | Response |
|---|--------|------|---------|------------|-------------|----------|
| 1 | POST | `/login` | `AuthController.login()` | `validate(loginSchema)` | `{credential, password}` | `{token, refreshToken}` |
| 2 | POST | `/token` | `AuthController.refreshToken()` | `validate(refreshTokenSchema)` | `{token, refreshToken}` | `{token, refreshToken}` |
| 3 | POST | `/token/timer` | `AuthController.refreshToken()` | `validate(refreshTokenSchema)` | `{token, refreshToken}` | `{token, refreshToken}` |
| 4 | GET | `/logout` | `AuthController.logout()` | `jwtMiddleware` | — (JWT in header) | `{message: "LOUGOUT_SUCCESSFUL"}` |
| 5 | GET | `/heartbeat` | `AuthController.heartbeat()` | `jwtMiddleware` | — (JWT in header) | `{result: userId}` |
| 6 | POST | `/access` | `AuthController.canAccessModule()` | `jwtMiddleware`, `validate(canAccessSchema)` | `{role, module}` | `{message: "HAS_ACCESS_PRIVILIGE"}` |

### 1.2 User Endpoints (`/api/v1/users/`)

**File:** `src/application/api/v1/users/users.routes.ts`

All routes use `jwtMiddleware` + `authorize` (dynamic role check) unless noted.

| # | Method | Path | Handler | Extra Middleware | Request | Response |
|---|--------|------|---------|-----------------|---------|----------|
| 1 | POST | `/register` | `register()` | `validate(registerUserSchema)` | Body: CreateUserDto | `UserDto` |
| 2 | GET | `/` | `usersWithoutCurrent()` | — | — | `UserDto[]` |
| 3 | GET | `/all` | `users()` | — | — | `UserDto[]` |
| 4 | GET | `/emails` | `userInfo()` | — | — | `string[]` (emails) |
| 5 | GET | `/me` | `getUser()` | — | userId from JWT | `UserDto` |
| 6 | GET | `/settings` | `systemSettings()` | — | — | `Params` (key-value) |
| 7 | GET | `/settings/:name` | `getModuleSettings()` | `validate(nameParamSchema)` | Param: name | `Params` |
| 8 | GET | `/sidemenu` | `sideMenu()` | — | userId from JWT | `UserPrivilegesDTO[]` |
| 9 | GET | `/module/:name/role` | `moduleRole()` | `validate(nameParamSchema)` | Param: name | `{result: roleName}` |
| 10 | GET | `/:id` | `getUser()` | `validate(idParamSchema)` | Param: id | `UserDto` |
| 11 | PUT | `/theme` | `theme()` | `validate(changeThemeSchema)` | `{theme: "dark"|"light"}` | Success |
| 12 | PUT | `/` | `Edit()` | `validate(editUserBodySchema)` | `BasicUserDto` | Success |
| 13 | PUT | `/:id` | `updateOtherUser()` | `validate(updateOtherUserSchema)` | `UpdateUserDto` | Success |
| 14 | PUT | `/:id/privileges` | `UpdatePriviliges()` | `validate(idParam + updatePrivilegesBody)` | `UserPrivilegesDTO[]` | Success |
| 15 | PUT | `/:id/lock` | `lockUser()` | `validate(IdInBodyAndParamSchema)` | `{id}` | Success |
| 16 | PUT | `/:id/unlock` | `unlockUser()` | `validate(IdInBodyAndParamSchema)` | `{id}` | Success |
| 17 | PATCH | `/resetpassword` | `changePassword()` | `validate(changePasswordSchema)` | `ChangePasswordDTO` | Success |
| 18 | PATCH | `/changepassword/:id` | `changeOtherUserPassword()` | `validate(idParamSchema)` | `{id}` | Success |
| 19 | DELETE | `/:id` | `delete()` | `validate(idParamSchema)` | Param: id | Success |

**Total: 6 auth + 19 user = 25 endpoints**

---

## 2. Auth Service

**File:** `src/infrastructure/services/auth.service.ts`
**Interface:** `IAuthService`

### 2.1 `login(body: LoginDTO): Promise<AuthenticationDTO>`

**Business Logic:**
1. Query user by `userName` or `email` (AND `isDeleted=0`)
2. Check user exists → `INVALID_CREDENTIALS`
3. Check `isLocked` → `ACCOUNT_LOCKED`
4. Verify password via `PasswordHash.isPasswordValid(password, passwordHash)`  → `INVALID_CREDENTIALS`
5. Check existing active refresh tokens if `allowMultipleSessions=false` → `ONLY_ONE_SESSION_ALLOWED`
6. Update `lastLogin` timestamp
7. Generate JWT + refresh token via `JwtHelper.generateTokenAndRefreshToken()`

**SQL:**
```sql
-- Fetch user
SELECT id, isLocked, email, userName, passwordHash, allowMultipleSessions, theme
FROM core_application_users
WHERE (userName = ? OR email = ?) AND isDeleted = 0

-- Check active sessions
SELECT EXISTS(
  SELECT 1 FROM core_application_refresh_token
  WHERE userId = ? AND Invalidated = 0 AND Used = 0
) AS recordExists

-- Update lastLogin
UPDATE core_application_users SET lastLogin = ? WHERE id = ?
```

### 2.2 `logout(token: string, userId: string): Promise<boolean>`

**Business Logic:**
1. Validate JWT (ignoreExpiration=true)
2. Fetch refresh token by jwtId
3. Check not already used/invalidated
4. Set `Invalidated=true`
5. Update `lastLogout` timestamp

**SQL:**
```sql
SELECT id, used, invalidated FROM core_application_refresh_token WHERE jwtId = ?
UPDATE core_application_refresh_token SET Invalidated = true WHERE id = ?
UPDATE core_application_users SET lastLogout = ? WHERE id = ?
```

### 2.3 `refreshToken(body: AuthenticationDTO): Promise<AuthenticationDTO>`

**Business Logic:**
1. Validate JWT (ignoreExpiration=true), extract email
2. Fetch user by email, check `keepLogin` flag
3. If `keepLogin=true` → generate new pair immediately
4. If `keepLogin=false`:
   - Extract JWT exp claim
   - If current time < (exp - 1 minute) → `TOKEN_HAS_NOT_EXPIRED_YET`
5. Fetch refresh token, validate:
   - jwtId matches JWT's jti
   - Not expired
   - Not used/invalidated
6. Mark old refresh token as `used=1`
7. Generate new JWT + refresh token pair

**SQL:**
```sql
SELECT id, email, userName, allowMultipleSessions, theme, keepLogin
FROM core_application_users WHERE email = ?

SELECT jwtId, expiryDate, used, invalidated
FROM core_application_refresh_token WHERE id = ?

UPDATE core_application_refresh_token SET used = 1 WHERE id = ?
```

### 2.4 `canAccessModule(userId, role, module): Promise<void>`

**Business Logic:**
1. Validate role exists in `core_application_roles`
2. Validate module exists in `core_modules`
3. Get user's role for the module from `core_privileges`
4. Compare via `hasMinimumAccessPrivilege()` → `UNAUTHORIZED_ROLE`

**SQL:**
```sql
SELECT EXISTS(SELECT * FROM core_application_roles WHERE name = ?) AS recordExists
SELECT EXISTS(SELECT * FROM core_modules WHERE name = ?) AS recordExists

SELECT r.name as role FROM core_application_roles as r
WHERE r.id = (
  SELECT p.roleId FROM core_privileges as p
  WHERE p.moduleId = (SELECT id FROM core_modules WHERE name = ?)
  AND p.userId = ?
)
```

### 2.5 `hasMinimumAccessPrivilege(userRole, minimumRole): boolean`

| minimumRole | Passes for |
|-------------|-----------|
| `superadmin` | superadmin only |
| `admin` | admin, superadmin |
| `superuser` | superuser, admin, superadmin |
| `user` | user, superuser, admin, superadmin |
| `N/A` (default) | any role |

---

## 3. Users Service

**File:** `src/infrastructure/services/users.service.ts`
**Interface:** `IUsersService`

### 3.1 `register(body: CreateUserDto, currentUserId): Promise<UserDto>`

1. Check user doesn't exist (by userName, email, phoneNumber)
2. Hash password via bcrypt (salt=10)
3. Insert user with UUID, `isLocked=false`, `isDeleted=0`
4. Grant default privileges: insert one `core_privileges` row per module with role=`N/A`

**SQL:**
```sql
-- Check existence
SELECT EXISTS(SELECT id FROM core_application_users
WHERE userName = ? OR email = ? OR phoneNumber = ?) AS recordExists

-- Insert user
INSERT INTO core_application_users
(id, firstName, lastName, isLocked, keepLogin, allowMultipleSessions,
 userName, email, passwordHash, phoneNumber, createdBy, createdOn, isDeleted)
VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 0)

-- Get default role ID
SELECT id FROM core_application_roles WHERE name = 'N/A'

-- Get all module IDs
SELECT id FROM core_modules

-- Bulk insert default privileges
INSERT INTO core_privileges (id, userId, roleId, moduleId) VALUES (?, ?, ?, ?)
-- (one row per module)
```

### 3.2 `getUserById(id): Promise<UserDto>`

```sql
SELECT firstName, lastName, email, phoneNumber, userName, theme
FROM core_application_users WHERE id = ? AND isDeleted = 0
```

### 3.3 `getAll(withoutCurrent?, currentUserId?): Promise<UserDto[]>`

```sql
SELECT id, firstName, lastName, email, phoneNumber, userName, isLocked, keepLogin, allowMultipleSessions
FROM core_application_users
WHERE isDeleted = '0' [AND id <> ?]
ORDER BY firstname
```

### 3.4 `getEmails(): Promise<string[]>`

Same as getAll but returns only email field.

### 3.5 `selfUpdate(userId, user: BasicUserDto): Promise<boolean>`

1. Check email uniqueness (excluding self)
2. Update user fields

```sql
SELECT EXISTS(SELECT * FROM core_application_users WHERE email = ? AND id <> ?) AS recordExists
UPDATE core_application_users SET firstName=?, lastName=?, phoneNumber=?, email=?, modifiedOn=? WHERE id=?
```

### 3.6 `update(userId, currentUserId, user: UpdateUserDto): Promise<boolean>`

Same as selfUpdate + includes `allowMultipleSessions`, `keepLogin`, `modifiedBy`.

### 3.7 `changePassword(currentUserId, body: ChangePasswordDTO): Promise<boolean>`

1. Validate `password === confirmPassword`
2. Fetch current passwordHash, verify old password
3. Hash new password, update

```sql
SELECT passwordHash FROM core_application_users WHERE id = ?
UPDATE core_application_users SET passwordHash = ? WHERE id = ?
```

### 3.8 `resetPassword(currentUserId, userId): Promise<boolean>`

1. Generate random password
2. Hash it
3. Update user's passwordHash
4. Send email with new password via `MailerService.sendResetPasswordEmail()`

```sql
SELECT firstName, lastName, email FROM core_application_users WHERE id = ?
UPDATE core_application_users SET passwordHash = ? WHERE id = ?
```

### 3.9 `delete(currentUserId, userId): Promise<void>`

Soft delete with audit trail.

```sql
UPDATE core_application_users
SET isDeleted = true, deletedBy = ?, deletedOn = ?, modifiedBy = ?, modifiedOn = ?
WHERE id = ?
```

### 3.10 `lock(currentUserId, userId, isLocked): Promise<void>`

```sql
UPDATE core_application_users SET isLocked = ?, modifiedBy = ?, modifiedOn = ? WHERE id = ?
```

### 3.11 `getUserPrivileges(userId): Promise<UserPrivilegesDTO[]>`

Builds hierarchical privilege tree recursively:

```sql
-- Get root modules
SELECT id, pId, isMenuItem, priority, name, nestedLevel, icon, path, darkColor, lightColor, font, isNode
FROM core_modules WHERE pId = 0 ORDER BY priority

-- For each module, get user's role
SELECT name FROM core_application_roles
WHERE id = (SELECT roleId FROM core_privileges WHERE moduleId = ? AND userId = ?)

-- Get child modules (recursive)
SELECT id, pId, isMenuItem, priority, name, nestedLevel, icon, path, darkColor, lightColor, font, isNode
FROM core_modules WHERE pId = ? ORDER BY priority
```

Maps role name to boolean flags: `isUser`, `isSuperUser`, `isAdmin`.

### 3.12 `updateUserPriviliges(userId, body: UserPrivilegesDTO[]): Promise<void>`

Recursively updates each module's role:

```sql
SELECT id FROM core_application_roles WHERE name = ?
UPDATE core_privileges SET roleId = ? WHERE userId = ? AND moduleId = ?
```

### 3.13 `getSideMenu(userId): Promise<UserPrivilegesDTO[]>`

Same as getUserPrivileges but filters to `isMenuItem=1` and modules where user has a non-default role or module `isDefault=1`.

### 3.14 `moduleSettings(moduleName): Promise<Params>`

```sql
SELECT confKey, confVal, description FROM core_sys_config WHERE [moduleName]Setting = 1
```

### 3.15 `getUserRoleOnModule(userId, module): Promise<string>`

```sql
SELECT r.name as role FROM core_application_roles as r
WHERE r.id = (
  SELECT p.roleId FROM core_privileges as p
  WHERE p.moduleId = (SELECT id FROM core_modules WHERE name = ?)
  AND p.userId = ?
)
```

### 3.16 `listSystemConfigurations(): Promise<Params>`

```sql
SELECT confKey, confVal FROM core_sys_config
WHERE confKey IN ('maxDaysCompare','maxHoursCompare','maxMonthCompare','maxWeekCompare','maxYearCompare')
```

### 3.17 `themeUpdate(theme, currentUserId): Promise<void>`

```sql
UPDATE core_application_users SET theme = ? WHERE id = ?
```

---

## 4. Repositories

### 4.1 TokenRepository

**File:** `src/infrastructure/repositories/token.repository.ts`

| Method | SQL | Notes |
|--------|-----|-------|
| `createRefreshToken(jwtId, userId)` | `INSERT INTO core_application_refresh_token (id, jwtId, userId, used, invalidated, expiryDate, createdOn) VALUES (...)` | Expiry from `core_sys_config.rtokenExpiryInMinutes` |
| `fetchRefreshToken(token)` | `SELECT jwtId, expiryDate, used, invalidated FROM core_application_refresh_token WHERE jwtId = ?` | Extracts jti from JWT first |
| `invalidateRefreshToken(id)` | `UPDATE core_application_refresh_token SET Invalidated = true WHERE id = ?` | Called on logout |

### 4.2 UsersRepository

**File:** `src/infrastructure/repositories/user.repository.ts`

| Method | SQL | Notes |
|--------|-----|-------|
| `isUserExists(userName, email, phone)` | `SELECT EXISTS(SELECT id FROM core_application_users WHERE userName=? OR email=? OR phoneNumber=?) AS recordExists` | |
| `createUser(user, currentUserId)` | `INSERT INTO core_application_users (...) VALUES (...)` | Returns generated UUID |
| `listUsers(fields, excludeCurrent?, id?)` | `SELECT [fields] FROM core_application_users WHERE isDeleted='0' ORDER BY firstname` | |
| `retriveRoleId(name)` | `SELECT id FROM core_application_roles WHERE name = ?` | Validates against AvailableRoles enum |
| `addBlockedIp(ip)` | `INSERT INTO core_rate_limiter (ipAddress, createdAt) VALUES (?, ?)` | |
| `processMaliciousRequest(data)` | Insert into `core_malicious_requests` + count per IP per day | Returns false if >10/day |

### 4.3 Base Repository

**File:** `src/infrastructure/repositories/base/Repository.ts`

Generic CRUD: `find`, `findOne`, `create`, `insert`, `bulkInsert`, `updateById`, `update`, `removeById`, `exists`. All parameterized with `?` placeholders. Database name from `process.env.coreDbName`.

### 4.4 SystemRepository

**File:** `src/infrastructure/repositories/system.repository.ts`

| Method | Purpose |
|--------|---------|
| `retriveSystemValue(key)` | Gets single value from `core_sys_config` |
| `restriveSetting(columnName)` | Gets settings group by column flag |

---

## 5. Middleware Stack

### 5.1 Global Middleware (order)

| # | Middleware | File | Purpose |
|---|-----------|------|---------|
| 1 | `compression` | (npm) | Response gzip |
| 2 | `helmet` | (npm) | Security headers |
| 3 | `cors` | (npm) | CORS |
| 4 | `rateLimiterMiddleware` | `middleware/rateLimiter.middleware.ts` | 200 req/60s per IP, Redis-backed |
| 5 | `requestFilterMiddleware` | `middleware/requestFilter.middleware.ts` | SQL injection / traversal detection |
| 6 | `morgan` | (npm) | HTTP logging |
| 7 | `express.json` | (npm) | Body parser (50MB limit) |
| 8 | `express.urlencoded` | (npm) | URL-encoded parser |
| 9 | `requestArchiveMiddleware` | `middleware/requestArchive.middleware.ts` | All requests → `core_requests_archive` |
| 10 | Route handlers | per-route | + per-route auth middleware |
| 11 | `errorHandlerMiddleware` | `middleware/error-handler.middleware.ts` | Global error handler |

### 5.2 Per-Route Auth Middleware

| Middleware | File | Purpose |
|-----------|------|---------|
| `jwtMiddleware` | `middleware/jwt.middleware.ts` | Validate JWT; skip expiry if `keepLogin=true` |
| `authorize` | `middleware/authorize.middleware.ts` | Dynamic: query `core_minimum_privileges` for required role |
| `strictAuthorize(roles, module)` | `middleware/authorize.middleware.ts` | Static: require specific roles for specific module |
| `keyAuthorisation` | `middleware/keyAuthorisation.middleware.ts` | API key validation via `access_token` header |
| `validate(schema)` | (express-validator) | Request body/param validation |

### 5.3 JWT Middleware Detail

```
1. Extract token from Authorization: Bearer <token>
2. Extract userId from token payload
3. Query DB: SELECT keepLogin FROM core_application_users WHERE id = ?
4. If keepLogin=true → skip expiry check, call next()
5. If keepLogin=false → JwtHelper.isTokenValid(token, false)
6. If invalid → 401 UnauthorizedError
7. Only active in production/test environments
```

### 5.4 Authorization Middleware Detail

**`authorize(req, resp, next)`:**
```
1. Extract route path + HTTP method
2. Query: SELECT moduleId, roleRequired FROM core_minimum_privileges WHERE request=? AND method=?
3. If no matching rule → next() (allow)
4. Query user's role: SELECT role FROM core_application_roles WHERE id=(SELECT roleId FROM core_privileges WHERE moduleId=? AND userId=?)
5. hasPrivilege(userRole, minimumRole) → next() or BadRequestError("UNAUTHORIZED_ROLE")
```

### 5.5 Request Archive Middleware

Logs to `core_requests_archive` table:
- `endpoint`, `payload` (stringified body), `userId`, `type` (HTTP method), `requestDate`, `host`
- Captures both authenticated requests (userId from token) and login/logout (userId from credential field)
- Falls back to local JSON files if DB unavailable

---

## 6. JWT & Token Logic

**File:** `src/core/utils/jwt.util.ts`

### 6.1 Token Configuration

| Setting | Value/Source |
|---------|-------------|
| Algorithm | HS256 |
| Secret | `process.env.JWT_KEY` (base64-encoded) |
| Clock tolerance | 60 seconds |
| Token expiry | `core_sys_config.tokenExpiryInMinutes` (DB) |
| Refresh token expiry | `core_sys_config.rtokenExpiryInMinutes` (DB) |

### 6.2 JWT Payload Structure

```typescript
{
  id: string;          // User UUID (also used as sub)
  email: string;
  credential: string;  // userName
  theme: string;       // "dark" | "light"
  iat: number;         // Issued at (auto)
  exp: number;         // Expiration (auto)
  sub: string;         // Subject = user ID
  jti: string;         // Unique JWT ID (UUID)
}
```

### 6.3 JwtHelper Methods

| Method | Purpose |
|--------|---------|
| `generateTokenAndRefreshToken(userId, email, userName, theme)` | Create JWT + DB refresh token record |
| `isTokenValid(token, ignoreExpiration?)` | Verify signature + expiry |
| `getJwtId(token)` | Extract `jti` claim |
| `getTokenExp(token)` | Extract `exp` claim |
| `getJwtPayloadValueByKey(token, key, ignoreExpiration?)` | Extract any claim |
| `isRefreshTokenLinkedToToken(refreshToken, jwtId)` | Verify jwtId match |
| `isRefreshTokenExpired(refreshToken)` | Check expiryDate > now |
| `isRefreshTokenUsedOrInvalidated(refreshToken)` | Check used OR invalidated flags |

---

## 7. Socket.IO Authentication

### 7.1 Connection Auth Pattern

All 6 Socket.IO namespaces use the same auth pattern:

```typescript
this._namespace.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!JwtHelper.isTokenValid(token, false)) {
    next(new UnauthorizedError());
  } else {
    next();
  }
});
```

- Token passed via `socket.handshake.auth.token`
- No expiry bypassing (`ignoreExpiration=false`)
- Rejection = `UnauthorizedError`

### 7.2 Namespaces

| Handler | Namespace | Auth | User Tracking |
|---------|-----------|------|---------------|
| NotificationHandler | `/notifications` | JWT | Redis: `notifications:{socketId}` |
| DashboardHandler | `/dashboard` | JWT | Redis: `dashboard:{socketId}` |
| ConnectivityHandler | `/connectivities` | JWT | Redis: `connectivities:{socketId}` |
| EtlHandler | `/etl` | JWT | Redis |
| ObservabilityHandler | `/observability` | JWT | Redis |
| ObservabilityAlertsHandler | `/observability-alerts` | JWT | Redis |

**File:** `src/application/socket/RegisterHandlers.ts`

---

## 8. Database Schema

### 8.1 `core_application_users`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | varchar(64) | NOT NULL | `''` | PK, UUID |
| `firstName` | varchar(64) | NULL | NULL | |
| `lastName` | varchar(64) | NULL | NULL | |
| `userName` | varchar(64) | NULL | NULL | Unique (enforced in code) |
| `email` | varchar(64) | NULL | NULL | Unique (enforced in code) |
| `passwordHash` | varchar(100) | NULL | NULL | bcrypt hash |
| `phoneNumber` | varchar(64) | NULL | NULL | |
| `isLocked` | tinyint(1) | NOT NULL | — | Blocks login |
| `keepLogin` | tinyint(1) | NOT NULL | — | Skip JWT expiry |
| `allowMultipleSessions` | tinyint(1) | NOT NULL | — | Allow concurrent sessions |
| `isDeleted` | tinyint(1) | NOT NULL | `0` | Soft delete |
| `theme` | enum('dark','light') | NULL | `'light'` | UI preference |
| `lastLogin` | datetime(1) | NULL | NULL | |
| `lastLogout` | datetime(1) | NULL | NULL | |
| `createdOn` | datetime | NULL | NULL | |
| `createdBy` | varchar(64) | NULL | NULL | |
| `modifiedOn` | datetime | NULL | NULL | |
| `modifiedBy` | varchar(64) | NULL | NULL | |
| `deletedOn` | datetime(6) | NULL | NULL | |
| `deletedBy` | varchar(64) | NULL | NULL | |

### 8.2 `core_application_roles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(64) | PK |
| `name` | varchar(64) | Role name |

**Seed data:** superadmin, admin, superuser, user, N/A

### 8.3 `core_application_refresh_token`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(64) | PK, UUID |
| `jwtId` | varchar(64) | Links to JWT `jti` |
| `userId` | varchar(64) | FK → `core_application_users(id)` ON DELETE CASCADE |
| `used` | tinyint(1) | Default `0` |
| `invalidated` | tinyint(1) | Default `0` |
| `expiryDate` | datetime | |
| `createdOn` | datetime | |

### 8.4 `core_privileges`

| Column | Type | Notes |
|--------|------|-------|
| `Id` | varchar(255) | PK, default `uuid()` |
| `UserId` | varchar(255) | User reference |
| `RoleId` | varchar(255) | Role reference |
| `ModuleId` | int(11) | Module reference |

**Note:** No FK constraints in DB — enforced in application code.

### 8.5 `core_minimum_privileges`

| Column | Type | Notes |
|--------|------|-------|
| `id` | int(100) | PK, AUTO_INCREMENT |
| `request` | varchar(255) | Route path (e.g., `/api/v1/users`) |
| `method` | varchar(50) | HTTP method |
| `roleRequired` | varchar(255) | Minimum role name |
| `moduleId` | int(100) | Module reference |

### 8.6 `core_modules`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(36) | PK |
| `pId` | int(5) | Parent ID (`0` = root) |
| `name` | varchar(50) | Module name |
| `isMenuItem` | tinyint(1) | Show in side menu |
| `isDefault` | tinyint(1) | Default menu item |
| `priority` | int(3) | Display order |
| `nestedLevel` | int(11) | Hierarchy depth |
| `icon` | varchar(20) | |
| `path` | varchar(30) | Frontend route |
| `lightColor` | varchar(45) | |
| `darkColor` | varchar(45) | Default `'#1f1f1f'` |
| `font` | varchar(45) | |
| `isNode` | tinyint(1) | Is node-related module |

### 8.7 Related Tables

| Table | Purpose |
|-------|---------|
| `core_sys_config` | System configuration (token expiry, encryption key, etc.) |
| `core_requests_archive` | Request audit log |
| `core_rate_limiter` | Blocked IPs |
| `core_malicious_requests` | Suspicious request log |

---

## 9. DTOs

### 9.1 Auth DTOs (`src/infrastructure/dto/auth.dto.ts`)

```typescript
interface LoginDTO {
  credential: string;    // username or email
  password: string;
}

interface RegisterDTO {
  firstName: string;
  lastName: string;
  keepLogin: boolean;
  allowMultipleSessions: boolean;
  userName: string;
  email: string;
  password: string;
  phoneNumber: string;
}

interface AuthenticationDTO {
  token: string;         // JWT
  refreshToken: string;  // UUID
}

interface ChangePasswordDTO {
  password: string;
  confirmPassword: string;
  oldPassword: string;
}

class AuthUserDto {
  id: string;
  firstName: string;
  lastName: string;
  userName: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  isLocked: boolean;
  keepLogin: boolean;
  allowMultipleSessions: boolean;
  theme: string;
}
```

### 9.2 User DTOs (`src/infrastructure/dto/user.dto.ts`)

```typescript
interface CreateUserDto {
  firstName: string;
  lastName: string;
  keepLogin: boolean;
  allowMultipleSessions: boolean;
  userName: string;
  email: string;
  password: string;
  phoneNumber: string;
}

interface UpdateUserDto {
  id: string;
  firstName: string;
  lastName: string;
  keepLogin: boolean;
  allowMultipleSessions: boolean;
  email: string;
  phoneNumber: string;
}

interface BasicUserDto {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  keepLogin: boolean;
  allowMultipleSessions: boolean;
}

class UserDto {
  id: string;
  firstName: string;
  lastName: string;
  userName: string;
  email: string;
  phoneNumber: string;
  options?: {
    isLocked: boolean;
    keepLogin: boolean;
    allowMultipleSessions: boolean;
  };
}
```

### 9.3 Privilege DTOs (`src/infrastructure/dto/privilige.dto.ts`)

```typescript
interface UserPrivilegesDTO {
  id: number;
  pId: number;
  name: string;
  isMenuItem: boolean;
  priority: number;
  nestedLevel: number;
  icon?: string;
  color?: string;
  font?: string;
  path?: string;
  roleName: string;
  isUser: boolean;
  isSuperUser: boolean;
  isAdmin: boolean;
  toggle: string;
  children?: UserPrivilegesDTO[];
}

interface CorePrivilegeDTO {
  id: string;
  userId: string;
  roleId: string;
  moduleId: string;
}
```

### 9.4 Refresh Token DTO (`src/infrastructure/dto/refreshToken.dto.ts`)

```typescript
interface RefreshToken {
  id: string;
  token: string;
  jwtId: string;
  expiryDate: string;
  used: boolean;
  invalidated: boolean;
  userId: string;
  createdOn: string;
}
```

### 9.5 Theme DTO (`src/infrastructure/dto/Theme.dto.ts`)

```typescript
interface UpdateThemeDto {
  theme: Theme;  // "dark" | "light"
}
```

---

## 10. Enums & Constants

### 10.1 Roles (`src/core/enums/global.enum.ts`)

```typescript
enum AvailableRoles {
  superAdmin = 'superadmin',
  admin = 'admin',
  superUser = 'superuser',
  user = 'user',
  default = 'N/A',
}
```

### 10.2 Theme

```typescript
enum Theme {
  DARK = 'dark',
  LIGHT = 'light',
}
```

### 10.3 Table Names (`src/core/consts/databaseConstants.ts`)

```typescript
Tables.users = 'core_application_users'
Tables.roles = 'core_application_roles'
Tables.refreshToken = 'core_application_refresh_token'
Tables.Priviliges = 'core_privileges'
Tables.minimumPrivileges = 'core_minimum_privileges'
Tables.modules = 'core_modules'
Tables.requestsArchive = 'core_requests_archive'
Tables.rateLimiter = 'core_rate_limiter'
Tables.rateMaliciousRequets = 'core_malicious_requests'
Tables.sysConfig = 'core_sys_config'
```

### 10.4 System Config Keys (`src/core/consts/databaseConstants.ts`)

```typescript
SystemKeys.tokenExpiryInMinutes = 'tokenExpiryInMinutes'
SystemKeys.refreshTokenExpiryInMinutes = 'rtokenExpiryInMinutes'
SystemKeys.utilityApiKey = 'utilityApiKey'
SystemKeys.aesEncryptionKey = 'aesEncryptionKey'
SystemKeys.toggle = 'toggle'
```

### 10.5 Error Messages (`src/core/consts/baseMessages.ts`)

```typescript
// Success
LOGIN_SUCCESS = 'You are logged in'
LOUGOUT_SUCCESSFUL = 'Logged out!'
REFRESH_TOKEN_SUCCESS = 'Token refreshed successfuly.'

// Auth Errors
INVALID_CREDENTIALS = 'Invalid user credentials!'
ACCOUNT_LOCKED = 'This account is currently locked !'
UNAUTHORIZED = 'Your unauthorized!'
INVALID_TOKEN = 'Invalid Token.'
JWT_IS_NOT_VALID = 'Invalid access token.'
UNAUTHORIZED_ROLE = "You don't have the privilige to access this request."
TOKEN_HAS_NOT_EXPIRED_YET = "Your token hasn't expired yet!"
ONLY_ONE_SESSION_ALLOWED = 'Only one session is allowed.'
USER_NOT_FOUND = 'User not found.'
ROLE_NOT_FOUND = 'Role not found.'
MODULE_NOT_FOUND = 'Module not found.'
API_KEY_INVALID = 'Invalid api key'
EMAIL_ALREADY_EXSIST = 'Email already exists'
USER_ALREADY_EXSIST = 'User already exists'
PASSWORD_MISMATCH = 'Passwords do not match'
WRONG_PASSWORD = 'Wrong password'
```

---

## 11. Utility Classes

### 11.1 PasswordHash (`src/core/utils/password.util.ts`)

| Method | Purpose |
|--------|---------|
| `hashPassword(plain)` | bcrypt hash with salt rounds=10 |
| `isPasswordValid(plain, hash)` | bcrypt compare |

### 11.2 HttpHelper (`src/core/utils/http.util.ts`)

| Method | Purpose |
|--------|---------|
| `retrieveBearerTokenFromRequest(req)` | Extract token from `Authorization: Bearer` header |
| `getUserIdByRequest(req)` | Extract userId from request's JWT |
| `getUserIdByBearerToken(token)` | Extract userId from token string |
| `getUserByRequest(req)` | Fetch full user record from DB via request token |

### 11.3 Authorization Util (`src/core/utils/authorization.util.ts`)

| Method | Purpose |
|--------|---------|
| `hasPrivilege(userRole, minimumRole)` | Role hierarchy comparison |

---

## 12. Error Messages

(See section 10.5 above)

---

## 13. DI Bindings

**File:** `src/application/DI/inversity.ts`

```typescript
container.bind(AuthController).to(AuthController);
container.bind(UsersController).to(UsersController);
container.bind<IAuthService>(TYPES.AuthService).to(AuthService);
container.bind<IUsersService>(TYPES.UsersService).to(UsersService);
container.bind<ITokenRepository>(TYPES.TokenRepository).to(TokenRepository);
container.bind<IUsersRepository>(TYPES.UsersRepository).to(UsersRepository);
container.bind<ISystemRepository>(TYPES.SystemRepository).to(SystemRepository);
container.bind<IRepository>(TYPES.dbRepository).to(Repository);
container.bind<IDateHelper>(TYPES.DateHelper).to(DateHelper);
```

Scope: Singleton in production, Transient in test.

---

## 14. Request Flows

### 14.1 Login Flow

```
Client → POST /api/v1/auth/login {credential, password}
  → validate(loginSchema)
  → AuthController.login()
  → AuthService.login()
    → Query user by userName/email
    → Check !isLocked
    → bcrypt.compare(password, passwordHash)
    → Check allowMultipleSessions / existing sessions
    → Update lastLogin
    → JwtHelper.generateTokenAndRefreshToken()
      → jwt.sign(payload, secret, {expiresIn})
      → TokenRepository.createRefreshToken(jwtId, userId)
  ← {token, refreshToken}
```

### 14.2 Protected Request Flow

```
Client → GET /api/v1/users/me {Authorization: Bearer <jwt>}
  → rateLimiterMiddleware (IP check)
  → requestFilterMiddleware (attack patterns)
  → jwtMiddleware
    → Extract token from header
    → Query keepLogin from DB
    → If !keepLogin: JwtHelper.isTokenValid(token)
  → authorize
    → Query core_minimum_privileges for route+method
    → Query user's role for that module
    → hasPrivilege(userRole, requiredRole)
  → UsersController.getUser()
  → UsersService.getUserById()
  ← UserDto
```

### 14.3 Token Refresh Flow

```
Client → POST /api/v1/auth/token {token, refreshToken}
  → validate(refreshTokenSchema)
  → AuthController.refreshToken()
  → AuthService.refreshToken()
    → isTokenValid(token, ignoreExpiration=true)
    → Extract email from JWT
    → Query user by email
    → If keepLogin: generate new pair immediately
    → If !keepLogin: check token is expired/expiring (within 1 min)
    → Fetch refresh token record
    → Validate: jwtId match, not expired, not used/invalidated
    → Mark old refresh token used=1
    → Generate new JWT + refresh token
  ← {token, refreshToken}
```

### 14.4 Socket.IO Connection Flow

```
Client → io('/notifications', {auth: {token: jwt}})
  → Socket.IO handshake
  → Namespace middleware: JwtHelper.isTokenValid(token, false)
    → If invalid: reject connection
    → If valid: allow connection
  → on('connection')
    → Extract userId from query params
    → Store socket→user mapping in Redis
    → Join broadcast room
```
