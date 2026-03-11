# iMonitor API v4

NestJS migration of enterprise telecom monitoring API. Express.js v3 → NestJS v4.

## Project Structure

- Source (READ ONLY): `../imonitor-v3-api/`
- Target: this repo
- Migration plan: @MIGRATION.md
- Conductor context: @conductor/tracks.md
- Schema source of truth: `../imonitor-v3-api/db.sql` (no direct DB access — behind SDQ)

## Verification Commands

```bash
npm run build          # TypeScript compilation — MUST pass before commit
npm run lint           # ESLint + Prettier — MUST pass before commit
npm test               # Jest unit tests — 852 tests, 44 suites
npm run test:cov       # Coverage report
npm run test:e2e       # E2E tests (scaffold only until Phase 5)
```

## Migration Progress

| Phase | Branch | Status | Tag |
|-------|--------|--------|-----|
| 1: Scaffolding | `migration/phase-1-scaffolding-typeorm` | Done | — |
| 2: Core Architecture | `migration/phase-2-core-architecture` | Done | — |
| 3.1: Auth & Users | `migration/phase-3.1-auth-users` | Done | `v0.3.1-migration-phase3.1` |
| 3.2: Core Features | `migration/phase-3.2-core-features` | Done | `v0.3.2-migration-phase3.2` |
| 3.3.1: Reports | `migration/phase-3.3.1-reports` | Done | `v0.3.3.1-migration-phase3.3.1` |
| 3.3.2: WidgetBuilder, QBE | `migration/phase-3.3.2-reporting` | Done | `v0.3.3.2-migration-phase3.3.2` |
| 3.4: Dashboards | `migration/phase-3.4-dashboards` | Done | `v0.3.4-migration-phase3.4` |
| 3.5: Monitoring | `migration/phase-3.5-monitoring` | Done | `v0.3.5-migration-phase3.5` |
| 3.6: Customer Care | `migration/phase-3.6-customer-care` | Pending | — |
| 3.7: Processing | `migration/phase-3.7-processing` | Pending | — |
| 3.8: Automation & Admin | `migration/phase-3.8-automation-admin` | Pending | — |
| 3.9: Background Jobs | `migration/phase-3.9-background-jobs` | Pending | — |
| 4: Socket.IO | `migration/phase-4-socketio` | Pending | — |
| 5: Testing & Validation | `migration/phase-5-testing` | Pending | `v1.0.0-nestjs-migration` |
| 6: Parallel API Verification | `migration/phase-6-parallel-verification` | Pending | `v1.1.0-parallel-verified` |
| 7: QueryBuilder Refactor | `migration/phase-7-querybuilder-refactor` | Pending | `v1.2.0-querybuilder-refactored` |

## Database Rules

- **iMonitorV3_1** (MariaDB): TypeORM entities and repositories. `synchronize: false` ALWAYS.
- **iMonitorData, EtlV3_2, Presto**: Raw SQL only via `LegacyDataDbService` / `LegacyEtlDbService` / `LegacyPrestoService`. Do NOT convert to TypeORM.
- TypeORM 0.3.x modern syntax required:
  - `relations: { role: true }` NOT `relations: ['role']`
  - `select: { id: true, email: true }` NOT `select: ['id', 'email']`
  - `findOne({ where: { ... } })` NOT `findOne({ id })`
- Preserve original column names from v3 DB (including typos like `connectifity`).
- Flag tests needing manual DB verification with `// SDQ: requires manual verification`

## Code Rules

- TypeScript strict. Avoid `any` — use proper interfaces.
- JWT auth via `@nestjs/jwt` JwtService, not raw `jsonwebtoken`.
- Every controller endpoint: `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth`.
- Every input: DTOs with `class-validator` + `@ApiProperty` decorators.
- Cross-module side effects: `@nestjs/event-emitter`, not direct service imports.
- Preserve `ErrorMessages` constants exactly (including v3 typos for backward compat).
- Fire-and-forget DB logging (request archive, rate limiter) must never block requests.

## Architecture

