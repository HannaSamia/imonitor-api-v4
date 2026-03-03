# Phase 3.1 Documentation -- Auth & Users Module Refactoring

> iMonitor API v4 | NestJS Migration from Express.js v3
> Phase 3.1: Authentication, Authorization, and User Management

---

## Table of Contents

1. [API Documentation](#1-api-documentation)
   - [Auth Endpoints](#11-auth-endpoints)
   - [User Endpoints](#12-user-endpoints)
   - [Settings Endpoints](#13-settings-endpoints)
2. [Architecture Decision Records](#2-architecture-decision-records)
3. [Handoff Summary](#3-handoff-summary)

---

## 1. API Documentation

All endpoints follow a standard JSON envelope format:

```json
{
  "message": "...",
  "result": { ... }
}
```

Authentication is via Bearer JWT token in the `Authorization` header unless marked as **Public**.

Error responses follow the same envelope with an appropriate HTTP status code and a `message` field containing the error description.

### Role Hierarchy

The system enforces a strict role hierarchy (highest to lowest privilege):

```
superadmin > admin > superuser > user > N/A
```

A user with a higher-privilege role automatically satisfies checks for lower-privilege roles.

---

### 1.1 Auth Endpoints

Base path: `/api/v1/auth`

#### POST `/api/v1/auth/login`

**Public** -- No authentication required.

Authenticates a user by username or email and returns a JWT token pair.

**Request Body:**

```json
{
  "credential": "john.doe",
  "password": "secureP@ss123"
}
```

| Field        | Type   | Required | Description                        |
|-------------|--------|----------|------------------------------------|
| `credential` | string | Yes      | Username or email address          |
| `password`   | string | Yes      | User password                      |

**Success Response (200):**

```json
{
  "message": "You are logged in",
  "result": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Error Responses:**

| Status | Message                          | Condition                                      |
|--------|----------------------------------|-------------------------------------------------|
| 400    | `Invalid user credentials!`      | User not found, wrong password, or missing hash |
| 400    | `This account is currently locked !` | Account has been locked by an admin         |
| 400    | `Only one session is allowed.`   | `allowMultipleSessions` is false and an active refresh token exists |

**Behavior Notes:**
- Looks up the user by `userName` OR `email` (case-sensitive), excluding soft-deleted users.
- On success, updates the user's `lastLogin` timestamp.
- JWT payload contains: `id`, `email`, `credential` (userName), `theme`.
- Token expiry is read from `core_sys_config.tokenExpiryInMinutes` (default: 30 minutes).
- Refresh token expiry is read from `core_sys_config.rtokenExpiryInMinutes` (default: 7 days / 10080 minutes).
- JWT algorithm is enforced as HS256.

---

#### POST `/api/v1/auth/token`

**Public** -- No authentication required.

Refreshes an expired JWT by providing the old token and a valid refresh token UUID.

**Request Body:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field          | Type   | Required | Description                                  |
|---------------|--------|----------|----------------------------------------------|
| `token`        | string | Yes      | Current JWT token (may be expired)           |
| `refreshToken` | string | Yes      | Refresh token UUID from the original login   |

**Success Response (200):**

```json
{
  "message": "Token refreshed successfuly.",
  "result": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "660e8400-e29b-41d4-a716-446655440001"
  }
}
```

**Error Responses:**

| Status | Message                            | Condition                                            |
|--------|------------------------------------|------------------------------------------------------|
| 400    | `Invalid Token.`                   | JWT signature invalid, refresh token not found, already used/invalidated, expired, or jwtId mismatch |
| 400    | `Invalid user credentials!`        | User associated with the token no longer exists      |
| 400    | `Your token hasn't expired yet!`   | Non-keepLogin user attempts refresh before the 1-minute grace window |

**Behavior Notes:**
- The old JWT signature is verified with `ignoreExpiration: true` -- the token may be expired but must have a valid signature.
- The refresh token is validated against the database: must exist, must not be `used` or `invalidated`, must not be past `expiryDate`, and its `jwtId` must match the JWT's `jti` claim.
- For users with `keepLogin = false`, refresh is only allowed within 1 minute before token expiry.
- For users with `keepLogin = true`, the expiry check is bypassed entirely.
- The old refresh token is marked as `used = true` before issuing a new token pair (rotation).

---

#### POST `/api/v1/auth/token/timer`

**Public** -- No authentication required.

Identical behavior to `POST /api/v1/auth/token`. This endpoint exists for v3 frontend parity, where the timer-based token refresh used a separate URL.

**Request/Response:** Same as `POST /api/v1/auth/token`.

---

#### GET `/api/v1/auth/logout`

**Authenticated** -- Requires a valid Bearer token.

Invalidates the user's current refresh token and records the logout timestamp.

**Headers:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**

```json
{
  "message": "LOUGOUT_SUCCESSFUL",
  "result": null
}
```

**Error Responses:**

| Status | Message                 | Condition                           |
|--------|------------------------|--------------------------------------|
| 401    | `Invalid access token.` | Missing or invalid Bearer token     |
| 400    | `Invalid Token.`        | No `jti` in token or refresh token not found |

**Behavior Notes:**
- Verifies the JWT with `ignoreExpiration: true` (logout should work even after token expiry).
- Finds the refresh token by `jwtId` and marks it as `invalidated = true`.
- Updates the user's `lastLogout` timestamp.

---

#### POST `/api/v1/auth/access`

**Authenticated** -- Requires a valid Bearer token.

Checks whether the current user has sufficient privilege to access a specific module with a specific role.

**Request Body:**

```json
{
  "role": "user",
  "module": "Dashboard"
}
```

| Field    | Type   | Required | Description                      |
|---------|--------|----------|----------------------------------|
| `role`   | string | Yes      | Minimum role name to check       |
| `module` | string | Yes      | Module name to check access for  |

**Success Response (200):**

```json
{
  "message": "HAS_ACCESS_PRIVILIGE",
  "result": null
}
```

**Error Responses:**

| Status | Message                                                     | Condition                                      |
|--------|-------------------------------------------------------------|-------------------------------------------------|
| 400    | `Role not found.`                                           | The specified role does not exist               |
| 400    | `Module not found.`                                         | The specified module does not exist             |
| 400    | `You don't have the privilige to access this request.`      | User's role on the module is insufficient       |

**Behavior Notes:**
- Role and module lookups are performed in parallel (`Promise.all`) for performance.
- Uses the `hasPrivilege()` helper to compare the user's role against the required role using the hierarchy.

---

#### GET `/api/v1/auth/heartbeat`

**Authenticated** -- Requires a valid Bearer token.

Simple endpoint to verify that the caller's JWT is still valid. Returns the user ID extracted from the token.

**Success Response (200):**

```json
{
  "message": "HEARTBEAT",
  "result": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Behavior Notes:**
- No database query is performed; the user ID is extracted directly from the JWT payload.
- Can be used by the frontend for periodic liveness checks.

---

### 1.2 User Endpoints

Base path: `/api/v1/users`

All user endpoints require authentication (Bearer JWT) and pass through the `PrivilegeGuard`, which dynamically checks the user's role against the `core_minimum_privileges` table.

---

#### POST `/api/v1/users/register`

Creates a new user account with default privileges.

**Request Body:**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "userName": "john.doe",
  "email": "john.doe@example.com",
  "password": "secureP@ss123",
  "phoneNumber": "+961123456",
  "allowMultipleSessions": true,
  "keepLogin": false
}
```

| Field                   | Type    | Required | Validation                         |
|------------------------|---------|----------|------------------------------------|
| `firstName`             | string  | Yes      | Min 3 chars, alphanumeric only     |
| `lastName`              | string  | Yes      | Min 3 chars, alphanumeric only     |
| `userName`              | string  | Yes      | Min 5 chars                        |
| `email`                 | string  | Yes      | Valid email format                 |
| `password`              | string  | Yes      | Min 6, max 30 chars                |
| `phoneNumber`           | string  | Yes      | Non-empty string                   |
| `allowMultipleSessions` | boolean | Yes      | --                                 |
| `keepLogin`             | boolean | Yes      | --                                 |

**Success Response (200):**

> Returns 200 instead of 201 for v3 frontend parity.

```json
{
  "message": "User registered successfully.",
  "result": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "firstName": "John",
    "lastName": "Doe",
    "userName": "john.doe",
    "email": "john.doe@example.com",
    "phoneNumber": "+961123456"
  }
}
```

**Error Responses:**

| Status | Message                  | Condition                                           |
|--------|--------------------------|------------------------------------------------------|
| 400    | `User already exists.`   | A non-deleted user with the same username, email, or phone exists |

**Behavior Notes:**
- User creation and default privilege assignment are wrapped in a single database transaction.
- Password is hashed with bcrypt (10 salt rounds).
- All modules receive the default `N/A` role for the new user.
- The `createdBy` field is set to the ID of the currently authenticated user.

---

#### GET `/api/v1/users/`

Returns all non-deleted users, excluding the currently authenticated user. Ordered by `firstName` ascending.

**Success Response (200):**

```json
{
  "result": [
    {
      "id": "...",
      "firstName": "Alice",
      "lastName": "Smith",
      "userName": "alice.smith",
      "email": "alice@example.com",
      "phoneNumber": "+961111111",
      "options": {
        "isLocked": false,
        "keepLogin": true,
        "allowMultipleSessions": false
      }
    }
  ]
}
```

---

#### GET `/api/v1/users/all`

Returns all non-deleted users (including the current user). Ordered by `firstName` ascending.

**Success Response (200):** Same structure as `GET /api/v1/users/`, but includes the current user.

---

#### GET `/api/v1/users/emails`

Returns a flat array of all email addresses for non-deleted users.

**Success Response (200):**

```json
{
  "result": [
    "alice@example.com",
    "john.doe@example.com"
  ]
}
```

---

#### GET `/api/v1/users/me`

Returns the profile of the currently authenticated user.

**Success Response (200):**

```json
{
  "result": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "firstName": "John",
    "lastName": "Doe",
    "userName": "john.doe",
    "email": "john.doe@example.com",
    "phoneNumber": "+961123456"
  }
}
```

**Error Responses:**

| Status | Message            | Condition                     |
|--------|--------------------|-------------------------------|
| 400    | `User not found.`  | User is deleted or does not exist |

---

#### GET `/api/v1/users/sidemenu`

Returns the side menu tree for the currently authenticated user, filtered by privilege and menu visibility.

**Success Response (200):**

```json
{
  "result": [
    {
      "id": 1,
      "pId": 0,
      "name": "Dashboard",
      "isMenuItem": true,
      "priority": 1,
      "nestedLevel": 0,
      "icon": "dashboard",
      "color": "#4CAF50",
      "font": "Material Icons",
      "path": "/dashboard",
      "roleName": "admin",
      "isUser": true,
      "isSuperUser": true,
      "isAdmin": true,
      "toggle": "admin",
      "children": []
    }
  ]
}
```

**Behavior Notes:**
- Modules with `isMenuItem = false` are excluded.
- Modules where the user has `N/A` role and the module is not marked `isDefault` are excluded.
- Color is selected based on the user's theme preference (`lightColor` for light theme, `darkColor` for dark theme).
- The tree is built from two bulk queries (all modules + all user privileges) and assembled in-memory, avoiding N+1 query patterns.

---

#### GET `/api/v1/users/module/:name/role`

Returns the user's role on a specific module, identified by module name.

**Path Parameters:**

| Parameter | Type   | Description    |
|-----------|--------|----------------|
| `name`    | string | Module name    |

**Success Response (200):**

```json
{
  "result": "admin"
}
```

Returns `null` if the module is not found or the user has no privilege record for that module.

---

#### GET `/api/v1/users/:id`

Returns a single user profile by ID.

**Path Parameters:**

| Parameter | Type   | Description |
|-----------|--------|-------------|
| `id`      | string | User UUID   |

**Success Response (200):**

```json
{
  "result": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "firstName": "John",
    "lastName": "Doe",
    "userName": "john.doe",
    "email": "john.doe@example.com",
    "phoneNumber": "+961123456"
  }
}
```

**Error Responses:**

| Status | Message            | Condition                                |
|--------|--------------------|------------------------------------------|
| 400    | `User not found.`  | User does not exist or is soft-deleted   |

---

#### PUT `/api/v1/users/theme`

Updates the theme preference for the currently authenticated user.

**Request Body:**

```json
{
  "theme": "dark"
}
```

| Field   | Type   | Required | Validation                  |
|---------|--------|----------|-----------------------------|
| `theme` | enum   | Yes      | Must be `"dark"` or `"light"` |

**Success Response (200):**

```json
{
  "result": null
}
```

---

#### PUT `/api/v1/users/`

Allows the currently authenticated user to edit their own profile.

**Request Body:**

```json
{
  "firstName": "Jonathan",
  "lastName": "Doe",
  "email": "jonathan.doe@example.com",
  "phoneNumber": "+961999999"
}
```

| Field         | Type   | Required | Validation                      |
|--------------|--------|----------|---------------------------------|
| `firstName`   | string | Yes      | Min 3 chars, alphanumeric only  |
| `lastName`    | string | Yes      | Min 3 chars, alphanumeric only  |
| `email`       | string | Yes      | Valid email format              |
| `phoneNumber` | string | Yes      | Non-empty string                |

**Success Response (200):**

```json
{
  "result": null
}
```

**Error Responses:**

| Status | Message                   | Condition                                              |
|--------|---------------------------|---------------------------------------------------------|
| 400    | `Email already exists.`   | Another non-deleted user already has this email address |

**Behavior Notes:**
- Users cannot change their own `userName`, `allowMultipleSessions`, or `keepLogin` via this endpoint.
- Updates `modifiedOn` timestamp.

---

#### PUT `/api/v1/users/:id`

Admin endpoint to update another user's profile, including session and login settings.

**Path Parameters:**

| Parameter | Type   | Description       |
|-----------|--------|-------------------|
| `id`      | string | Target user UUID  |

**Request Body:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "firstName": "Jonathan",
  "lastName": "Doe",
  "email": "jonathan.doe@example.com",
  "phoneNumber": "+961999999",
  "allowMultipleSessions": true,
  "keepLogin": false
}
```

| Field                   | Type    | Required | Validation         |
|------------------------|---------|----------|--------------------|
| `id`                    | string  | Yes      | Must match URL `:id` |
| `firstName`             | string  | Yes      | Min 2 chars        |
| `lastName`              | string  | Yes      | Min 2 chars        |
| `email`                 | string  | Yes      | Valid email format  |
| `phoneNumber`           | string  | Yes      | Non-empty string   |
| `allowMultipleSessions` | boolean | Yes      | --                 |
| `keepLogin`             | boolean | Yes      | --                 |

**Success Response (200):**

```json
{
  "result": null
}
```

**Error Responses:**

| Status | Message                   | Condition                                              |
|--------|---------------------------|---------------------------------------------------------|
| 400    | `Email already exists.`   | Another non-deleted user already has this email address |

---

#### PUT `/api/v1/users/:id/privileges`

Updates all module privileges for a specific user. Accepts a recursive tree of privilege nodes.

**Path Parameters:**

| Parameter | Type   | Description       |
|-----------|--------|-------------------|
| `id`      | string | Target user UUID  |

**Request Body:**

```json
[
  {
    "id": 1,
    "pId": 0,
    "name": "Dashboard",
    "isMenuItem": true,
    "priority": 1,
    "nestedLevel": 0,
    "roleName": "admin",
    "isUser": true,
    "isSuperUser": true,
    "isAdmin": true,
    "toggle": "admin",
    "children": [
      {
        "id": 2,
        "pId": 1,
        "name": "Dashboard Charts",
        "isMenuItem": true,
        "priority": 1,
        "nestedLevel": 1,
        "roleName": "user",
        "isUser": true,
        "isSuperUser": false,
        "isAdmin": false,
        "toggle": "user"
      }
    ]
  }
]
```

**Success Response (200):**

```json
{
  "result": null
}
```

**Behavior Notes:**
- All roles are pre-loaded in a single query to avoid N+1.
- The recursive tree is flattened into a list of `(moduleId, roleId)` updates.
- Updates are grouped by `roleId` and executed as batch `UPDATE` statements within a single transaction.

---

#### PUT `/api/v1/users/:id/lock`

Locks a user account, preventing them from logging in.

**Path Parameters:**

| Parameter | Type   | Description       |
|-----------|--------|-------------------|
| `id`      | string | Target user UUID  |

**Request Body:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Success Response (200):**

```json
{
  "result": null
}
```

---

#### PUT `/api/v1/users/:id/unlock`

Unlocks a previously locked user account.

**Path Parameters and Request Body:** Same structure as the lock endpoint.

**Success Response (200):**

```json
{
  "result": null
}
```

---

#### PATCH `/api/v1/users/resetpassword`

Allows the currently authenticated user to change their own password.

**Request Body:**

```json
{
  "oldPassword": "currentP@ss",
  "password": "newSecureP@ss",
  "confirmPassword": "newSecureP@ss"
}
```

| Field             | Type   | Required | Validation          |
|-------------------|--------|----------|---------------------|
| `oldPassword`     | string | Yes      | Non-empty           |
| `password`        | string | Yes      | Min 6, max 30 chars |
| `confirmPassword` | string | Yes      | Min 6, max 30 chars, must match `password` |

**Success Response (200):**

```json
{
  "result": null
}
```

**Error Responses:**

| Status | Message                     | Condition                              |
|--------|-----------------------------|----------------------------------------|
| 400    | `Passwords do not match.`   | `password` and `confirmPassword` differ |
| 400    | `User not found.`           | User does not exist                    |
| 400    | `Wrong password.`           | `oldPassword` does not match stored hash |

**Behavior Notes:**
- After changing the password, all active refresh tokens for the user are invalidated (security fix H-14). This forces re-authentication on all sessions.

---

#### PATCH `/api/v1/users/changepassword/:id`

Admin endpoint to reset another user's password. Generates a cryptographically random password and emits a `user.password.reset` event.

**Path Parameters:**

| Parameter | Type   | Description       |
|-----------|--------|-------------------|
| `id`      | string | Target user UUID  |

**Success Response (200):**

```json
{
  "result": null
}
```

**Error Responses:**

| Status | Message            | Condition               |
|--------|--------------------|-------------------------|
| 400    | `User not found.`  | User does not exist     |

**Behavior Notes:**
- Generates a 12-character random password using `crypto.randomBytes(9).toString('base64url')`.
- All active refresh tokens for the target user are invalidated.
- Emits a `user.password.reset` event with the new password and user info, allowing an email notification service to listen and send the reset email.

---

#### DELETE `/api/v1/users/:id`

Soft-deletes a user account. The user record is kept but marked as deleted.

**Path Parameters:**

| Parameter | Type   | Description       |
|-----------|--------|-------------------|
| `id`      | string | Target user UUID  |

**Success Response (200):**

```json
{
  "result": null
}
```

**Behavior Notes:**
- Sets `isDeleted = true`, `deletedBy`, `deletedOn`, `modifiedBy`, and `modifiedOn` on the user record.
- Soft-deleted users are excluded from all query results and cannot log in.

---

#### GET `/api/v1/users/:id/privileges`

Returns the full privilege tree for a given user, including all modules and the user's role on each.

**Path Parameters:**

| Parameter | Type   | Description       |
|-----------|--------|-------------------|
| `id`      | string | Target user UUID  |

**Success Response (200):**

```json
{
  "result": [
    {
      "id": 1,
      "pId": 0,
      "name": "Dashboard",
      "isMenuItem": true,
      "priority": 1,
      "nestedLevel": 0,
      "icon": "dashboard",
      "color": "#4CAF50",
      "font": "Material Icons",
      "path": "/dashboard",
      "roleName": "admin",
      "isUser": true,
      "isSuperUser": true,
      "isAdmin": true,
      "toggle": "admin",
      "children": [...]
    }
  ]
}
```

**Behavior Notes:**
- All modules and all user privileges are loaded in two parallel bulk queries.
- The tree is assembled in memory using a `Map<parentId, modules[]>` grouping strategy.

---

### 1.3 Settings Endpoints

These endpoints share the `/api/v1/users` base path but are implemented in a separate `SettingsController`. They require authentication and pass through the `PrivilegeGuard`.

---

#### GET `/api/v1/users/settings`

Returns a set of system configuration values used for comparison limits.

**Success Response (200):**

```json
{
  "result": {
    "maxDaysCompare": "30",
    "maxHoursCompare": "24",
    "maxMonthCompare": "12",
    "maxWeekCompare": "4",
    "maxYearCompare": "3"
  }
}
```

**Behavior Notes:**
- Queries the `core_sys_config` table for a fixed set of keys.
- Results are cached in-memory with a 60-second TTL to reduce database load.
- Uses a batch `IN` query for uncached keys rather than individual lookups.

---

#### GET `/api/v1/users/settings/:name`

Returns all configuration key-value pairs belonging to a specific settings column.

**Path Parameters:**

| Parameter | Type   | Description                                                                                        |
|-----------|--------|----------------------------------------------------------------------------------------------------|
| `name`    | string | Settings column name. Must be one of: `reportSetting`, `selfAnalysisSetting`, `widgetBuilderSetting`, `dashboardSetting`, `generalSetting`, `operationSettings` |

**Success Response (200):**

```json
{
  "result": {
    "someConfigKey": "someValue",
    "anotherKey": "anotherValue"
  }
}
```

**Behavior Notes:**
- The column name is validated against a static allowlist (`VALID_SETTING_COLUMNS`) to prevent SQL injection. If the column name is not in the allowlist, an empty result is returned.
- Queries all `core_sys_config` rows where the given setting column equals `1` (truthy).

---

## 2. Architecture Decision Records

### ADR-001: @nestjs/jwt over raw jsonwebtoken

**Status:** Accepted

**Context:**
The v3 codebase used `jsonwebtoken` directly via `jwt.sign()` and `jwt.verify()` calls scattered across middleware files. The secret key and algorithm were passed manually at each call site, creating multiple places where misconfiguration could occur (e.g., forgetting to pin the algorithm, using the wrong secret).

**Decision:**
Adopt `@nestjs/jwt` (`JwtModule.registerAsync`) with centralized configuration in `AuthModule`.

**Configuration:**

```typescript
JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    secret: configService.get<string>('JWT_KEY'),
    signOptions: { algorithm: 'HS256' },
    verifyOptions: { algorithms: ['HS256'] },
  }),
})
```

**Consequences:**
- The JWT secret is read from environment configuration in exactly one place.
- HS256 is enforced globally for both signing and verification, eliminating the risk of algorithm confusion attacks (e.g., `none` algorithm or RS256/HS256 swap).
- `JwtService` is injectable anywhere via standard NestJS DI, removing the need to import the raw `jsonwebtoken` library in service files.
- The `jsonwebtoken` package remains in `dependencies` only because it is a transitive dependency of `@nestjs/jwt` -- no direct imports exist in application code.

---

### ADR-002: CoreDataModule as @Global

**Status:** Accepted

**Context:**
Multiple modules (AuthModule guards, AuthEndpointsModule service, UsersModule services) all need access to the same set of core TypeORM entities: `CoreApplicationUsers`, `CoreApplicationRoles`, `CoreApplicationRefreshToken`, `CorePrivileges`, `CoreModules`, and `CoreMinimumPrivileges`.

Without a shared module, each feature module would need its own `TypeORM.forFeature([...])` import containing the same entity list, leading to duplication and the risk of forgetting an entity.

**Decision:**
Create `CoreDataModule` as a `@Global()` module that registers all shared entities once via `TypeORM.forFeature()` and exports `TypeOrmModule`.

```typescript
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

