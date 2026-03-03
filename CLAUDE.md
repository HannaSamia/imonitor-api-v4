# iMonitor API v4 — Claude Code Instructions

## Project Overview

Enterprise telecom monitoring API migrating from Express.js v3 to NestJS v4.

- **Source (READ ONLY):** `../imonitor-v3-api/` — Express.js + InversifyJS + TSOA
- **Target (WRITE HERE):** this repo — NestJS 10 + TypeORM 0.3.x
- **Database:** iMonitorV3_1 (MariaDB 11.3.2) — TypeORM entities, `synchronize: false` ALWAYS
- **Legacy DBs:** iMonitorData, EtlV3_2, Presto — keep raw SQL via `mysql2` pools, do NOT convert to TypeORM
- **DB is behind SDQ** — no direct access. Use `db.sql` in v3 repo as schema source of truth.
- **Node.js 18+**, TypeScript strict mode, NestJS 10

## Key Files to Read First

| File | Purpose |
|------|---------|
| `MIGRATION.md` | Full migration plan, phase definitions, module dependency map, risk assessment |
| `conductor/product.md` | Product vision and domain context |
| `conductor/tech-stack.md` | Technology decisions and rationale |
| `conductor/workflow.md` | Dev workflow (TDD, commits, branching) |
| `conductor/tracks.md` | Track registry and status |
| `conductor/tracks/<track-id>/plan.md` | Current track implementation plan |
| `docs/phase3.1-auth-users-analysis.md` | v3 code analysis for auth/users |

## Migration Progress

| Phase | Branch | Status | Tag |
|-------|--------|--------|-----|
| 1: Scaffolding & Infrastructure | `migration/phase-1-scaffolding-typeorm` | Complete | — |
| 2: Core Architecture | `migration/phase-2-core-architecture` | Complete | — |
| 3.1: Auth & Users | `migration/phase-3.1-auth-users` | Complete | `v0.3.1-migration-phase3.1` |
| 3.2: Core Features | `migration/phase-3.2-core-features` | Pending | — |
| 3.3: Reporting | `migration/phase-3.3-reporting` | Pending | — |
| 3.4: Dashboards | `migration/phase-3.4-dashboards` | Pending | — |
| 3.5: Monitoring | `migration/phase-3.5-monitoring` | Pending | — |
| 3.6: Customer Care | `migration/phase-3.6-customer-care` | Pending | — |
| 3.7: Processing | `migration/phase-3.7-processing` | Pending | — |
| 3.8: Automation & Admin | `migration/phase-3.8-automation-admin` | Pending | — |
| 3.9: Background Jobs | `migration/phase-3.9-background-jobs` | Pending | — |
| 4: Socket.IO | `migration/phase-4-socketio` | Pending | — |
| 5: Testing & Validation | `migration/phase-5-testing` | Pending | `v1.0.0-nestjs-migration` |

## Architecture

### Core Patterns
- **Standard NestJS modular architecture** — NOT onion/clean/hexagonal
- **No CQRS** — controller → service for all modules
- **Event-driven side effects** via `@nestjs/event-emitter` (EventEmitter2, maxListeners: 50)
- **SharedModule** (global) for cross-cutting: guards, interceptors, decorators, DTOs, services
- **CoreDataModule** (global) for TypeORM repositories of 6 core auth/user entities
- **JWT auth** via `@nestjs/jwt` (`JwtService`, NOT raw `jsonwebtoken`)