```
src/
├── app.module.ts              # Root — config, DB, middleware, global providers
├── main.ts                    # Bootstrap — cluster, compression, helmet, CORS, Swagger
├── auth/                      # Infrastructure auth
│   ├── guards/                # JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard
│   ├── decorators/            # @Public, @CurrentUser, @Roles, @ModuleName
│   └── helpers/               # hasPrivilege() — role hierarchy comparison
├── database/
│   ├── entities/              # ~70 TypeORM entities for iMonitorV3_1
│   ├── migrations/            # TypeORM migrations
│   ├── legacy-data-db/        # iMonitorData (mysql2 pools)
│   ├── legacy-etl-db/         # EtlV3_2 (mysql2 pool)
│   └── legacy-presto/         # Presto client
├── modules/
│   ├── auth/                  # Auth endpoints (login, logout, refresh, heartbeat, access)
│   ├── users/                 # Users CRUD, privileges, passwords, settings
│   ├── modules/               # Module metadata — reports & widget builders by module
│   ├── reports/               # Reports CRUD, query builder, chart generation, exports
│   ├── widget-builder/        # WidgetBuilder CRUD, query service, 18 chart types
│   ├── qbe/                   # QBE (Query By Example) — raw SQL, 7 chart types
│   ├── dashboard/             # Dashboard CRUD, share, favorite, save default
│   ├── rotating-dashboard/    # Rotating dashboard CRUD, share, favorite
│   ├── data-analysis/         # Data analysis CRUD, share, exports (HTML/PDF/Excel)
│   ├── observability/         # Observability metrics, charts (8 types), dashboards — 30 endpoints
│   ├── connectivity/          # Connectivity status, history, Excel export — 3 endpoints
│   ├── notifications/         # Notification subscriptions, sent list, view/unsubscribe — 6 endpoints
│   ├── parameters/            # Dynamic param tables — CRUD + Excel export
│   └── node-definition/       # Dynamic node definition tables — CRUD + Excel export
└── shared/                    # Global: constants, DTOs, enums, events, filters, helpers,
                               #   interceptors, middleware, pipes, services
```

### Key Patterns
- Standard NestJS modular architecture (NOT onion/clean/hexagonal). No CQRS.
- `APP_GUARD` → `JwtAuthGuard` on all routes (skip with `@Public()`)
- `APP_INTERCEPTOR` → `TransformInterceptor` wraps responses: `{ success, status, message, result }`
- `APP_FILTER` → `GlobalExceptionFilter`
- Middleware order: `RequestFilterMiddleware` → `RateLimiterMiddleware` → `CorrelationIdMiddleware`
- `CoreDataModule` (global) registers repos for 9 core entities (users, roles, refresh tokens, privileges, modules, min-privileges, modules-tables, tables-field, params-table-relations)
- `SharedModule` (global) exports `DateHelperService`, `PasswordService`, `SystemConfigService`, `EncryptionHelperService`, `ExportHelperService`
- `DynamicTableService` (abstract) — Template Method base for Parameters (`tableType='param'`) and NodeDefinition (`tableType='nodes'`). Dynamic SQL with `sanitizeIdentifier()` [S-01], `validateDateFormat()` [S-02], and `AES_ENCRYPT`/`AES_DECRYPT` via `field.isEncrypted` [S-10]. Queries run against iMonitorData via `LegacyDataDbService`.

## Auth System

### Guards

| Guard | Scope | How to skip/use |
|-------|-------|-----------------|
| `JwtAuthGuard` | Global | `@Public()` to skip |
| `PrivilegeGuard` | `@UseGuards(PrivilegeGuard)` on controller | Route-based lookup in `core_minimum_privileges` cache |
| `RolesGuard` | `@UseGuards(RolesGuard)` on handler | Requires `@Roles()` + `@ModuleName()` decorators |
| `ApiKeyGuard` | `@UseGuards(ApiKeyGuard)` on handler | Checks `access_token` header |

### Role Hierarchy
```
superadmin > admin > superuser > user > N/A
```
`hasPrivilege(userRole, minimumRole)` in `src/auth/helpers/privilege.helper.ts`. Case-insensitive.

### Security Fix IDs (referenced in code comments)
| ID | Fix |
|----|-----|
| SC-01 | 30-day max lifetime for keepLogin tokens |
| SC-02 | No plaintext password in event payloads |
| PC-01 | keepLogin in JWT payload (no DB query in guard) |
| PC-02/03 | Guard caches loaded at startup (PrivilegeGuard, RolesGuard) |
| H-02 | Always validate refresh token |
| H-07 | User creation + privileges in single transaction |
| H-14 | Invalidate all refresh tokens on password change |
| PH-03 | Batch fetch config values |

## Existing Endpoints

### Auth (`api/v1/auth`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/login` | Public | Login |
| POST | `/token` | Public | Refresh token rotation |
| POST | `/token/timer` | Public | Refresh token (timer) |
| GET | `/logout` | JWT | Logout |
| GET | `/heartbeat` | JWT | Keep-alive |
| POST | `/access` | JWT | Check module access |