**Consequences:**
- Any module in the application can inject repositories for these entities without importing `TypeOrmModule.forFeature()` themselves.
- The entity list is maintained in a single location.
- Using `@Global()` is a conscious trade-off: it makes dependencies implicit rather than explicit. This is acceptable because these 6 entities are truly cross-cutting concerns used by auth guards (which run on every request) and the core business modules.

---

### ADR-003: SRP Split of UsersService (560 lines to 3 services)

**Status:** Accepted

**Context:**
The original `UsersService` in the v3 codebase was a single 560+ line file containing user CRUD, password management, privilege tree construction, privilege updates, side menu building, and more. This violated the Single Responsibility Principle and made the file difficult to test, review, and maintain.

**Decision:**
Split the monolithic service into three focused services:

| Service                  | Responsibility                                        | Lines |
|--------------------------|-------------------------------------------------------|-------|
| `UsersService`           | User CRUD: register, getAll, getById, update, delete, lock/unlock, theme | ~256  |
| `UserPasswordService`    | Password operations: change own password, admin reset  | ~96   |
| `UserPrivilegesService`  | Privilege tree, side menu, role lookup, bulk updates    | ~243  |

**Consequences:**
- Each service has a single clear responsibility and a focused set of repository dependencies.
- Unit tests can be written with smaller mock surfaces. Each service has its own `.spec.ts` file.
- `UsersController` injects all three services and delegates to the appropriate one based on the endpoint.
- `UsersService` depends on `UserPrivilegesService` for assigning default privileges during registration (the only cross-service call).