### Module Organization
```
src/
├── app.module.ts              # Root — config, DB, middleware, global providers
├── main.ts                    # Bootstrap — cluster, compression, helmet, CORS, Swagger
├── auth/                      # Infrastructure auth (guards, decorators, helpers, interfaces)
│   ├── guards/                # JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard
│   ├── decorators/            # @Public, @CurrentUser, @Roles, @ModuleName
│   └── helpers/               # hasPrivilege() pure function
├── config/                    # Joi env validation schema
├── database/                  # TypeORM module, entities (~70), migrations, legacy DB modules
│   ├── entities/              # All TypeORM entities for iMonitorV3_1
│   ├── migrations/            # TypeORM migrations
│   ├── legacy-data-db/        # iMonitorData (mysql2 pools)
│   ├── legacy-etl-db/         # EtlV3_2 (mysql2 pool)
│   └── legacy-presto/         # Presto client
├── health/                    # /health endpoint (Terminus)
├── logger/                    # Winston + CorrelationIdMiddleware
├── redis/                     # ioredis module + service
├── cluster/                   # Node.js cluster service
├── modules/                   # Feature modules
│   ├── auth/                  # Auth endpoints (login, logout, refresh, heartbeat, access)
│   └── users/                 # Users CRUD, privileges, passwords, settings
└── shared/                    # Global utilities
    ├── constants/             # ErrorMessages, SystemKeys
    ├── dto/                   # ApiResponse, PaginationDto
    ├── enums/                 # AvailableRoles, AvailableModules, ROLE_HIERARCHY
    ├── events/                # BaseEvent, EventTypes
    ├── exceptions/            # ApplicationException + typed variants
    ├── filters/               # GlobalExceptionFilter
    ├── helpers/               # Common utils, pagination
    ├── interceptors/          # TransformInterceptor, RequestArchiveInterceptor
    ├── middleware/             # RateLimiterMiddleware, RequestFilterMiddleware
    ├── pipes/                 # createValidationPipe factory
    └── services/              # DateHelperService, PasswordService, SystemConfigService
```

### Global Providers (registered in AppModule)
- `APP_GUARD` → `JwtAuthGuard` (all routes unless `@Public()`)
- `APP_INTERCEPTOR` → `TransformInterceptor` (response envelope: `{ success, status, message, result }`)
- `APP_INTERCEPTOR` → `RequestArchiveInterceptor` (fire-and-forget request logging)
- `APP_FILTER` → `GlobalExceptionFilter`

### Middleware Stack (applied to all `'*'` routes in order)
1. `RequestFilterMiddleware` — blocks directory traversal, CGI probing, malformed URIs
2. `RateLimiterMiddleware` — Redis-backed with in-memory fallback (429 on excess)
3. `CorrelationIdMiddleware` — injects/propagates `x-correlation-id` via AsyncLocalStorage

### Response Envelope
All responses wrapped by `TransformInterceptor`:
```json
{ "success": true, "status": 200, "message": "200_SUCCESS", "result": <data> }
```
File downloads (Content-Disposition) skip the envelope.

## Database Architecture

### iMonitorV3_1 (TypeORM — primary)
- MariaDB, entities auto-loaded from `src/database/entities/`
- `synchronize: false`, `migrationsRun: false` — ALWAYS
- Pool: `DB_POOL_SIZE` (default 20), keep-alive enabled
- **TypeORM 0.3.x modern syntax required:**
  - `relations: { role: true }` NOT `relations: ['role']`
  - `select: { id: true, email: true }` NOT `select: ['id', 'email']`
  - `findOne({ where: { ... } })` NOT `findOne({ id })`

### iMonitorData (Legacy — raw SQL)
- `LegacyDataDbService` extends `AbstractLegacyDbService`
- Two pools: `LEGACY_DATA_DB` (full user, `multipleStatements: true`) and `LEGACY_DATA_LIMITED_DB` (restricted user)
- Inject via `@Inject(LEGACY_DATA_DB)` or use `LegacyDataDbService.query()`
- `nativeQuery()` method uses the limited pool

### EtlV3_2 (Legacy — raw SQL)
- `LegacyEtlDbService` extends `AbstractLegacyDbService`
- Single pool: `LEGACY_ETL_DB`

### Presto (Legacy — raw SQL)
- `LegacyPrestoService` with lazy-loaded `presto-client`
- `query<T>(sql, catalog='hive', schema='default')`

### AbstractLegacyDbService Features
- Connection-per-query pattern (get + release from pool)
- Auto-retry on `ECONNRESET`, `ETIMEDOUT`, `EHOSTUNREACH` (3 retries)
- `query()`, `multiQuery()`, `affectedQuery()`, `execute()`, `checkConnection()`