### Users (`api/v1/users`) — all JWT + PrivilegeGuard
POST `/register`, GET `/` `/all` `/emails` `/me` `/sidemenu` `/module/:name/role` `/:id` `/:id/privileges`, PUT `/theme` `/` `/:id` `/:id/privileges` `/:id/lock` `/:id/unlock`, PATCH `/resetpassword` `/changepassword/:id`, DELETE `/:id`, GET `/settings` `/settings/:name`

### Modules (`api/v1/modules`) — all JWT + PrivilegeGuard
GET `/reports` `/widgetbuilders` `/:id/report` `/:id/widgetbuilder`

### Parameters (`api/v1/paramstable`) — all JWT + PrivilegeGuard
GET `/` `/export/excel` `/export/excel/:id` `/:id`, POST `/`, PUT `/`

### Node Definition (`api/v1/nodedefinition`) — all JWT + PrivilegeGuard
GET `/` `/export/excel` `/export/excel/:id` `/:id`, POST `/`, PUT `/`

### Reports (`api/v1/reports`) — all JWT + PrivilegeGuard
GET `/privileges/tables` `/` `/:id` `/shared/:id` `/closetab/:reportId/:chartId`
POST `/` `/:id/share` `/shared/:id` `/generate/tabular` `/generate/query` `/generate/pie` `/generate/doughnut` `/generate/trend` `/generate/bar/vertical` `/generate/bar/horizontal` `/generate/progress` `/generate/progress/exploded` `/dataanalysis/chart`
PUT `/:id` `/rename` `/favorite/:id` `/transfer/ownership`
DELETE `/:id`
GET `/export/csv/:reportId/:status/:fromdate/:todate/:interval` `/export/json/...` `/export/html/...` `/export/pdf/...` `/export/png/...` `/export/jpeg/...` `/export/excel/...`
GET `/export/tab/html/:reportId/:status/:chartId/:fromdate/:todate/:interval` `/export/tab/pdf/...` `/export/tab/png/...` `/export/tab/jpeg/...`

### Widget Builder (`api/v1/widgetbuilder`) — all JWT + PrivilegeGuard
GET `/privileges/tables` `/` `/:id` `/shared/:id` `/closetab/:widgetBuilderId/:chartId`
POST `/` `/:id/share` `/shared/:id` `/generate/tabular` `/generate/pie` `/generate/doughnut` `/generate/trend` `/generate/bar/vertical` `/generate/bar/horizontal` `/generate/progress` `/generate/progress/exploded` `/generate/counter` `/generate/counter/exploded` `/generate/percentage` `/generate/percentage/exploded` `/generate/compare-trend` `/generate/solo-bar` `/generate/top-bar` `/generate/table` `/generate/top-least-table` `/generate/cumulative-table`
PUT `/:id` `/rename` `/favorite/:id` `/transfer/ownership`
DELETE `/:id`

### QBE (`api/v1/qbe`) — all JWT + PrivilegeGuard
GET `/tables` `/shared/:id` `/:id`
POST `/` `/shared/:id` `/run` `/generate/pie` `/generate/doughnut` `/generate/trend` `/generate/bar/vertical` `/generate/bar/horizontal` `/generate/progress` `/generate/progress/exploded`
PUT `/:id`

### Dashboard (`api/v1/dashboard`) — all JWT + PrivilegeGuard
POST `/` `/:dashboardId/share` `/shared/:id` `/default/:id`
GET `/` `/open/:id` `/:id` `/shared/:id`
PUT `/:id` `/favorite/:id`

### Rotating Dashboard (`api/v1/rotatingdashboard`) — all JWT + PrivilegeGuard
POST `/` `/:id/share` `/shared/:id`
GET `/` `/:id` `/shared/:id`
PUT `/:id` `/favorite/:id`
DELETE `/:id`

### Data Analysis (`api/v1/dataanalysis`) — all JWT + PrivilegeGuard
POST `/` `/:dataAnalysisId/share` `/shared/:id` `/default/:id`
GET `/` `/:id` `/shared/:id`
PUT `/:id` `/favorite/:id`
GET `/export/html/:id/:status/:fromdate/:todate/:interval` `/export/pdf/...` `/export/excel/...`