---

### ADR-004: Default-Allow in PrivilegeGuard

**Status:** Accepted (with documented risk)

**Context:**
The `PrivilegeGuard` replaces v3's `authorize()` middleware, which checked the `core_minimum_privileges` table to determine the minimum role required for a given route + HTTP method combination. In v3, if a route was not registered in the table, access was allowed by default.

**Decision:**
Preserve the v3 default-allow behavior: if a route/method combination is not found in `core_minimum_privileges`, the guard returns `true` (access granted).

```typescript
// If route is not registered in minimum_privileges, allow through (v3 behavior)
if (!minPriv) {
  return true;
}
```

**Consequences:**
- Ensures v3 frontend parity. The existing frontend expects certain routes to work without explicit privilege registration.
- New routes that are not added to `core_minimum_privileges` will be accessible to all authenticated users by default, which is a security risk.
- This is flagged as a known limitation. A future phase should consider inverting to default-deny and explicitly registering all routes.

---

### ADR-005: keepLogin Bypasses Expiration but Not Signature

**Status:** Accepted

**Context:**
v3 has a `keepLogin` feature where users with this flag enabled can continue using expired tokens indefinitely. This is a business requirement for certain monitoring operators who need uninterrupted access.

**Decision:**
In the `JwtAuthGuard`, when a token fails verification due to `TokenExpiredError`:
1. Re-verify the token with `ignoreExpiration: true` to validate the signature and extract the payload.
2. Look up the user by ID and check if `keepLogin = true`.
3. If yes, allow the request through with the original (expired) payload.
4. If no, reject with `401 Unauthorized`.