## Auth System

### Guards (all in `src/auth/guards/`)

| Guard | Scope | Decorators | Purpose |
|-------|-------|------------|---------|
| `JwtAuthGuard` | Global (`APP_GUARD`) | `@Public()` to skip | Verifies Bearer JWT, handles keepLogin |
| `PrivilegeGuard` | Per-controller (`@UseGuards`) | None (route-based) | Dynamic authz from `core_minimum_privileges` |
| `RolesGuard` | Per-handler (`@UseGuards`) | `@Roles()` + `@ModuleName()` | Static role check on handler level |
| `ApiKeyGuard` | Per-handler (`@UseGuards`) | None | Validates `access_token` header |

### JWT Flow
- Sign with `JwtService.sign()` (HS256, secret from `JWT_KEY` env)
- Payload: `{ id, email, credential, theme, keepLogin }` + `jti`, `sub`, `exp`
- `keepLogin: true` → guard allows expired tokens within 30-day max lifetime (SC-01)
- `keepLogin` embedded in JWT payload to avoid DB lookup in guard (PC-01)
- Token expiry and refresh token expiry read from `core_sys_config` table

### Security Fix Reference IDs (from code comments)
| ID | Fix |
|----|-----|
| SC-01 | 30-day maximum lifetime for keepLogin tokens |
| SC-02 | No plaintext password in password-reset event payload |
| PC-01 | `keepLogin` embedded in JWT, no DB query in guard |
| PC-02 | `core_minimum_privileges` cached at startup in PrivilegeGuard |
| PC-03 | `core_modules` cached at startup in RolesGuard |
| H-02 | Always validate refresh token (not conditionally) |
| H-06 | Batch UPDATE grouped by roleId for privilege updates |
| H-07 | User creation + default privileges in single transaction |
| H-14 | Invalidate all refresh tokens on password change |
| M-09 | Parallel role + module lookup in canAccessModule |
| PH-03 | Batch fetch config values instead of individual queries |

### Role Hierarchy
```
superadmin > admin > superuser > user > N/A
```
Defined in `ROLE_HIERARCHY` array (`src/shared/enums/roles.enum.ts`). Lower index = higher privilege.
`hasPrivilege(userRole, minimumRole)` uses case-insensitive `findIndex()` comparison.

### Custom Decorators
| Decorator | Key/Token | Usage |
|-----------|-----------|-------|
| `@Public()` | `IS_PUBLIC_KEY = 'isPublic'` | Skip JWT auth |
| `@CurrentUser(field?)` | Param decorator | Extract `request.user` or specific field |
| `@Roles(...roles)` | `ROLES_KEY = 'roles'` | Required roles for handler |
| `@ModuleName(name)` | `MODULE_NAME_KEY = 'moduleName'` | Module name for RolesGuard lookup |

## Existing Endpoints

### Auth (`api/v1/auth`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/login` | Public | Login with credential + password |
| POST | `/token` | Public | Refresh token rotation |
| POST | `/token/timer` | Public | Refresh token (timer variant) |
| GET | `/logout` | JWT | Invalidate refresh token, update lastLogout |
| GET | `/heartbeat` | JWT | Session keep-alive |
| POST | `/access` | JWT | Check module access privilege |

### Users (`api/v1/users`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/register` | Create new user (admin) |
| GET | `/` | List users (exclude current) |
| GET | `/all` | List all users |
| GET | `/emails` | Email list |
| GET | `/me` | Current user profile |
| GET | `/sidemenu` | Side menu tree |
| GET | `/module/:name/role` | User's role on module |
| GET | `/:id` | Get user by ID |
| PUT | `/theme` | Update theme (dark/light) |
| PUT | `/` | Edit own profile |
| PUT | `/:id` | Admin edit user |
| PUT | `/:id/privileges` | Update privilege tree |
| PUT | `/:id/lock` | Lock user |
| PUT | `/:id/unlock` | Unlock user |
| PATCH | `/resetpassword` | Change own password |
| PATCH | `/changepassword/:id` | Admin reset password |
| DELETE | `/:id` | Soft delete |
| GET | `/:id/privileges` | Get privilege tree |
| GET | `/settings` | System settings |
| GET | `/settings/:name` | Settings by category |

