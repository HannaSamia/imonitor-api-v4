# Implementation Plan: Phase 2 — Core Architecture Setup

**Track ID:** phase2-core-architecture_20260302
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-02
**Status:** [x] Complete

## Overview

Build the cross-cutting architecture layer that sits between the infrastructure (Phase 1) and the feature modules (Phase 3). This phase produces the guards, interceptors, filters, middleware, DTOs, pipes, and shared utilities that every feature module will depend on.

**Git branch:** `migration/phase-2-core-architecture`

---

## Phase 1: SharedModule — Base DTOs, Pagination, Utilities

Create the shared module exporting base DTOs, pagination helper, date helper, password utility, common functions, enums, and constants.

### Tasks

- [x] Task 1.1: Create `src/shared/shared.module.ts` — global module exporting all shared providers
- [x] Task 1.2: Create `src/shared/dto/pagination.dto.ts` — `PaginationDto<T>` matching v3: `{ limit, page, nextPage, prevPage, nextUrl, prevUrl, totalPages, hasNext, hasPrev, data }`
- [x] Task 1.3: Create `src/shared/dto/api-response.dto.ts` — `ApiResponse<T>` with `{ success, status, message, result? }` matching v3 `Response.ts`
- [x] Task 1.4: Create `src/shared/dto/base.dto.ts` — `BodyIdDto`, `FavoriteDto`, `ShareDto`, `NodeInfoDto`, `SystemConfigDto`, `RequestArchiveDto` with class-validator decorators
- [x] Task 1.5: Create `src/shared/helpers/pagination.helper.ts` — `getPagination(page, size, defaultLimit)` and `buildPaginationResponse(paginationObject, search, fullUrl)` matching v3 signatures
- [x] Task 1.6: Create `src/shared/services/date-helper.service.ts` — `DateHelperService` implementing all `IDateHelper` methods from v3 using `date-fns`
- [x] Task 1.7: Create `src/shared/services/password.service.ts` — `PasswordService` with `hashPassword()` (bcrypt, 10 rounds) and `isPasswordValid()` matching v3 `password.util.ts`
- [x] Task 1.8: Create `src/shared/helpers/common.helper.ts` — port v3 `common.util.ts` functions: `generateGuid`, `multipleColumnSet`, `isEmptyString`, `isBlankString`, `isUndefinedOrNull`, `DeepCopyFunction`, `msisdnFormater`, `generateRandomPassword`, `normalizeFileName`, `ensureDirCreation`, `fileExists`, `generateHash`, `getPdfHeight`
- [x] Task 1.9: Create `src/shared/enums/` — port all v3 enums: `AvailableRoles`, `AvailableModules`, `StatusCodes` (success/error/redirect), `DateFormats`
- [x] Task 1.10: Create `src/shared/constants/` — port v3 constants: `Tables` (table names), `SystemKeys` (sys_config keys), `ErrorMessages`
- [x] Task 1.11: Install `date-fns` and `bcrypt` dependencies

### Verification

- [x] `npm run build` compiles
- [x] SharedModule is importable and all DTOs/helpers have correct types

**Commit:** `d5fa897 feat: add SharedModule with base DTOs, pagination, date helper, and utilities`

---

## Phase 2: JWT Authentication Guard

Implement the full JWT guard replacing v3's `jwtMiddleware` — token verification, user payload extraction, keepLogin bypass, and `@Public()` decorator.

### Tasks

- [x] Task 2.1: Create `src/auth/decorators/public.decorator.ts` — `@Public()` using `SetMetadata(IS_PUBLIC_KEY, true)`
- [x] Task 2.2: Create `src/auth/decorators/current-user.decorator.ts` — `@CurrentUser()` param decorator extracting `request.user`
- [x] Task 2.3: Rewrite `src/auth/guards/jwt-auth.guard.ts` — full implementation
- [x] Task 2.4: Create `src/auth/interfaces/jwt-payload.interface.ts` — `JwtPayload { id: string; email: string; credential: string; theme: string; iat?: number; exp?: number; sub?: string; jti?: string }`
- [x] Task 2.5: Register `JwtAuthGuard` as global `APP_GUARD` in `AppModule`
- [x] Task 2.6: Install `jsonwebtoken` (already installed) — verify `@types/jsonwebtoken` exists