```typescript
private async handleExpiredToken(request, token): Promise<boolean> {
  // Verify signature (ignore expiration)
  const payload = this.jwtService.verify(token, { ignoreExpiration: true });

  // Check keepLogin flag via repository lookup
  const user = await this.usersRepo.findOne({
    where: { id: payload.id },
    select: ['id', 'keepLogin'],
  });

  if (user?.keepLogin) {
    request.user = payload;
    return true;
  }

  throw new UnauthorizedException('Invalid access token.');
}
```

**Consequences:**
- The JWT signature is always validated, preventing token forgery even for keepLogin users.
- The HS256 algorithm enforcement (from ADR-001) ensures no algorithm confusion attacks are possible.
- An expired token for a keepLogin user will trigger a database query on every request to verify the `keepLogin` flag. This is an intentional security measure (the flag could be revoked by an admin at any time).
- Refresh token validation still applies -- the refresh token must not be expired, used, or invalidated. The keepLogin bypass only affects the JWT expiration check in the auth guard and the refresh flow grace period.

---

## 3. Handoff Summary

### 3.1 What Was Built

Phase 3.1 delivers a complete rewrite of the authentication, authorization, and user management layer of iMonitor API, migrating from Express.js v3 patterns to idiomatic NestJS v4.

**Authentication (`src/modules/auth/`, `src/auth/`):**
- `AuthService` -- Login, logout, token refresh, and module access check logic.
- `AuthController` -- 6 endpoints under `/api/v1/auth/`.
- `AuthModule` -- Centralized JWT configuration with `@nestjs/jwt` and HS256 enforcement.
- `JwtAuthGuard` -- Global guard (APP_GUARD) replacing v3's `jwtVerify` middleware. Handles the `keepLogin` bypass with signature-only verification.