### Health (`/health`)
| Method | Path | Auth | Checks |
|--------|------|------|--------|
| GET | `/` | Public | DB ping, Redis ping, Memory heap 256MB |

## Code Standards

### TypeScript
- `strict: true` (with `strictPropertyInitialization: false` for TypeORM entities)
- Path aliases: `@app/*`, `@config/*`, `@database/*`, `@entities/*`
- ESLint flat config (v9+) with `@typescript-eslint` + `prettier`
- `@typescript-eslint/no-explicit-any: 'off'` — allowed but avoid where possible

### Controllers
- Swagger decorators: `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth('JWT')`
- All inputs: DTOs with `class-validator` decorators
- `@HttpCode(200)` on POST endpoints that don't create resources
- `@UseGuards(PrivilegeGuard)` on controllers needing dynamic authz

### Services
- Inject TypeORM repos with `@InjectRepository(Entity)`
- Use `createQueryBuilder` for complex queries with joins/conditions
- Use `repository.findOne()` / `repository.find()` for simple lookups
- Cross-module communication via events, not direct service imports
- Fire-and-forget DB logging should never block the request pipeline

### DTOs
- All fields decorated with `class-validator` (`@IsString`, `@IsNotEmpty`, `@IsEmail`, `@MinLength`, etc.)
- All fields decorated with `@ApiProperty` for Swagger
- Use `plainToInstance()` + `validate()` for programmatic validation
- Recursive DTOs use `@ValidateNested({ each: true })` + `@Type(() => ChildDto)`

### TypeORM
- `synchronize: false` — NEVER auto-sync schema
- Use modern 0.3.x syntax for `find` options (object form, not arrays)
- Preserve original column names from v3 DB (including typos like `connectifity`)
- Indexes defined with `@Index()` decorators, not manual migrations
- Entity column types must match `db.sql` exactly

### Error Messages
- Preserve v3's `ErrorMessages` constants exactly (including original typos)
- Located in `src/shared/constants/error-messages.ts`
- Use specific error types: `BadRequestException`, `UnauthorizedException`, `ForbiddenException`

## Testing

### Setup
- Jest with `ts-jest`, test environment: `node`
- Spec files co-located with source: `*.spec.ts`
- E2E tests in `test/` directory

### Current Stats: 214 tests, 16 suites, all passing

### Mocking Conventions
```typescript
// Repository mock
const usersRepo = {
  createQueryBuilder: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn().mockImplementation((data) => data),
  save: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  manager: { transaction: jest.fn().mockImplementation(async (cb) => cb(mockManager)) },
};

// QueryBuilder mock
function createMockQueryBuilder(result: any) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(result),
    getExists: jest.fn().mockResolvedValue(false),
  };
}

// DI setup
const module = await Test.createTestingModule({
  providers: [
    ServiceUnderTest,
    { provide: getRepositoryToken(Entity), useValue: mockRepo },
  ],
}).compile();
```

### Test Categories
- **Unit tests:** All services, guards, helpers, middleware
- **DTO validation tests:** Use `class-validator` `validate()` + `plainToInstance()`
- **Integration tests:** Controllers (TODO for future phases)
- **E2E tests:** `test/app.e2e-spec.ts` (scaffold only, expand in Phase 5)
- Flag any tests needing manual DB verification (SDQ-protected)

## Git Workflow

