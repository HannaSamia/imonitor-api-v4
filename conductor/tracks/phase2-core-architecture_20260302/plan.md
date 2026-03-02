# Implementation Plan: Phase 2 — Core Architecture Setup

**Track ID:** phase2-core-architecture_20260302
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-02
**Status:** [ ] Not Started

## Overview

Build the cross-cutting architecture layer that sits between the infrastructure (Phase 1) and the feature modules (Phase 3). This phase produces the guards, interceptors, filters, middleware, DTOs, pipes, and shared utilities that every feature module will depend on.

**Git branch:** `migration/phase-2-core-architecture`

---

## Phase 1: SharedModule — Base DTOs, Pagination, Utilities

Create the shared module exporting base DTOs, pagination helper, date helper, password utility, common functions, enums, and constants.

### Tasks

- [ ] Task 1.1: Create `src/shared/shared.module.ts` — global module exporting all shared providers
- [ ] Task 1.2: Create `src/shared/dto/pagination.dto.ts` — `PaginationDto<T>` matching v3: `{ limit, page, nextPage, prevPage, nextUrl, prevUrl, totalPages, hasNext, hasPrev, data }`
- [ ] Task 1.3: Create `src/shared/dto/api-response.dto.ts` — `ApiResponse<T>` with `{ success, status, message, result? }` matching v3 `Response.ts`
- [ ] Task 1.4: Create `src/shared/dto/base.dto.ts` — `BodyIdDto`, `FavoriteDto`, `ShareDto`, `NodeInfoDto`, `SystemConfigDto`, `RequestArchiveDto` with class-validator decorators
- [ ] Task 1.5: Create `src/shared/helpers/pagination.helper.ts` — `getPagination(page, size, defaultLimit)` and `buildPaginationResponse(paginationObject, search, fullUrl)` matching v3 signatures
- [ ] Task 1.6: Create `src/shared/services/date-helper.service.ts` — `DateHelperService` implementing all `IDateHelper` methods from v3 using `date-fns`
- [ ] Task 1.7: Create `src/shared/services/password.service.ts` — `PasswordService` with `hashPassword()` (bcrypt, 10 rounds) and `isPasswordValid()` matching v3 `password.util.ts`
- [ ] Task 1.8: Create `src/shared/helpers/common.helper.ts` — port v3 `common.util.ts` functions: `generateGuid`, `multipleColumnSet`, `isEmptyString`, `isBlankString`, `isUndefinedOrNull`, `DeepCopyFunction`, `msisdnFormater`, `generateRandomPassword`, `normalizeFileName`, `ensureDirCreation`, `fileExists`, `generateHash`, `getPdfHeight`
- [ ] Task 1.9: Create `src/shared/enums/` — port all v3 enums: `AvailableRoles`, `AvailableModules`, `StatusCodes` (success/error/redirect), `DateFormats`
- [ ] Task 1.10: Create `src/shared/constants/` — port v3 constants: `Tables` (table names), `SystemKeys` (sys_config keys), `ErrorMessages`
- [ ] Task 1.11: Install `date-fns` and `bcrypt` dependencies

### Verification

- [ ] `npm run build` compiles
- [ ] SharedModule is importable and all DTOs/helpers have correct types

**Commit:** `feat: add SharedModule with base DTOs, pagination, date helper, and utilities`

---

## Phase 2: JWT Authentication Guard

Implement the full JWT guard replacing v3's `jwtMiddleware` — token verification, user payload extraction, keepLogin bypass, and `@Public()` decorator.

### Tasks

- [ ] Task 2.1: Create `src/auth/decorators/public.decorator.ts` — `@Public()` using `SetMetadata(IS_PUBLIC_KEY, true)`
- [ ] Task 2.2: Create `src/auth/decorators/current-user.decorator.ts` — `@CurrentUser()` param decorator extracting `request.user`
- [ ] Task 2.3: Rewrite `src/auth/guards/jwt-auth.guard.ts` — full implementation:
  - Extract Bearer token from Authorization header
  - Verify JWT using `configService.get('JWT_KEY')` via `jsonwebtoken.verify()`
  - Decode payload: `{ id, email, credential, theme }` and attach to `request.user`
  - Query `core_application_users.keepLogin` — if true, decode without expiry check (`ignoreExpiration: true`)
  - Skip validation entirely when `NODE_ENV !== 'production'` and `NODE_ENV !== 'test'`
  - Honor `@Public()` decorator — skip if route is public
  - `clockTolerance: 60` seconds matching v3