**Authorization (`src/auth/guards/`):**
- `PrivilegeGuard` -- Dynamic privilege check against `core_minimum_privileges` table (replaces v3 `authorize()` middleware).
- `RolesGuard` -- Static role check using `@Roles()` and `@ModuleName()` decorators (replaces v3 `strictAuthorize()`).
- `ApiKeyGuard` -- API key validation via `access_token` header against `core_sys_config.utilityApiKey` (replaces v3 `keyAuthorisation` middleware).

**User Management (`src/modules/users/`):**
- `UsersService` -- User CRUD (register, get, update, delete, lock/unlock, theme).
- `UserPasswordService` -- Change own password, admin password reset with crypto-random generation and event emission.
- `UserPrivilegesService` -- Privilege tree construction, side menu, module role lookup, batch privilege updates.
- `UsersController` -- 20 endpoints under `/api/v1/users/`.
- `SettingsController` -- 2 endpoints for system configuration under `/api/v1/users/settings`.

**Shared Infrastructure:**
- `CoreDataModule` -- Global module providing 6 core entity repositories to the entire application.
- `SystemConfigService` -- Config value retrieval with 60-second in-memory TTL cache and batch `IN()` query support.
- `PasswordService` -- bcrypt hashing with 10 salt rounds.
- Custom decorators: `@Public()`, `@CurrentUser()`, `@Roles()`, `@ModuleName()`.
- DTOs with `class-validator` decorations for all endpoints.

