# Specification: Phase 2 — Core Architecture Setup

**Track ID:** phase2-core-architecture_20260302
**Created:** 2026-03-02
**Status:** [ ] Not Started
**Depends on:** Phase 1 (v0.1.0-migration-phase1)

## Summary

Set up the core NestJS architecture layer that all 25 feature modules (Phase 3) will build on top of: SharedModule with base DTOs, pagination, and response envelope; full JWT authentication with keepLogin bypass and refresh tokens; dynamic + static role-based authorization guards; global interceptors for request archiving and response transformation; request filter middleware for malicious URL detection; rate limiter middleware; global exception filters matching v3's error hierarchy; event system scaffolding; and API key guard for utility endpoints.

This phase replaces **8 Express.js middlewares** and the v3 `ApiResponse` wrapper with NestJS-native guards, interceptors, filters, middleware, and pipes.

## Acceptance Criteria

1. **SharedModule** exports base DTOs (`PaginationDto`, `ApiResponse<T>`, `RequestArchiveDto`, `FavoriteDto`, `ShareDto`, `BodyIdDto`), pagination helper (`getPagination`, `buildPaginationResponse`), common utility functions, date helper service, and password hashing service.

2. **JwtAuthGuard** fully validates JWT tokens using `JWT_KEY` from config, extracts user payload (`id`, `email`, `credential`, `theme`), attaches decoded user to `request.user`, implements `keepLogin` bypass by querying `core_application_users.keepLogin`, and skips validation in development mode.

3. **RolesGuard** implements both `@Roles(AvailableRoles[])` decorator for static role checks via `core_privileges` table, and dynamic privilege checking via `core_minimum_privileges` table using route path + HTTP method lookup.

4. **ApiKeyGuard** validates `access_token` header against `core_sys_config.utilityApiKey` for utility endpoints.

5. **TransformInterceptor** wraps all successful responses in the `{ success: true, status, message, result }` envelope matching v3's `ApiResponse` format.

6. **RequestArchiveInterceptor** logs all authenticated requests (plus login/heartbeat/token endpoints) to `core_requests_archive` with filesystem JSON fallback on DB failure, matching v3 archive middleware exactly.

7. **RequestFilterMiddleware** detects malicious URLs (malformed URIs + 5 regex patterns), writes to `core_malicious_requests`, returns 401, matching v3 filter middleware.

8. **RateLimiterMiddleware** implements dual-layer rate limiting (Redis primary + in-memory fallback) using `rate-limiter-flexible` with `NB_OF_REQUESTS`/`RATE_LIMIT_DURATION_SEC`/`RATE_BLOCK_DURATION` config, logs first-excess IP to `core_rate_limiter`, returns 429 (fixing v3's 423 bug).

9. **GlobalExceptionFilter** handles all exceptions: `HttpException` subclasses produce `{ status, message, success: false }` with optional `errors` array; unhandled errors produce 500 with `logger.emerg()` logging; all HTTP errors log to Winston with endpoint/status/method metadata for the app-errors transport.

10. **Event system** scaffolded with `@nestjs/event-emitter` domain event base class and typed event constants — no listeners yet (those come in Phase 3 per module).

11. **Global ValidationPipe** registered with `class-validator` + `class-transformer` for automatic DTO validation, whitelist stripping, and transform enabled.

12. **Helmet, CORS, compression** middleware applied in `main.ts` matching v3's middleware chain order.

13. **All guards/interceptors/filters are registered** in AppModule — JWT guard as global `APP_GUARD` with `@Public()` decorator for unprotected routes.

14. `npm run build` compiles cleanly. No runtime dependencies on live database.

## Out of Scope

- Feature module controllers/services (Phase 3)
- Socket.IO gateways and WsGuard (Phase 4)
- Worker threads and cron jobs (Phase 3.9)
- Morgan HTTP logging (replaced by NestJS built-in request logging + Winston)
- Full token generation/refresh logic (Phase 3.1 Auth module — this phase only validates tokens)

## References

- MIGRATION.md Section 11, Phase 2 (sub-tasks 2.1–2.5)
- MIGRATION.md Section 2.4–2.5 (middleware chain and per-route middleware)
- MIGRATION.md Section 9 (Architecture Recommendation: modular, event-driven side effects)
- v3 source: `src/infrastructure/middleware/*.ts`, `src/core/utils/*.ts`, `src/infrastructure/dto/*.ts`, `src/application/api/base/Response.ts`