- [ ] Task 2.4: Create `src/auth/interfaces/jwt-payload.interface.ts` — `JwtPayload { id: string; email: string; credential: string; theme: string; iat?: number; exp?: number; sub?: string; jti?: string }`
- [ ] Task 2.5: Register `JwtAuthGuard` as global `APP_GUARD` in `AppModule`
- [ ] Task 2.6: Install `jsonwebtoken` (already installed) — verify `@types/jsonwebtoken` exists

### Verification

- [ ] `npm run build` compiles
- [ ] Public routes (health check) are accessible without token
- [ ] Guard rejects requests with missing/invalid/expired tokens (returns 401)
- [ ] `keepLogin: true` users bypass expiry

**Commit:** `feat: add JWT auth guard with keepLogin bypass and @Public decorator`

---

## Phase 3: Role-Based Authorization Guards

Implement `RolesGuard` (static, for `strictAuthorize`) and `PrivilegeGuard` (dynamic, for `authorize`) — both query the database at request time.

### Tasks

- [ ] Task 3.1: Create `src/auth/decorators/roles.decorator.ts` — `@Roles(...roles: AvailableRoles[])` metadata decorator
- [ ] Task 3.2: Create `src/auth/decorators/module-name.decorator.ts` — `@ModuleName(module: AvailableModules)` metadata decorator
- [ ] Task 3.3: Create `src/auth/guards/roles.guard.ts` — `RolesGuard` (CanActivate):
  - Read `@Roles()` metadata for allowed roles and `@ModuleName()` for module context
  - Query `core_privileges` with user ID, module ID, and check role membership
  - SQL matching v3's `strictAuthorize`: `SELECT EXISTS(SELECT 1 FROM core_privileges WHERE moduleId=(SELECT id FROM core_modules WHERE name=?) AND userId=? AND roleId IN (SELECT id FROM core_application_roles WHERE name IN (?)))`
  - Return true/false; throw `ForbiddenException` on failure
- [ ] Task 3.4: Create `src/auth/guards/privilege.guard.ts` — `PrivilegeGuard` (CanActivate):
  - Query `core_minimum_privileges` by route path + HTTP method to find required role
  - Query `core_privileges` to get user's current role on that module
  - Call `hasPrivilege(currentRole, minimumRole)` using role hierarchy: `superadmin > admin > superuser > user > N/A`
  - If route not registered in `core_minimum_privileges`, allow through (matching v3 behavior)
  - Throw `ForbiddenException` on insufficient privilege
- [ ] Task 3.5: Create `src/auth/helpers/privilege.helper.ts` — `hasPrivilege(userRole: string, minimumRole: string): boolean` implementing v3's exact role hierarchy logic
- [ ] Task 3.6: Create `src/auth/guards/api-key.guard.ts` — `ApiKeyGuard` (CanActivate):
  - Read `access_token` header (lowercase)
  - Query `core_sys_config` for `utilityApiKey` value
  - Compare; throw `UnauthorizedException` on mismatch
  - Bypass in non-production (matching v3 `keyAuthorisation` behavior)

### Verification

- [ ] `npm run build` compiles
- [ ] `@Roles()` + `RolesGuard` can be applied to any controller method
- [ ] `PrivilegeGuard` correctly evaluates role hierarchy
- [ ] `ApiKeyGuard` reads from `core_sys_config`

**Commit:** `feat: add RolesGuard, PrivilegeGuard, and ApiKeyGuard`

---

## Phase 4: Response Transform Interceptor

Wrap all successful responses in the `ApiResponse<T>` envelope matching v3's wire format.

### Tasks

- [ ] Task 4.1: Create `src/shared/interceptors/transform.interceptor.ts` — `TransformInterceptor`:
  - On success, wrap response data in `{ success: true, status: statusCode, message: deriveMessage(statusCode), result: data }`
  - Message derivation: 200→`'200_SUCCESS'`, 201→`'201_CREATED'`, 204→`'204_DELETED'`, else `'SUCCESS'`
  - If handler returns `{ message: string, result: T }` directly, use that message
  - Skip wrapping for streaming/file responses (check `Content-Type` or `Content-Disposition`)
- [ ] Task 4.2: Register `TransformInterceptor` as global interceptor via `APP_INTERCEPTOR` in `AppModule`

### Verification

- [ ] All controller responses wrapped in `{ success, status, message, result }` envelope
- [ ] Custom messages from handlers are preserved

**Commit:** `feat: add response transform interceptor matching v3 ApiResponse format`

---

## Phase 5: Request Archive Interceptor

Log all authenticated requests to `core_requests_archive` with filesystem fallback.

### Tasks

