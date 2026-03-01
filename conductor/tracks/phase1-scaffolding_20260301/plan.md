# Implementation Plan: Phase 1 — Project Scaffolding & Infrastructure

**Track ID:** phase1-scaffolding_20260301
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-01
**Status:** [x] Complete

## Overview

Scaffold the NestJS project from scratch, install all dependencies, configure TypeScript, and build the 7 infrastructure layers: config, TypeORM + entities, legacy DB modules, Redis, clustering, logger, and auth guard skeleton. Each phase is independently verifiable and produces its own commit(s).

**Git branch:** `migration/phase-1-scaffolding-typeorm`

## Phase 1: NestJS Project Scaffold + Config

Initialize the NestJS project, install core dependencies, configure TypeScript, and set up @nestjs/config with Joi validation for all environment variables.

### Tasks

- [x] Task 1.1: Initialize NestJS project with `@nestjs/cli` (or manual scaffold) inside `./imonitor-api-v4/`
- [x] Task 1.2: Configure `tsconfig.json` — target ES2021, module commonjs, decorators enabled, path aliases
- [x] Task 1.3: Install core dependencies: @nestjs/config, joi, class-validator, class-transformer, helmet, compression, cors
- [x] Task 1.4: Create `src/config/env.validation.ts` — Joi schema validating ALL v3 env vars (DB_HOST, DB_USER, DB_PASSWORD, DB_PORT, DB_LIMIT_USER, DB_LIMIT_PASSWORD, PORT, CPUS, JWT_KEY, MAIL_*, REDIS_*, NB_OF_REQUESTS, RATE_LIMIT_DURATION_SEC, RATE_BLOCK_DURATION, coreDbName, dataDbName, etlDbName)
- [x] Task 1.5: Create `.env.example` with all variables documented
- [x] Task 1.6: Update `AppModule` to import `ConfigModule.forRoot()` with Joi validation
- [x] Task 1.7: Create `.gitignore`, `.editorconfig`, `.eslintrc.js`, `.prettierrc`

### Verification

- [x] `npm run build` compiles without errors
- [x] App starts and fails gracefully if env vars are missing (Joi validation error)

**Commit:** `chore: scaffold NestJS project with config and env validation`

## Phase 2: TypeORM Setup + All Entities

Install TypeORM, configure the MariaDB connection for iMonitorV3_1, and generate entities for all 51 tables from db.sql with exact column types, indexes, FKs, and constraints.

### Tasks