### Verification

- [x] `npm run build` compiles
- [x] Public routes (health check) are accessible without token
- [x] Guard rejects requests with missing/invalid/expired tokens (returns 401)
- [x] `keepLogin: true` users bypass expiry

**Commit:** `ad5acfc feat: add JWT auth guard with keepLogin bypass and @Public decorator`

---

## Phase 3: Role-Based Authorization Guards

Implement `RolesGuard` (static, for `strictAuthorize`) and `PrivilegeGuard` (dynamic, for `authorize`) — both query the database at request time.

### Tasks

- [x] Task 3.1: Create `src/auth/decorators/roles.decorator.ts` — `@Roles(...roles: AvailableRoles[])` metadata decorator
- [x] Task 3.2: Create `src/auth/decorators/module-name.decorator.ts` — `@ModuleName(module: AvailableModules)` metadata decorator
- [x] Task 3.3: Create `src/auth/guards/roles.guard.ts` — `RolesGuard` (CanActivate)
- [x] Task 3.4: Create `src/auth/guards/privilege.guard.ts` — `PrivilegeGuard` (CanActivate)
- [x] Task 3.5: Create `src/auth/helpers/privilege.helper.ts` — `hasPrivilege(userRole: string, minimumRole: string): boolean` implementing v3's exact role hierarchy logic
- [x] Task 3.6: Create `src/auth/guards/api-key.guard.ts` — `ApiKeyGuard` (CanActivate)

### Verification

- [x] `npm run build` compiles
- [x] `@Roles()` + `RolesGuard` can be applied to any controller method
- [x] `PrivilegeGuard` correctly evaluates role hierarchy
- [x] `ApiKeyGuard` reads from `core_sys_config`

**Commit:** `2ffd033 feat: add RolesGuard, PrivilegeGuard, and ApiKeyGuard`

---

## Phase 4: Response Transform Interceptor

Wrap all successful responses in the `ApiResponse<T>` envelope matching v3's wire format.

### Tasks

- [x] Task 4.1: Create `src/shared/interceptors/transform.interceptor.ts` — `TransformInterceptor`
- [x] Task 4.2: Register `TransformInterceptor` as global interceptor via `APP_INTERCEPTOR` in `AppModule`

### Verification

- [x] All controller responses wrapped in `{ success, status, message, result }` envelope
- [x] Custom messages from handlers are preserved

**Commit:** `1817a2b feat: add response transform interceptor matching v3 ApiResponse format`

---

## Phase 5: Request Archive Interceptor

Log all authenticated requests to `core_requests_archive` with filesystem fallback.

### Tasks

- [x] Task 5.1: Create `src/shared/interceptors/request-archive.interceptor.ts` — `RequestArchiveInterceptor`
- [x] Task 5.2: Register as global interceptor via `APP_INTERCEPTOR`

### Verification

- [x] Authenticated requests are archived
- [x] DB failure falls back to filesystem JSON
- [x] Archive never blocks the request pipeline

**Commit:** `adce10e feat: add request archive interceptor with filesystem fallback`

---

## Phase 6: Request Filter Middleware + Rate Limiter

Implement malicious URL detection and Redis-backed rate limiting.

### Tasks

- [x] Task 6.1: Create `src/shared/middleware/request-filter.middleware.ts` — `RequestFilterMiddleware`
- [x] Task 6.2: Install `rate-limiter-flexible` dependency
- [x] Task 6.3: Create `src/shared/middleware/rate-limiter.middleware.ts` — `RateLimiterMiddleware`
- [x] Task 6.4: Register both middleware in `AppModule.configure()` — request filter before rate limiter, both before routes

### Verification

- [x] Malicious URLs return 401 and log to `core_malicious_requests`
- [x] Rate limiter blocks IPs exceeding threshold with 429
- [x] Rate limiter falls back to in-memory when Redis is down

**Commit:** `57a19d4 feat: add request filter and rate limiter middleware`