**Database Indexes (8 total):**

| Index Name                          | Table                             | Columns                    |
|-------------------------------------|-----------------------------------|----------------------------|
| `IDX_users_userName`                | `core_application_users`          | `userName`                 |
| `IDX_users_email`                   | `core_application_users`          | `email`                    |
| `IDX_users_isDeleted`               | `core_application_users`          | `isDeleted`                |
| `IDX_users_email_isDeleted`         | `core_application_users`          | `email`, `isDeleted`       |
| `IDX_users_userName_isDeleted`      | `core_application_users`          | `userName`, `isDeleted`    |
| `IDX_privileges_userId_moduleId`    | `core_privileges`                 | `userId`, `moduleId`       |
| `IDX_refreshToken_jwtId`            | `core_application_refresh_token`  | `jwtId`                    |
| `IDX_minPriv_request_method`        | `core_minimum_privileges`         | `request`, `method`        |

---

### 3.2 How to Test

**Run the full test suite:**

```bash
npm test
```

This should produce 88 passing tests across 5 test suites:

| Test Suite                          | File                                      |
|-------------------------------------|-------------------------------------------|
| `AuthService`                       | `src/modules/auth/auth.service.spec.ts`   |
| `UsersService`                      | `src/modules/users/users.service.spec.ts` |
| `UserPasswordService`               | `src/modules/users/user-password.service.spec.ts` |
| `UserPrivilegesService`             | `src/modules/users/user-privileges.service.spec.ts` |
| `SystemConfigService`               | `src/shared/services/system-config.service.spec.ts` |