- **NEVER** commit directly to main
- Branch naming: `migration/phase-X.Y-description`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`
- Co-author: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Merge to main via `--no-ff` after each phase
- Tag with `vX.Y.Z-migration-phaseX.Y` after merge
- Always: `git checkout main && git pull origin main` before new branch

## Commands Available

| Command | Purpose |
|---------|---------|
| `npm run build` | `nest build` |
| `npm run start:dev` | `nest start --watch` |
| `npm run lint` | `eslint "src/**/*.ts" --fix` |
| `npm test` | `jest` (all unit tests) |
| `npm run test:cov` | `jest --coverage` |
| `npm run test:e2e` | `jest --config ./test/jest-e2e.json` |
| `npm run migration:generate` | Generate TypeORM migration |
| `npm run migration:run` | Run TypeORM migrations |
| `npm run migration:revert` | Revert last migration |

## Skill Commands

| Skill | Purpose |
|-------|---------|
| `/conductor:new-track` | Create new migration track with spec + plan |
| `/conductor:implement` | Execute tasks from a track's plan |
| `/conductor:status` | Show project and track status |
| `/conductor:revert` | Git-aware undo by track/phase/task |
| `/comprehensive-review:full-review` | Multi-phase code review (quality, security, perf, testing, best practices) |
| `/unit-testing:test-generate` | Generate comprehensive test suites |
| `/full-stack-orchestration:full-stack-feature` | End-to-end feature development |
| `/backend-development:feature-development` | Backend feature development |

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DB_HOST` | Yes | — | MariaDB host |
| `DB_PORT` | No | 3306 | MariaDB port |
| `DB_USER` | Yes | — | Full-privilege DB user |
| `DB_PASSWORD` | Yes | — | Allow empty |
| `DB_LIMIT_USER` | Yes | — | Restricted DB user (for nativeQuery) |
| `DB_LIMIT_PASSWORD` | Yes | — | Allow empty |
| `JWT_KEY` | Yes | — | Min 32 chars, HS256 secret |
| `MAIL_HOST` | Yes | — | SMTP host |
| `MAIL_FROM` | Yes | — | Sender address |
| `MAIL_AUTH_EMAIL` | Yes | — | SMTP auth email |
| `MAIL_AUTH_PASSWROD` | Yes | — | SMTP auth password (typo preserved from v3) |
| `PORT` | No | 5011 | API port |
| `CPUS` | No | 1 | Cluster workers (>1 enables clustering) |
| `NODE_ENV` | No | development | development/production/test |
| `CORS_ORIGIN` | No | `'*'` | CORS allowed origins |
| `DB_POOL_SIZE` | No | 20 | TypeORM connection pool |
| `REDIS_HOST` | No | localhost | Redis host |
| `REDIS_PORT` | No | 6379 | Redis port |
| `REDIS_PASSWORD` | No | `''` | Redis password |
| `NB_OF_REQUESTS` | No | 200 | Rate limiter: max requests |
| `RATE_LIMIT_DURATION_SEC` | No | 60 | Rate limiter: window in seconds |
| `RATE_BLOCK_DURATION` | No | 180 | Rate limiter: block duration in seconds |
| `coreDbName` | No | `` `iMonitorV3_1` `` | Core DB name (backtick-wrapped) |
| `dataDbName` | No | `` `iMonitorData` `` | Legacy data DB name |
| `etlDbName` | No | `` `EtlV3_2` `` | Legacy ETL DB name |

## Do NOT

- Modify any files in `../imonitor-v3-api/` (read-only reference)
- Modify the iMonitorV3_1 database schema
- Use `synchronize: true` in any TypeORM config
- Use raw `jsonwebtoken` — use `@nestjs/jwt` `JwtService`
- Install packages without explaining why
- Skip Swagger decorators on controllers
- Use raw SQL for iMonitorV3_1 queries — use TypeORM repositories
- Use TypeORM array syntax (`relations: ['role']`) — use object syntax (`relations: { role: true }`)
- Change `ErrorMessages` constants (preserve v3 typos for backward compatibility)
- Use direct service imports for cross-module communication — use events
- Create new legacy DB modules — use existing `LegacyDataDbService` / `LegacyEtlDbService` / `LegacyPrestoService`
- Auto-generate TypeORM migrations against production DB
- Skip unit tests for new services and guards
