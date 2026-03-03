# Implementation Plan: Phase 3.1 — Auth & Users

**Track ID:** phase3.1-auth-users_20260302
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-02
**Status:** [x] Complete

## Overview

Migrate all 25 auth + user endpoints from v3 to v4 NestJS. Build on the Phase 2 infrastructure (JwtAuthGuard, PrivilegeGuard, SharedModule, exception filter, response interceptor). Use TypeORM repositories for all queries against `iMonitorV3_1`.

**Key architectural decisions:**
- Keep the existing JwtAuthGuard's internal JWT validation (already has keepLogin bypass) — no Passport strategy needed
- AuthService generates tokens using `jsonwebtoken` directly (matching v3 pattern)
- SystemConfigService provides cached access to `core_sys_config` values
- UsersService uses TypeORM repositories (not raw SQL)
- Preserve exact v3 error messages and response shapes for API compatibility

---

## Phase 1: Foundation Services & DTOs

Build the foundational services and DTOs that Auth and Users modules depend on.

### Tasks

- [x] Task 1.1: Create SystemConfigService — injectable service that reads `core_sys_config` values via TypeORM (getConfigValue, getSettingsByColumn). Export from SharedModule.
- [x] Task 1.2: Create auth DTOs — LoginDto, RefreshTokenDto, AuthenticationResponseDto with class-validator decorators and Swagger annotations.
- [x] Task 1.3: Create user DTOs — CreateUserDto, UpdateUserDto, BasicUserDto (self-edit), ChangePasswordDto, UserResponseDto, ChangeThemeDto with class-validator and Swagger.
- [x] Task 1.4: Create privilege DTOs — UserPrivilegesDto (recursive tree node with children), CorePrivilegeDto, CanAccessModuleDto.

### Verification

- [x] All DTOs compile, validators reject invalid input, Swagger schemas generate correctly.

---

## Phase 2: Auth Module — Service & Controller

Build the AuthService and AuthController with all 6 auth endpoints.

### Tasks

- [x] Task 2.1: Create AuthService — login method (find user by credential, check locked, verify password, check multiple sessions, update lastLogin, generate JWT + refresh token).
- [x] Task 2.2: AuthService — logout method (validate token, fetch refresh token by jwtId, invalidate, update lastLogout) and refreshToken method (validate expired token, check keepLogin, validate refresh token chain, rotate tokens).
- [x] Task 2.3: AuthService — canAccessModule method (validate role exists, module exists, get user role on module, compare via hasPrivilege) and heartbeat (simple userId return).
- [x] Task 2.4: AuthService — token generation helpers (generateTokenAndRefreshToken using jsonwebtoken sign + TokenRepository create, getJwtPayloadValue, isTokenValid with clockTolerance).
- [x] Task 2.5: Create AuthController — 6 endpoints: POST /login (@Public), POST /token (@Public), POST /token/timer (@Public), GET /logout, GET /heartbeat, POST /access. Wire with DTOs, Swagger decorators, and @CurrentUser.
- [x] Task 2.6: Create AuthModule as feature module — import TypeOrmModule.forFeature for user/role/refreshToken/privilege/module/minimumPrivilege/sysConfig entities. Register AuthService, AuthController. Import into AppModule.

### Verification

- [x] Auth module compiles. Login returns JWT + refreshToken. Logout invalidates token. Refresh rotates tokens. Heartbeat returns userId. Access checks role.

---

## Phase 3: Users Module — Core CRUD

Build UsersService core methods and register endpoint.

### Tasks

- [x] Task 3.1: Create UsersService — register method (check user exists by userName/email/phoneNumber, hash password, insert user, grant default N/A privileges for all modules).
- [x] Task 3.2: UsersService — getUserById, getAll (with/without current user), getEmails methods using TypeORM find/findOne with isDeleted=false filter.
- [x] Task 3.3: UsersService — selfUpdate (check email uniqueness excluding self, update fields + modifiedOn), update (admin updates another user, includes allowMultipleSessions/keepLogin + modifiedBy).
- [x] Task 3.4: UsersService — changePassword (validate old password, confirm match, hash new, update), resetPassword (generate random password, hash, update, stub email notification via event emitter).
- [x] Task 3.5: UsersService — delete (soft delete with deletedBy/deletedOn/modifiedBy/modifiedOn), lock and unlock (set isLocked + modifiedBy/modifiedOn), themeUpdate.

### Verification

- [x] Register creates user + default privileges. CRUD operations work. Soft delete preserves data. Lock prevents login.

---

## Phase 4: Users Module — Privileges & Settings

Build the privilege tree, side menu, and settings methods.

### Tasks

- [x] Task 4.1: UsersService — getUserPrivileges (recursive tree: fetch root modules where pId=0, for each get user's role, fetch children recursively, map role to isUser/isSuperUser/isAdmin flags).
- [x] Task 4.2: UsersService — updateUserPrivileges (recursive update: for each node resolve roleId from roleName, update core_privileges row for userId+moduleId, recurse into children).
- [x] Task 4.3: UsersService — getSideMenu (same as getUserPrivileges but filter isMenuItem=true, include only modules where user has non-default role OR module.isDefault=true).
- [x] Task 4.4: UsersService — moduleSettings (query core_sys_config by module column flag), getUserRoleOnModule (query privileges join), listSystemConfigurations (query specific config keys).

### Verification

- [x] Privilege tree builds correctly with nested children. Update persists role changes. Side menu filters properly. Settings return correct config values.

---

## Phase 5: Users Controller & Wiring

Build the UsersController with all 19 endpoints and wire into AppModule.

### Tasks

- [x] Task 5.1: UsersController — CRUD endpoints: POST /register, GET / (without current), GET /all, GET /emails, GET /me, GET /:id. Apply @UseGuards(PrivilegeGuard), @CurrentUser, Swagger decorators.
- [x] Task 5.2: UsersController — Account management endpoints: PUT /theme, PUT / (self-edit), PUT /:id (admin edit), PATCH /resetpassword (change own), PATCH /changepassword/:id (admin reset), DELETE /:id, PUT /:id/lock, PUT /:id/unlock.
- [x] Task 5.3: UsersController — Privileges + settings endpoints: GET /:id/privileges, PUT /:id/privileges, GET /sidemenu, GET /settings, GET /settings/:name, GET /module/:name/role.
- [x] Task 5.4: Create UsersModule — import TypeOrmModule.forFeature for required entities. Register UsersService, UsersController. Import into AppModule.

### Verification

- [x] All 19 user endpoints respond correctly. Guards enforce auth. Response format matches v3 ApiResponse shape. Swagger shows all endpoints.

---

## Phase 6: Tests & Final Verification

Unit tests for core business logic and build verification.

### Tasks

- [x] Task 6.1: Unit tests for AuthService — login (valid, invalid credential, locked, multiple sessions), logout, refreshToken (valid, expired refresh, used refresh, keepLogin), canAccessModule.
- [x] Task 6.2: Unit tests for UsersService — register (valid, duplicate), getUserById, getAll, changePassword (valid, wrong old, mismatch), delete (soft), lock/unlock.
- [x] Task 6.3: Build verification — `npm run build` passes, `npm run lint` clean, Swagger UI loads with all 25 endpoints documented.

### Verification

- [x] All unit tests pass. Build clean. No lint errors. Swagger complete.

---

## Final Verification

- [x] All acceptance criteria from spec.md met
- [x] All 25 endpoints return identical responses to v3
- [x] Tests passing
- [x] Build succeeds
- [x] Ready for merge to main

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