- [ ] Task 5.1: Create `src/shared/interceptors/request-archive.interceptor.ts` — `RequestArchiveInterceptor`:
  - Fire before response (in `intercept()` using `tap()` operator)
  - Skip requests without Authorization header UNLESS URL is `/api/v1/auth/heartbeat`, `/api/v1/auth/login`, or `/api/v1/auth/token`
  - Extract userId: from `request.user.id` (authenticated), from `request.body.credential` (login), or `'unknown'`
  - Build `RequestArchiveDto`: `{ type, endpoint, userId, requestDate, payload, host }`
  - Insert into `core_requests_archive` via TypeORM repository
  - On DB failure: write JSON to `logs/request-archive/<YYYY-MM-DD>.json` (filesystem fallback)
  - Never block or fail the request — all errors are caught and logged
- [ ] Task 5.2: Register as global interceptor via `APP_INTERCEPTOR`

### Verification

- [ ] Authenticated requests are archived
- [ ] DB failure falls back to filesystem JSON
- [ ] Archive never blocks the request pipeline

**Commit:** `feat: add request archive interceptor with filesystem fallback`

---

## Phase 6: Request Filter Middleware + Rate Limiter

Implement malicious URL detection and Redis-backed rate limiting.

### Tasks

- [ ] Task 6.1: Create `src/shared/middleware/request-filter.middleware.ts` — `RequestFilterMiddleware`:
  - Try `decodeURIComponent(req.originalUrl)` — catch URIError
  - Check 5 suspicious patterns: `/\.%/`, `/%2e%2e/i`, `/%c0%ae/i`, `/%e0%80%ae/i`, `/cgi-bin/`
  - On detection: write to `core_malicious_requests` table (ipAddress, method, headers JSON, endpoint)
  - Return 401 `UnauthorizedException`
  - Log via `logger.emerg()` on write failure