**Run with coverage:**

```bash
npm run test:cov
```

**Manual smoke testing:**

1. Start the application: `npm run start:dev`
2. Test login: `POST /api/v1/auth/login` with valid credentials.
3. Use the returned token to call `GET /api/v1/auth/heartbeat` and verify a 200 response.
4. Test token refresh: `POST /api/v1/auth/token` with the token and refreshToken from login.
5. Test user listing: `GET /api/v1/users/all`.
6. Test privilege tree: `GET /api/v1/users/:id/privileges`.

---

### 3.3 Known Limitations and Deferred Items

**Security findings (from review):**

| ID   | Severity | Finding                                                                 | Status                     |
|------|----------|-------------------------------------------------------------------------|----------------------------|
| H-02 | High     | Refresh token always validated (was previously skipped for keepLogin)   | Fixed in this phase        |
| H-05 | High     | System config queries on every request (token expiry lookup)            | Mitigated with TTL cache   |
| H-06 | High     | N+1 privilege updates (one UPDATE per module)                           | Fixed with batch operations |
| H-07 | High     | User creation + privilege assignment not atomic                         | Fixed with transaction     |
| H-14 | High     | Password change does not invalidate existing sessions                   | Fixed -- refresh tokens invalidated |
| M-09 | Medium   | Sequential lookups where parallel is possible                           | Fixed with `Promise.all`   |