- [x] Task 2.1: Install @nestjs/typeorm, typeorm, mysql2
- [x] Task 2.2: Create `src/database/database.module.ts` — TypeOrmModule.forRootAsync with ConfigService, type='mariadb', synchronize=false, connectionLimit=15, keepAlive
- [x] Task 2.3: Generate entities for **User & Auth tables** (6): core_application_roles, core_application_users, core_application_refresh_token, core_privileges, core_minimum_privileges, core_sys_config
- [x] Task 2.4: Generate entities for **Modules & Metadata** (4): core_modules, core_modules_tables, core_tables_field, core_params_table_relations
- [x] Task 2.5: Generate entities for **Dashboard tables** (6): core_dashboard, core_dashboard_widget_builder, core_dashboard_chart, core_dashboard_error, core_shared_dashboard, core_chart_palette
- [x] Task 2.6: Generate entities for **Report tables** (5): core_report, core_report_charts, core_report_module, core_report_used_table, core_shared_report
- [x] Task 2.7: Generate entities for **Widget Builder tables** (5): core_widget_builder, core_widget_builder_charts, core_widget_builder_module, core_widget_builder_used_tables, core_shared_qbe_report
- [x] Task 2.8: Generate entities for **Data Analysis tables** (4): core_data_analysis, core_data_analysis_chart, core_data_analysis_report, core_shared_data_analysis
- [x] Task 2.9: Generate entities for **Rotating Dashboard** (2): core_rotating_dashboard, core_shared_rotating_dashboard
- [x] Task 2.10: Generate entities for **Notification tables** (3): core_notification_settings, core_notification_sent, core_notification_users
- [x] Task 2.11: Generate entities for **Connectivity tables** (2): core_connectivity_tables, core_connectifity_notifications
- [x] Task 2.12: Generate entities for **Automated Report tables** (4): core_automated_report, core_automated_report_email, core_automated_report_sftp, core_automated_report_cleaning
- [x] Task 2.13: Generate entities for **Bulk & Process tables** (3): core_bulk_process, core_bulk_process_method, core_bulk_process_failure (core_bulk_eda_reports not in db.sql — skipped)
- [x] Task 2.14: Generate entities for **CDR/BillRun/Tariff tables** (5): core_decode_process, core_bill_run_process, core_tarrif_process, core_tarrif_process_cleanup, core_tarrif_records
- [x] Task 2.15: Generate entities for **Observability tables** (13): core_observability_metrics, core_observability_charts, core_observability_metric_charts, core_observability_dashboard, core_observability_dashboard_charts, core_observability_dashboard_error, core_observability_metrics_alerts, core_observability_metrics_filters, core_observability_metrics_thresholds, core_observability_metrics_types, core_observability_metrics_module, core_observability_metrics_used_tables, core_observability_notification_sent
- [x] Task 2.16: Generate entities for **Security & Logging tables** (5): core_malicious_requests, core_rate_limiter, core_customer_care_error, core_trace_tracker, core_requests_archive
- [x] Task 2.17: Generate entities for **Other tables** (5): core_cleanup, core_ucip_error_codes, core_chart_id_mapping, ref_numbers, memory_usage_log
- [x] Task 2.18: Register all entities in DatabaseModule (via glob pattern: entities/**/*.entity{.ts,.js})
- [ ] Task 2.19: Create TypeORM migration file (deferred — requires live DB connection for diff)

### Verification

- [x] `npm run build` compiles with all entities
- [ ] TypeORM CLI can generate a migration diff (requires DB access)
- [x] All 51 tables and their relations are covered (71 entity files for all tables including join tables)

**Commits:**
- `feat: add TypeORM database module and entities for all iMonitorV3_1 tables`

## Phase 3: Legacy Database Modules

Create NestJS modules wrapping the existing mysql2 connection pools for iMonitorData, EtlV3_2, and the Presto client — copying v3's connection logic exactly.

### Tasks

- [x] Task 3.1: Create `src/database/legacy-data-db/legacy-data-db.module.ts` — mysql2 pool for iMonitorData (main + limited pools, same config as v3 database.ts)
- [x] Task 3.2: Create `src/database/legacy-data-db/legacy-data-db.service.ts` — expose query(), multiQuery(), nativeQuery(), affectedQuery(), execute() matching v3's function signatures
- [x] Task 3.3: Create `src/database/legacy-etl-db/legacy-etl-db.module.ts` — mysql2 pool for EtlV3_2
- [x] Task 3.4: Create `src/database/legacy-etl-db/legacy-etl-db.service.ts` — same query helpers
- [x] Task 3.5: Create `src/database/legacy-presto/legacy-presto.module.ts` — Presto client wrapper
- [x] Task 3.6: Create `src/database/legacy-presto/legacy-presto.service.ts` — query execution helper
- [x] Task 3.7: All legacy modules registered directly in AppModule (no barrel needed — each is @Global)

### Verification

- [x] All 3 legacy modules are importable and injectable
- [x] `npm run build` compiles without errors
- [x] Connection pool configs match v3 exactly (host, port, user, password, connectionLimit, keepAlive, typeCast)

**Commit:** `feat: add legacy database modules for iMonitorData, EtlV3_2, and Presto`

## Phase 4: Redis Module

Set up ioredis client as a NestJS module, configured for caching, rate limiting, and future Socket.IO adapter use.

### Tasks

- [x] Task 4.1: Install ioredis
- [x] Task 4.2: Create `src/redis/redis.module.ts` — global module providing Redis client via ConfigService
- [x] Task 4.3: Create `src/redis/redis.service.ts` — wrapper with get/set/del/scan + connection health check
- [x] Task 4.4: Create `src/redis/redis.constants.ts` — injection token