---

## Phase 7: Global Exception Filter

Replace v3's `errorHandlerMiddleware` with a NestJS exception filter matching the exact error response format.

### Tasks

- [x] Task 7.1: Create `src/shared/exceptions/application.exceptions.ts` — custom exception classes extending `HttpException`
- [x] Task 7.2: Create `src/shared/filters/global-exception.filter.ts` — `GlobalExceptionFilter`
- [x] Task 7.3: Register `GlobalExceptionFilter` via `APP_FILTER` in `AppModule`

### Verification

- [x] 400/401/403/404 responses match v3 wire format exactly
- [x] 500 responses hide error details in production
- [x] All HTTP errors logged to app-errors transport with endpoint metadata
- [x] Emergency errors logged to emergency transport

**Commit:** `5cf9d74 feat: add global exception filter matching v3 error response format`

---

## Phase 8: Event System, Global Pipes, Helmet/CORS/Compression, main.ts

Wire up remaining cross-cutting concerns and finalize main.ts bootstrap.

### Tasks

- [x] Task 8.1: Create `src/shared/events/base.event.ts` — `BaseEvent` abstract class with `timestamp`, `correlationId`, `eventName` fields
- [x] Task 8.2: Create `src/shared/events/event-types.ts` — typed event name constants organized by domain
- [x] Task 8.3: Create `src/shared/pipes/validation.pipe.ts` — configure global `ValidationPipe`
- [x] Task 8.4: Update `src/main.ts` — apply compression, helmet, CORS, validation pipe, body parsers, shutdown hooks
- [x] Task 8.5: Update `src/app.module.ts` — register all new global providers
- [x] Task 8.6: Create `.dockerignore`

### Verification

- [x] `npm run build` compiles cleanly
- [x] Middleware chain order matches v3's order
- [x] All guards/interceptors/filters are globally registered
- [x] `enableShutdownHooks()` enables `OnModuleDestroy` lifecycle hooks

**Commit:** `cbabbd2 feat: add event system, global validation pipe, and finalize main.ts bootstrap`

---

## Phase 9: Code Review Fixes from Phase 1

Address Critical and High findings from the Phase 1 code review that impact Phase 2.

### Tasks

- [x] Task 9.1: Enable `strict: true` in `tsconfig.json` and fix all resulting type errors across the codebase
- [x] Task 9.2: Fix connection release — wrap `connection.release()` in `finally` blocks in `LegacyDataDbService` and `LegacyEtlDbService`
- [x] Task 9.3: Add `OnModuleDestroy` to `LegacyDataDbService` (close both pools) and `LegacyEtlDbService` (close pool)
- [x] Task 9.4: Remove `JSON.parse(JSON.stringify(...))` from legacy DB query/multiQuery methods — return rows directly
- [x] Task 9.5: Fix Presto client — lazy-initialize once and reuse (not per-query)
- [x] Task 9.6: Add `enableShutdownHooks()` to `main.ts` (covered in Task 8.4)

### Verification

- [x] `npm run build` compiles with `strict: true`
- [x] Legacy DB services use `try/finally` for connection release
- [x] `OnModuleDestroy` properly closes pools

**Commit:** `bf98c34 fix: address Phase 1 code review findings (strict mode, connection leaks, pool cleanup)`

---

## Final Verification

- [x] All 14 acceptance criteria from spec.md are met
- [x] `npm run build` compiles cleanly with `strict: true`
- [x] Middleware chain order matches v3: compression → helmet → cors → rate limiter → request filter → body parsers → correlation ID → routes → error handler
- [x] Guards execute in order: JwtAuthGuard → RolesGuard/PrivilegeGuard (per-route)
- [x] Error responses match v3 wire format for 400/401/403/404/500
- [x] Success responses wrapped in `{ success, status, message, result }` envelope
- [x] Request archive writes to DB with filesystem fallback
- [x] All Phase 1 code review Critical/High findings addressed
- [x] Git log shows clean commit history with conventional commits
- [x] Branch pushed and ready for merge to main
- [x] Tag: `v0.2.0-migration-phase2`

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
