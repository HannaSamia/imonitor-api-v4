# Requirements: Phase 3.1 Auth & Users Module Refactoring

## Problem Statement

The Phase 3.1 Auth & Users module has been implemented and passes 29 unit tests. However, a comprehensive multi-dimensional code review (Security, Performance, Architecture, Testing) identified 49 findings: 6 Critical, 15 High, 20 Medium, 8 Low. The most severe issues include complete authentication bypasses in the JWT guard, missing database indexes, a God-service anti-pattern, and significant test coverage gaps. These must be addressed before the module is production-ready.

## Acceptance Criteria

- [ ] All 6 Critical findings fixed and verified
- [ ] All 15 High findings fixed and verified
- [ ] All 20 Medium findings addressed or documented as intentionally deferred
- [ ] All 8 Low findings addressed or documented as intentionally deferred
- [ ] All existing 29 tests continue to pass (no regressions)
- [ ] New tests added for previously uncovered methods and branches
- [ ] Build clean (zero errors)
- [ ] Lint clean (zero warnings)
- [ ] JwtAuthGuard refactored to use @nestjs/jwt module
- [ ] Guard raw SQL converted to TypeORM repository queries
- [ ] UsersService split into focused services (SRP compliance)

## Scope

### In Scope

**Security Fixes (Critical + High):**
- CR-001: Fix JwtAuthGuard dev bypass — always verify JWT signatures
- CR-002: Fix keepLogin JWT signature bypass — always call jwt.verify()
- H-01: PrivilegeGuard deny-by-default when route not in DB
- H-02: Validate refresh token even for keepLogin users
- H-03: Remove keepLogin/allowMultipleSessions from EditSelfDto
- H-04: Fix API key guard non-production bypass
- H-14: Invalidate refresh tokens on password change/reset
- JWT algorithm enforcement (HS256 explicit)

**Performance Fixes:**
- H-05: Cache system config values with TTL in SystemConfigService
- H-06: Batch privilege updates (group by roleId, use transaction)
- H-07: Wrap user registration in a transaction
- M-05/M-06: Add pagination to getAll and getEmails
- M-07: Add database indexes on users entity (userName, email, isDeleted)
- M-08: Add composite index on core_privileges (UserId, ModuleId)
- M-09: Parallelize canAccessModule queries
- M-10: Cache roles and modules reference data
- M-11: Add index on refresh token jwtId

**Architecture Fixes:**
- CR-003: Rename auth module file to eliminate naming collision
- H-08: Split UsersService into focused services (Users, Privileges, Settings)
- H-09: Convert guard raw SQL to TypeORM repositories
- H-10: Create CoreDataModule for shared entity registration
- H-11: Keep logout as GET for v3 parity (document as known deviation from REST)
- Adopt @nestjs/jwt module replacing raw jsonwebtoken usage
- M-02: Add MinLength/MaxLength to ChangePasswordDto
- M-12: Split UserPrivilegesDto into input/output DTOs
- M-13: Standardize response format across controllers
- M-16: Document duplicate refreshToken/refreshTokenTimer (v3 parity)
- M-17: Keep register returning 200 (v3 parity)

**Testing Improvements:**
- Add controller tests for AuthController and UsersController
- Add tests for 10 uncovered UsersService methods
- Add missing branch tests for AuthService (refreshToken, logout, login)
- Improve assertion quality (exact dates, JWT payload verification)

### Out of Scope

- Frontend components (this is a backend-only API)
- Changing HTTP methods for v3 parity endpoints (logout GET stays)
- Changing error messages (preserve v3 exact messages including typos)
- Changing route paths or response envelope shapes
- E2E/integration tests with real database
- Rate limiting implementation (requires infrastructure decisions)
- Account enumeration fix (would change v3 error messages)

## Technical Constraints

- **v3 API parity**: Must preserve exact error messages (including typos), route paths, HTTP methods, and response shapes from iMonitor v3
- **Global guard impact**: JwtAuthGuard is registered as APP_GUARD — changes affect ALL authenticated endpoints
- **Existing database**: Schema changes must be backward-compatible with existing `iMonitorV3_1` MariaDB database
- **No breaking changes**: API contract must remain identical for existing v3 frontend consumers

## Technology Stack

- **Backend**: NestJS 10
- **ORM**: TypeORM
- **Database**: MariaDB (iMonitorV3_1)
- **Auth**: jsonwebtoken -> @nestjs/jwt migration
- **Validation**: class-validator, class-transformer
- **Testing**: Jest
- **Other**: uuid, bcrypt, @nestjs/event-emitter, @nestjs/config

## Dependencies

- Guard changes (JwtAuthGuard, PrivilegeGuard, ApiKeyGuard) are global — affect all authenticated routes
- UsersService split will require updating UsersModule imports/exports and any module that imports UsersService
- CoreDataModule creation will require updating AuthEndpointsModule and UsersModule imports
- @nestjs/jwt package must be installed

## Configuration

- Stack: nestjs-typeorm-mariadb
- API Style: rest
- Complexity: complex