**Deferred items:**

- **Rate limiting on login endpoint:** The global `RateLimiterMiddleware` exists but is not specifically tuned for brute-force protection on `/api/v1/auth/login`. A dedicated per-IP/per-credential rate limit should be added.
- **Refresh token cleanup:** Expired and used refresh tokens accumulate in the `core_application_refresh_token` table. A scheduled cleanup job (using `@nestjs/schedule`) should be implemented.
- **Default-deny PrivilegeGuard:** Currently uses default-allow for v3 parity (see ADR-004). Should be inverted to default-deny after all routes are registered in `core_minimum_privileges`.
- **Password complexity validation:** Current validation is min 6 / max 30 characters. No complexity rules (uppercase, special characters, etc.) are enforced.
- **API key guard uses constant-time comparison:** The current `ApiKeyGuard` compares API keys with `===`, which is vulnerable to timing attacks. Should use `crypto.timingSafeEqual()`.
- **keepLogin database hit:** Every request from a keepLogin user with an expired token triggers a database lookup to verify the flag (ADR-005). Consider caching this with a short TTL.
- **E2E tests:** Only unit tests exist currently. End-to-end integration tests with a test database should be added in a future phase.
- **Controller-level tests:** No controller spec files exist. Controller tests with mocked services would improve coverage confidence.

---

### 3.4 Next Steps

1. **Phase 3.2 -- Remaining Module Endpoints:** Migrate the next set of business modules (dashboards, reports, data analysis, etc.) following the same patterns established in this phase.
2. **Address Critical/High findings:** Prioritize the deferred security items above, particularly the timing-safe API key comparison and login rate limiting.
3. **Refresh token cleanup job:** Implement a scheduled task to purge expired/used refresh tokens older than N days.
4. **E2E test suite:** Set up a test database and write integration tests for the auth flow (login, refresh, logout cycle) and user CRUD operations.
5. **Swagger documentation:** The endpoints already have `@ApiTags`, `@ApiBearerAuth`, and `@ApiOperation` decorators. Set up a Swagger endpoint at `/api/docs` to auto-generate interactive API documentation from the existing decorators and DTOs.