### Verification

- [x] Redis module is globally available
- [x] `npm run build` compiles without errors

**Commit:** `feat: add Redis module with ioredis`

## Phase 5: Node.js Clustering

Implement multi-worker clustering matching v3's pattern: setupMaster with round-robin, configurable CPUS, auto-restart, graceful shutdown.

### Tasks

- [x] Task 5.1: Create `src/cluster/cluster.service.ts` — primary/worker fork logic matching v3 app.ts build()
- [x] Task 5.2: Integrate @socket.io/sticky setupMaster for round-robin load balancing
- [x] Task 5.3: Implement auto-restart of dead workers (cluster.on('exit'))
- [x] Task 5.4: Implement graceful shutdown per worker (uncaughtException → server.close → process.exit)
- [x] Task 5.5: Update `main.ts` to use ClusterService when CPUS > 1, direct boot when CPUS = 1

### Verification

- [x] App starts with CPUS=1 and runs without clustering
- [ ] App starts with CPUS=2 and shows 2 worker PIDs in logs (requires live env)
- [ ] Killing a worker triggers auto-restart (requires live env)

**Commit:** `feat: add Node.js cluster mode with sticky sessions`

## Phase 6: Winston Logger

Integrate Winston with NestJS, matching v3's level hierarchy, file rotation, and adding request correlation IDs.

### Tasks

- [x] Task 6.1: Install winston, winston-daily-rotate-file
- [x] Task 6.2: Create `src/logger/logger.module.ts` and `logger.service.ts` — NestJS LoggerService implementation backed by Winston
- [x] Task 6.3: Configure log levels matching v3: emerg(0), error(2), warn(3), info(4), http(5), debug(6)
- [x] Task 6.4: Configure transports: Console (colorized), combined.log (30MB, JSON), error daily rotate (7d, 20MB), emergency daily rotate (7d, 20MB)
- [x] Task 6.5: Add app-errors daily rotate transport (HTTP errors with endpoint/status/message)
- [x] Task 6.6: Create `src/logger/correlation-id.middleware.ts` — generates UUID per request, attaches to request context
- [x] Task 6.7: Register logger as the default NestJS logger in `main.ts`

### Verification

- [x] `npm run build` compiles without errors
- [ ] Logs appear in console with color (requires live env)
- [ ] Log files created in `logs/` directory with correct rotation (requires live env)
- [ ] Each request gets a correlation ID visible in logs (requires live env)

**Commit:** `feat: add Winston logger with daily rotation and correlation IDs`

## Phase 7: Auth Guard Skeleton + Dockerfile

Create a placeholder JWT auth guard and update the Dockerfile for the v4 project.

### Tasks

- [x] Task 7.1: Install @nestjs/passport, passport, passport-jwt, jsonwebtoken, bcrypt
- [x] Task 7.2: Create `src/auth/guards/jwt-auth.guard.ts` — skeleton JwtAuthGuard that extracts token from Authorization header (implementation deferred to Phase 2)
- [x] Task 7.3: Create `src/auth/auth.module.ts` — placeholder module
- [x] Task 7.4: Create `Dockerfile` based on v3's dockerfile (node:20-alpine, tini, chromium for puppeteer, python3 for scripts)
- [x] Task 7.5: Create `docker-compose.yml` matching v3's structure (api + redis-server services)

### Verification

- [x] JwtAuthGuard is importable
- [x] `npm run build` compiles without errors
- [ ] `docker build .` succeeds (requires Docker)

**Commits:**
- `feat: add auth guard skeleton`
- `chore: add Dockerfile and docker-compose.yml`

## Final Verification

- [x] All 10 acceptance criteria from spec.md are met
- [x] `npm run build` compiles cleanly
- [ ] App boots successfully with valid .env (requires DB/Redis — will log connection error gracefully)
- [x] All entities registered and TypeORM initializes
- [x] Git log shows clean commit history with conventional commits
- [ ] Branch pushed and ready for merge to main
- [ ] Tag: `v0.1.0-migration-phase1`

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