- [ ] Task 6.2: Install `rate-limiter-flexible` dependency
- [ ] Task 6.3: Create `src/shared/middleware/rate-limiter.middleware.ts` — `RateLimiterMiddleware`:
  - Dual-layer: `RateLimiterRedis` (primary, using injected Redis client) + `RateLimiterMemory` (insurance fallback)
  - Config from `ConfigService`: `NB_OF_REQUESTS`, `RATE_LIMIT_DURATION_SEC`, `RATE_BLOCK_DURATION`
  - Key: `req.ip.replace(/^.*:/, '')` (strip IPv6 prefix)
  - On first excess (consumed === points+1): write IP to `core_rate_limiter` via TypeORM
  - Return **429** (fixing v3's 423 bug) with `{ statusCode: 429, message: 'Too Many Requests' }`
- [ ] Task 6.4: Register both middleware in `AppModule.configure()` — request filter before rate limiter, both before routes

### Verification

- [ ] Malicious URLs return 401 and log to `core_malicious_requests`
- [ ] Rate limiter blocks IPs exceeding threshold with 429
- [ ] Rate limiter falls back to in-memory when Redis is down

**Commit:** `feat: add request filter and rate limiter middleware`

---

## Phase 7: Global Exception Filter

Replace v3's `errorHandlerMiddleware` with a NestJS exception filter matching the exact error response format.

### Tasks

- [ ] Task 7.1: Create `src/shared/exceptions/application.exceptions.ts` — custom exception classes extending `HttpException`:
  - `ApplicationException` (base) with `errors?: any[]` field
  - `MissingFieldException` (400), `InvalidCredentialException` (400), `InvalidTokenException` (400), `InvalidIdException` (400)
  - All mirror v3's `ApplicationError` subclasses
- [ ] Task 7.2: Create `src/shared/filters/global-exception.filter.ts` — `GlobalExceptionFilter`:
  - `HttpException` handling: extract status, message, errors array
  - Format with `endpoint`, `method` for app-errors Winston transport
  - Format A (with errors): `{ status, message: 'One or More fields are incorrect', errors }`
  - Format B (message only): `{ status, message, success: false }`
  - Raw `Error` (500): `{ status: 500, message: 'Something went Wrong...', success: false, errors: [err] }` in prod; `err.message` in dev
  - Log all `HttpException` via `logger.error()` with `{ status, endpoint, method, timestamp }` metadata
  - Log raw 500s via `logger.emerg()` with stack trace
- [ ] Task 7.3: Register `GlobalExceptionFilter` via `APP_FILTER` in `AppModule`

### Verification

- [ ] 400/401/403/404 responses match v3 wire format exactly
- [ ] 500 responses hide error details in production
- [ ] All HTTP errors logged to app-errors transport with endpoint metadata
- [ ] Emergency errors logged to emergency transport

**Commit:** `feat: add global exception filter matching v3 error response format`

---

## Phase 8: Event System, Global Pipes, Helmet/CORS/Compression, main.ts

Wire up remaining cross-cutting concerns and finalize main.ts bootstrap.

### Tasks

- [ ] Task 8.1: Create `src/shared/events/base.event.ts` — `BaseEvent` abstract class with `timestamp`, `correlationId`, `eventName` fields
- [ ] Task 8.2: Create `src/shared/events/event-types.ts` — typed event name constants organized by domain (auth, dashboard, report, notification, observability, etc.) — empty listeners, just type definitions for Phase 3
- [ ] Task 8.3: Create `src/shared/pipes/validation.pipe.ts` — configure global `ValidationPipe` with `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`, `exceptionFactory` that returns `BadRequestException` matching v3's validation error format
- [ ] Task 8.4: Update `src/main.ts` — apply in order matching v3 middleware chain:
  1. `app.use(compression())`
  2. `app.use(helmet())`
  3. `app.enableCors()`
  4. `app.useGlobalPipes(validationPipe)`
  5. `app.use(express.json({ limit: '50mb' }))`
  6. `app.use(express.urlencoded({ extended: true }))`
  7. `app.enableShutdownHooks()` (fix from code review)
  8. Winston logger via `app.useLogger()`
  9. Swagger setup placeholder (module endpoint `/docs`)
  10. Clustering when CPUS > 1
- [ ] Task 8.5: Update `src/app.module.ts` — register all new global providers:
  - `APP_GUARD`: `JwtAuthGuard`
  - `APP_INTERCEPTOR`: `TransformInterceptor`, `RequestArchiveInterceptor`
  - `APP_FILTER`: `GlobalExceptionFilter`
  - Middleware: `CorrelationIdMiddleware`, `RequestFilterMiddleware`, `RateLimiterMiddleware`
  - Import: `SharedModule`
- [ ] Task 8.6: Create `.dockerignore` (fix from code review: prevent `.env`, `.git`, `node_modules` from leaking into Docker image)

### Verification

- [ ] `npm run build` compiles cleanly
- [ ] Middleware chain order matches v3's order (compression → helmet → cors → rate limiter → request filter → body parsers → routes → error handler)
- [ ] All guards/interceptors/filters are globally registered
- [ ] `enableShutdownHooks()` enables `OnModuleDestroy` lifecycle hooks

**Commit:** `feat: add event system, global validation pipe, and finalize main.ts bootstrap`

---

## Phase 9: Code Review Fixes from Phase 1

Address Critical and High findings from the Phase 1 code review that impact Phase 2.

### Tasks

- [ ] Task 9.1: Enable `strict: true` in `tsconfig.json` and fix all resulting type errors across the codebase
- [ ] Task 9.2: Fix connection release — wrap `connection.release()` in `finally` blocks in `LegacyDataDbService` and `LegacyEtlDbService`
- [ ] Task 9.3: Add `OnModuleDestroy` to `LegacyDataDbService` (close both pools) and `LegacyEtlDbService` (close pool)
- [ ] Task 9.4: Remove `JSON.parse(JSON.stringify(...))` from legacy DB query/multiQuery methods — return rows directly
- [ ] Task 9.5: Fix Presto client — lazy-initialize once and reuse (not per-query); add dedicated `PRESTO_HOST`/`PRESTO_PORT` env vars
- [ ] Task 9.6: Add `enableShutdownHooks()` to `main.ts` (covered in Task 8.4)

### Verification

- [ ] `npm run build` compiles with `strict: true`
- [ ] Legacy DB services use `try/finally` for connection release
- [ ] `OnModuleDestroy` properly closes pools

**Commit:** `fix: address Phase 1 code review findings (strict mode, connection leaks, pool cleanup)`

---

## Final Verification

- [ ] All 14 acceptance criteria from spec.md are met
- [ ] `npm run build` compiles cleanly with `strict: true`
- [ ] Middleware chain order matches v3: compression → helmet → cors → rate limiter → request filter → body parsers → correlation ID → routes → error handler
- [ ] Guards execute in order: JwtAuthGuard → RolesGuard/PrivilegeGuard (per-route)
- [ ] Error responses match v3 wire format for 400/401/403/404/500
- [ ] Success responses wrapped in `{ success, status, message, result }` envelope
- [ ] Request archive writes to DB with filesystem fallback
- [ ] All Phase 1 code review Critical/High findings addressed
- [ ] Git log shows clean commit history with conventional commits
- [ ] Branch pushed and ready for merge to main
- [ ] Tag: `v0.2.0-migration-phase2`

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