### Observability (`api/v1/observability`) — all JWT + PrivilegeGuard
GET `/metrics/nodes` `/metrics` `/metrics/reports/:id` `/metrics/:id` `/charts/metrics/:filter` `/charts` `/charts/:id` `/dashboards` `/dashboards/:id`
POST `/metrics/nodes/fields` `/nodes/metrics` `/metrics` `/metrics/generate/tabular` `/metrics/generate/single` `/charts` `/dashboards`
POST `/generate/status-panel/vertical` `/generate/status-panel/horizontal` `/generate/counter-list` `/generate/hexagon` `/generate/trend` `/generate/bar` `/generate/connectivity` `/generate/time/travel`
PUT `/metrics/:id` `/favorite/:id` `/charts/:id` `/charts/favorite/:id` `/dashboards/:id` `/dashboards/favorite/:id`

### Connectivity (`api/v1/connectivities`) — all JWT + PrivilegeGuard
GET `/` `/:fromdate/:todate/:filter` `/export/excel/:fromdate/:todate/:filter`

### Notifications (`api/v1/notifications`) — all JWT + PrivilegeGuard
GET `/` `/settings` `/test/:email`
PUT `/view`
PATCH `/view/:id` `/unsubscribe/:id`

### Health (`/health`) — Public
DB ping, Redis ping, Memory heap 256MB

## Testing Conventions

Spec files co-located with source (`*.spec.ts`). Key mocking patterns:

```typescript
// Repository mock
const repo = {
  createQueryBuilder: jest.fn(), findOne: jest.fn(), find: jest.fn(),
  create: jest.fn().mockImplementation((data) => data),
  save: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}),
};

// QueryBuilder mock
function createMockQueryBuilder(result: any) {
  return {
    select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(result),
    getExists: jest.fn().mockResolvedValue(false),
  };
}

// DI setup
const module = await Test.createTestingModule({
  providers: [Service, { provide: getRepositoryToken(Entity), useValue: repo }],
}).compile();
```

DTO validation tests use `plainToInstance()` + `validate()` from `class-validator`.

## Git Rules

- NEVER commit to main. Branch: `migration/phase-X.Y-description`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`
- Merge to main via `--no-ff` after each phase, tag: `vX.Y.Z-migration-phaseX.Y`
- `git checkout main && git pull origin main` before creating new branch

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DB_HOST` | Yes | — | MariaDB host |
| `DB_PORT` | No | 3306 | |
| `DB_USER` | Yes | — | Full-privilege DB user |
| `DB_PASSWORD` | Yes | — | Allow empty |
| `DB_LIMIT_USER` | Yes | — | Restricted user (nativeQuery) |
| `DB_LIMIT_PASSWORD` | Yes | — | Allow empty |
| `JWT_KEY` | Yes | — | Min 32 chars, HS256 |
| `PORT` | No | 5011 | API port |
| `CPUS` | No | 1 | >1 enables clustering |
| `NODE_ENV` | No | development | development/production/test |
| `CORS_ORIGIN` | No | `'*'` | |
| `DB_POOL_SIZE` | No | 20 | TypeORM pool |
| `REDIS_HOST` | No | localhost | |
| `REDIS_PORT` | No | 6379 | |
| `REDIS_PASSWORD` | No | `''` | |
| `NB_OF_REQUESTS` | No | 200 | Rate limiter max |
| `RATE_LIMIT_DURATION_SEC` | No | 60 | Rate limiter window |
| `RATE_BLOCK_DURATION` | No | 180 | Block duration |
| `MAIL_HOST` | Yes | — | SMTP |
| `MAIL_FROM` | Yes | — | Sender |
| `MAIL_AUTH_EMAIL` | Yes | — | SMTP auth |
| `MAIL_AUTH_PASSWROD` | Yes | — | Typo preserved from v3 |

## Skill Commands

`/conductor:new-track`, `/conductor:implement`, `/conductor:status`, `/conductor:revert`, `/comprehensive-review:full-review`, `/unit-testing:test-generate`, `/full-stack-orchestration:full-stack-feature`, `/backend-development:feature-development`

## Do NOT

- Modify `../imonitor-v3-api/` (read-only)
- Use `synchronize: true`
- Use raw SQL for iMonitorV3_1 queries (use TypeORM repos)
- Use raw `jsonwebtoken` (use `@nestjs/jwt` JwtService)
- Use TypeORM array syntax — use object syntax (`relations: { role: true }`)
- Install packages without explaining why first
- Skip Swagger decorators on controllers
- Skip unit tests for new services and guards
- Change `ErrorMessages` constants (preserve v3 typos)
- Import services across modules directly (use events)
- Auto-generate TypeORM migrations against production DB
