# iMonitor API v3 → v4 Migration Plan

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Analysis](#2-current-architecture-analysis)
3. [Database Architecture](#3-database-architecture)
4. [db.sql Schema Blueprint](#4-dbsql-schema-blueprint)
5. [Route & Endpoint Inventory](#5-route--endpoint-inventory)
6. [Socket.IO Analysis](#6-socketio-analysis)
7. [Shared Logic & Utilities](#7-shared-logic--utilities)
8. [Identified Issues & Tech Debt](#8-identified-issues--tech-debt)
9. [Architecture Recommendation](#9-architecture-recommendation)
10. [Module Dependency Map](#10-module-dependency-map)
11. [Phased Migration Plan](#11-phased-migration-plan)
12. [Database Migration Strategy](#12-database-migration-strategy)
13. [Risk Assessment & Rollback](#13-risk-assessment--rollback)

---

## 1. Executive Summary

**Source**: `./imonitor-v3-api/` — Express.js + InversifyJS + TSOA (Node.js API)
**Target**: `./imonitor-api-v4/` — NestJS with TypeORM (only for `iMonitorV3_1`)
**Schema Source of Truth**: `./imonitor-v3-api/db.sql` — Navicat export from MariaDB 11.3.2

### Key Stats

| Metric | Value |
|--------|-------|
| TypeScript files | 369 |
| API modules | 25 |
| Endpoints | 150+ |
| Services | 29 |
| Socket.IO namespaces | 6 |
| Databases | 3 MySQL + Redis + Presto |
| Tables in iMonitorV3_1 (db.sql) | 51 |
| Foreign key constraints | 22 |
| Workers/background jobs | 9 worker scripts + 4 cron jobs |
| Views | 1 (`core_params_tables_details`) |

---

## 2. Current Architecture Analysis

### 2.1 Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Express.js 4.18.2 |
| Language | TypeScript 5.2.2 |
| DI Container | InversifyJS 6.0.2 |
| API Docs | TSOA 5.1.1 + Swagger UI |
| Database Driver | mysql2 3.6.3 (raw SQL, no ORM) |
| Caching | ioredis 5.6.0 |
| Real-time | Socket.IO 4.7.2 |
| Logging | Winston 3.10 + Daily Rotate File |
| Auth | JWT (jsonwebtoken 9.0.2) + bcrypt |
| File Processing | multer, exceljs, csv-writer, puppeteer |
| Email | nodemailer 6.9.7 |
| SMS | SMPP protocol |
| Rate Limiting | rate-limiter-flexible 4.0.0 |
| Process Mgmt | Node.js cluster + child_process + worker_threads |

### 2.2 Application Structure

```
src/
├── application/           # Express app, config, socket, database
│   ├── api/v1/            # 25 route modules (controller + routes + validation)
│   ├── socket/            # 6 Socket.IO handlers
│   ├── config/environments/  # .env, dev.env, prod.env, test.env
│   ├── DI/                # InversifyJS container (inversity.ts, types.ts)
│   ├── app.ts             # AppBuilder (bootstrap + cluster)
│   ├── database.ts        # MySQL connection pools (main + limited)
│   ├── redis.ts           # Redis client
│   └── server.ts          # Entry point
├── core/                  # Domain layer
│   ├── consts/            # Constants (8 files incl. databaseConstants.ts)
│   ├── enums/             # Enumerations (15 files)
│   ├── interfaces/        # TypeScript interfaces (8 files)
│   └── utils/             # Utilities (18 modules)
├── infrastructure/        # Data & cross-cutting layer
│   ├── services/          # Business logic (29 services)
│   ├── repositories/      # Data access (base + 4 specialized)
│   ├── middleware/         # HTTP middleware (8 modules)
│   ├── dto/               # Data transfer objects (40 directories)
│   ├── charts/            # Chart generation (20 types)
│   └── models/            # Data models
├── scripts/               # Workers + cron jobs + migrations
│   ├── worker/            # 9 worker scripts
│   ├── startup.ts         # Cron job initialization
│   └── migration/         # Data migration scripts (6 files)
└── assets/                # CDN, certificates, exports, templates
```

### 2.3 Bootstrap Flow

1. `server.ts` creates Express app → `AppBuilder`
2. **`bootstrap()`**: Middleware chain → Swagger → Socket.IO → Routes → Error handler
3. **`build()`**: Primary process forks workers → each worker listens on PORT
4. Cluster with `@socket.io/sticky` (round-robin) + Redis adapter

### 2.4 Middleware Chain (order of execution)

| # | Middleware | Purpose |
|---|-----------|---------|
| 1 | `compression` | Response compression |
| 2 | `helmet` | Security headers |
| 3 | `cors` | Cross-origin resource sharing |
| 4 | `rateLimiterMiddleware` | IP-based rate limiting (200 req/60s, Redis-backed) |
| 5 | `requestFilterMiddleware` | SQL injection / malicious URL detection |
| 6 | `morgan` | HTTP request logging |
| 7 | Swagger UI | API docs at `/docs` |
| 8 | `express.json` | Body parser (50MB limit) |
| 9 | `express.urlencoded` | URL-encoded body parser |
| 10 | `requestArchiveMiddleware` | Request archiving to database |
| 11 | Static files | Serves `/public` directory |
| 12 | Route handlers | API routes with per-route middleware |
| 13 | `errorHandlerMiddleware` | Global error handler |

### 2.5 Per-Route Middleware

| Middleware | Description |
|-----------|-------------|
| `jwtMiddleware` | JWT validation (supports `keepLogin` bypass for persistent sessions) |
| `authorize()` | Dynamic role-based auth (queries DB for minimum privilege per route) |
| `strictAuthorize(roles, module)` | Static role enforcement for specific modules |
| `keyAuthorisation` | API key validation for utility/internal endpoints |
| `validate(schema)` | Request body validation using express-validator |
| `multer.single('document')` | File upload handling |

### 2.6 Clustering

- Node.js `cluster` module with configurable CPU count (`CPUS` env var)
- `@socket.io/sticky` for sticky session load balancing (round-robin)
- `@socket.io/redis-adapter` for cross-worker Socket.IO pub/sub
- Auto-restart dead workers
- Graceful shutdown on uncaught exceptions
- Database connection validated before worker fork

---

## 3. Database Architecture

### 3.1 Database Inventory

| Database | Purpose | Migration Strategy |
|----------|---------|-------------------|
| **iMonitorV3_1** | Core app (users, config, reports, dashboards) | **Full TypeORM migration** |
| **iMonitorData** | Analytics & statistics (nodes, metrics, audit) | **LegacyDataDbModule** — keep raw SQL |
| **EtlV3_2** | ETL flow management | **LegacyEtlDbModule** — keep raw SQL |
| **Redis** | Caching, rate limiting, Socket.IO adapter | NestJS Redis module |
| **Presto** | Distributed SQL for bill run CDR analysis | **LegacyPrestoModule** — keep as-is |

### 3.2 Connection Configuration

**Two MySQL connection pools (same server, different users):**

| Pool | User | Connection Limit | Purpose |
|------|------|-----------------|---------|
| Main (`db`) | `DB_USER` | 15 | Standard queries |
| Limited (`limitedDb`) | `DB_LIMIT_USER` | 15 | Restricted/native queries |

**Common pool settings:** keep-alive (1000ms), decimal numbers, multiple statements, custom VAR_STRING type casting

**Query helper functions:**

| Function | Purpose | Retry |
|----------|---------|-------|
| `query<T>(sql, values)` | Standard SELECT | 3 retries on connection reset |
| `multiQuery<T>(sql, values)` | Multiple result sets | No |
| `nativeQuery(sql, values)` | Raw query (limited pool) | No |
| `affectedQuery(sql, values)` | Returns affectedRows | No |
| `execute(sql, values)` | Execute, return boolean | No |

### 3.3 iMonitorData Tables (LegacyDataDbModule)

**Network Nodes (11 tables):** `V3_sdp_nodes`, `V3_air_nodes`, `V3_cis_nodes`, `V3_eda_nodes`, `V3_emm_nodes`, `V3_ers_nodes`, `V3_hsdp_nodes`, `V3_ngvs_nodes`, `V3_occ_nodes`, `V3_olm_nodes`, `V3_vas_nodes`

**Configuration (3 tables):** `V3_dedicated_accounts`, `V3_service_classes`, `V3_central_storage_nodes`

**Statistics (multi-tier):** `V3_*_stats` (minutely), `V3_*_stats_hourly`, `V3_*_stats_daily`

**Audit & Metrics (5 tables):** `V3_audit_logs_stats`, `V3_audit_logs_operations`, `V3_observability_metrics_stats`, `V3_observability_metrics_exploded_stats`, `V3_opened_dashboards_stats`

**Other:** `V3_connectivity_test`, `V3_ucip_error_codes`

### 3.4 EtlV3_2 Tables (LegacyEtlDbModule)

`core_etl_flows`, `core_converting_function_templates`, `core_functions`, `core_etl_flows_errors`, `core_etl_flows_stats`, `core_file_format`, `core_flows_tables_relations`, `V3_consolidation_check`, `core_method`, `core_node_table_types`, `core_server_per_flow`, `V3_last_entries_ref`, `core_variables`, `core_arguments`

### 3.5 Cross-Database Query Patterns

Several services execute cross-database JOINs (all on same MySQL server):
- `queryBuilder.service.ts` — JOINs `iMonitorData` ↔ `iMonitorV3_1`
- `etlInterface.service.ts` — JOINs `EtlV3_2` ↔ `iMonitorData`
- `observability.service.ts` — JOINs `iMonitorV3_1` ↔ `iMonitorData`
- `customerCare.service.ts` — Queries `iMonitorData` nodes + `iMonitorV3_1` config

### 3.6 Encryption

- `AES_ENCRYPT` / `AES_DECRYPT` for sensitive fields (passwords, credentials in node tables)
- Encryption key stored in `core_sys_config` (`aesEncryptionKey`)
- Used on: `V3_air_nodes.gui_pass`, `V3_sdp_nodes.gui_pass`, SFTP passwords, etc.

---

## 4. db.sql Schema Blueprint

**Source:** `./imonitor-v3-api/db.sql`
**Database:** iMonitorV3_1 (MariaDB 11.3.2)
**Export date:** 2026-02-28 (Navicat Premium)

### 4.1 Complete Table Definitions

#### Table: `core_application_roles`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(64) | NOT NULL | `''` |
| `name` | varchar(64) | NOT NULL | `''` |
- **PK:** `id` (BTREE)
- **Seed data:** 5 roles — superadmin, admin, superuser, user, N/A

#### Table: `core_application_users`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(64) | NOT NULL | `''` |
| `firstName` | varchar(64) | NULL | NULL |
| `lastName` | varchar(64) | NULL | NULL |
| `isLocked` | tinyint(1) | NOT NULL | — |
| `keepLogin` | tinyint(1) | NOT NULL | — |
| `allowMultipleSessions` | tinyint(1) | NOT NULL | — |
| `createdOn` | datetime | NULL | NULL |
| `createdBy` | varchar(64) | NULL | NULL |
| `modifiedOn` | datetime | NULL | NULL |
| `modifiedBy` | varchar(64) | NULL | NULL |
| `userName` | varchar(64) | NULL | NULL |
| `email` | varchar(64) | NULL | NULL |
| `passwordHash` | varchar(100) | NULL | NULL |
| `phoneNumber` | varchar(64) | NULL | NULL |
| `deletedBy` | varchar(64) | NULL | NULL |
| `deletedOn` | datetime(6) | NULL | NULL |
| `isDeleted` | tinyint(1) | NOT NULL | `0` |
| `lastLogin` | datetime(1) | NULL | NULL |
| `lastLogout` | datetime(1) | NULL | NULL |
| `theme` | enum('dark','light') | NULL | `'light'` |
- **PK:** `id` (BTREE)

#### Table: `core_application_refresh_token`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(64) | NOT NULL | `''` |
| `used` | tinyint(1) | NOT NULL | `0` |
| `invalidated` | tinyint(1) | NOT NULL | `0` |
| `jwtId` | varchar(64) | NOT NULL | `''` |
| `userId` | varchar(64) | NOT NULL | `''` |
| `expiryDate` | datetime | NOT NULL | — |
| `createdOn` | datetime | NOT NULL | — |
- **PK:** `id` (BTREE)
- **Index:** `userId_refreshTokenid_fk` on `userId`
- **FK:** `userId` → `core_application_users(id)` ON DELETE CASCADE

#### Table: `core_privileges`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `Id` | varchar(255) | NOT NULL | `uuid()` |
| `UserId` | varchar(255) | NULL | NULL |
| `RoleId` | varchar(255) | NULL | NULL |
| `ModuleId` | int(11) | NOT NULL | — |
- **PK:** `Id` (BTREE)

#### Table: `core_minimum_privileges`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | int(100) | NOT NULL | AUTO_INCREMENT |
| `request` | varchar(255) | NOT NULL | — |
| `roleRequired` | varchar(255) | NULL | NULL |
| `method` | varchar(50) | NULL | NULL |
| `moduleId` | int(100) | NULL | NULL |
- **PK:** `id` (BTREE)
- **AUTO_INCREMENT:** 245

#### Table: `core_modules`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | — |
| `pId` | int(5) | NULL | NULL |
| `isMenuItem` | tinyint(1) | NOT NULL | — |
| `priority` | int(3) | NOT NULL | — |
| `name` | varchar(50) | NOT NULL | — |
| `isDefault` | tinyint(1) | NOT NULL | — |
| `nestedLevel` | int(11) | NULL | NULL |
| `icon` | varchar(20) | NULL | NULL |
| `path` | varchar(30) | NULL | NULL |
| `lightColor` | varchar(45) | NULL | NULL |
| `darkColor` | varchar(45) | NULL | `'#1f1f1f'` |
| `font` | varchar(45) | NULL | NULL |
| `isNode` | tinyint(1) | NULL | NULL |
- **PK:** `id` (BTREE)
- **Index:** `parent_key_idx` on `pId`

#### Table: `core_modules_tables`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(225) | NOT NULL | — |
| `mId` | int(25) | NOT NULL | — |
| `tableName` | varchar(100) | NOT NULL | `''` |
| `displayName` | varchar(45) | NOT NULL | `''` |
| `statInterval` | int(11) | NULL | NULL |
| `startTime` | datetime | NULL | NULL |
| `tableHourName` | varchar(100) | NULL | NULL |
| `tableDayName` | varchar(100) | NULL | NULL |
| `isGroupedByHourly` | tinyint(4) | NULL | NULL |
| `isGroupedByDaily` | tinyint(4) | NULL | NULL |
| `tableType` | varchar(20) | NULL | NULL |
| `CreatedBy` | longtext | NULL | NULL |
| `CreatedOn` | datetime(6) | NULL | `'0001-01-01 00:00:00.000000'` |
| `ModifiedBy` | longtext | NULL | NULL |
| `ModifiedOn` | datetime(6) | NULL | NULL |
| `paramsTable` | varchar(50) | NULL | NULL |
| `paramsNodeName` | varchar(50) | NULL | NULL |
| `nodeNameColumn` | varchar(25) | NULL | `''` |
| `statDateNameColumn` | varchar(50) | NULL | `'stat_date'` |
| `priority` | int(11) | NULL | NULL |
| `gracePeriodMinutes` | int(11) | NULL | NULL |
| `isMonitored` | tinyint(1) | NULL | NULL |
| `isView` | tinyint(4) | NULL | NULL |
| `allowedGap` | int(6) | NULL | NULL |
| `lastTriggered` | datetime | NULL | NULL |
| `exampleNumericField` | varchar(255) | NULL | NULL |
- **PK:** `id` (BTREE)
- **Note:** Mixed charset — some varchar cols use latin1_swedish_ci

#### Table: `core_tables_field`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(225) | NOT NULL | `uuid()` |
| `tId` | varchar(225) | NOT NULL | — |
| `columnName` | varchar(225) | NOT NULL | `''` |
| `columnDisplayName` | varchar(225) | NOT NULL | `''` |
| `type` | varchar(25) | NOT NULL | — |
| `CreatedBy` | longtext | NULL | NULL |
| `CreatedOn` | datetime(6) | NOT NULL | `'0001-01-01 00:00:00.000000'` |
| `ModifiedBy` | longtext | NULL | NULL |
| `ModifiedOn` | datetime(6) | NULL | NULL |
| `operation` | varchar(50) | NULL | NULL |
| `isParam` | tinyint(1) | NULL | NULL |
| `isEncrypted` | tinyint(1) | NOT NULL | `0` |
| `priority_id` | int(2) | NULL | NULL |
| `ordinalPosition` | int(4) | NULL | NULL |
| `isPrimaryKey` | tinyint(4) | NULL | NULL |
- **PK:** `id` (BTREE)

#### Table: `core_sys_config`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `confKey` | varchar(64) | NOT NULL | `''` |
| `confVal` | varchar(100) | NOT NULL | `''` |
| `reportSetting` | tinyint(1) | NULL | NULL |
| `selfAnalysisSetting` | tinyint(1) | NULL | NULL |
| `widgetBuilderSetting` | tinyint(1) | NULL | NULL |
| `dashboardSetting` | tinyint(1) | NULL | NULL |
| `generalSetting` | tinyint(1) | NULL | NULL |
| `operationSettings` | tinyint(64) | NULL | NULL |
| `description` | varchar(200) | NULL | NULL |
- **PK:** `confKey` (BTREE)
- **Index:** `key` on `confKey`
- **Seed data:** 150+ configuration key-value pairs

#### Table: `core_params_table_relations`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `fieldId` | varchar(64) | NOT NULL | `''` |
| `paramTableId` | varchar(64) | NULL | NULL |
| `paramTableFieldId` | varchar(64) | NULL | NULL |
| `tableId` | varchar(64) | NOT NULL | `''` |
| `tableFieldId` | varchar(64) | NOT NULL | `''` |
| `paramSelectedFieldId` | varchar(64) | NULL | NULL |
- **PK:** Composite (`fieldId`, `tableId`, `tableFieldId`) (BTREE)

#### Table: `core_dashboard`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | — |
| `name` | varchar(100) | NOT NULL | — |
| `options` | longtext | NULL | NULL |
| `createdAt` | datetime | NOT NULL | — |
| `updatedAt` | datetime | NULL | NULL |
| `ownerId` | varchar(36) | NOT NULL | — |
| `isFavorite` | tinyint(1) | NOT NULL | `0` |
| `isDefault` | tinyint(1) | NULL | `0` |
- **PK:** `id` (BTREE)

#### Table: `core_dashboard_widget_builder`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `widgetBuilderId` | varchar(36) | NOT NULL | — |
| `dashboardId` | varchar(36) | NOT NULL | — |
- **PK:** Composite (`widgetBuilderId`, `dashboardId`) (BTREE)
- **Index:** `dataAnalysis_report_fk` on `dashboardId`
- **FK:** `dashboardId` → `core_dashboard(id)` CASCADE
- **FK:** `widgetBuilderId` → `core_widget_builder(id)` CASCADE

#### Table: `core_dashboard_chart`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `chartId` | varchar(36) | NOT NULL | — |
| `dashboardId` | varchar(36) | NOT NULL | — |
- **PK:** Composite (`chartId`, `dashboardId`) (BTREE)
- **Index:** `dataAnalysis_chart_fk` on `dashboardId`
- **FK:** `chartId` → `core_widget_builder_charts(id)` CASCADE
- **FK:** `dashboardId` → `core_dashboard(id)` CASCADE

#### Table: `core_dashboard_error`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | int(11) | NOT NULL | AUTO_INCREMENT |
| `errorstack` | longtext | NULL | NULL |
| `errorDate` | datetime | NULL | NULL |
| `dashboardId` | varchar(36) | NULL | NULL |
| `widgetBuilderId` | varchar(36) | NULL | NULL |
| `chartId` | varchar(36) | NULL | NULL |
- **PK:** `id` (BTREE)
- **AUTO_INCREMENT:** 10003

#### Table: `core_shared_dashboard`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | `uuid()` |
| `dashboardId` | varchar(36) | NOT NULL | — |
| `ownerId` | varchar(36) | NOT NULL | — |
| `createdAt` | datetime | NOT NULL | — |
| `isFavorite` | tinyint(1) | NULL | `0` |
- **PK:** `id` (BTREE)

#### Table: `core_report`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | `uuid()` |
| `name` | varchar(100) | NOT NULL | — |
| `ownerId` | varchar(36) | NOT NULL | — |
| `isFavorite` | tinyint(1) | NOT NULL | `0` |
| `isDefault` | tinyint(1) | NOT NULL | `0` |
| `createdAt` | datetime | NOT NULL | — |
| `updatedAt` | datetime | NULL | ON UPDATE CURRENT_TIMESTAMP |
| `fromDate` | datetime | NOT NULL | — |
| `toDate` | datetime | NOT NULL | — |
| `timeFilter` | enum('minutes','hourly','daily','weekly','monthly','yearly') | NOT NULL | — |
| `limit` | int(10) UNSIGNED | NULL | NULL |
| `tables` | longtext | NULL | NULL |
| `globalFilter` | longtext | NULL | NULL |
| `orderBy` | longtext | NULL | NULL |
| `control` | longtext | NULL | NULL |
| `operation` | longtext | NULL | NULL |
| `compare` | longtext | NULL | NULL |
| `options` | longtext | NULL | NULL |
| `globalOrderIndex` | int(11) | NULL | `0` |
| `sql` | longtext | NULL | NULL |
| `isQbe` | tinyint(4) | NOT NULL | `0` |
- **PK:** `id` (BTREE)

#### Table: `core_report_charts`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | `uuid()` |
| `name` | varchar(100) | NULL | NULL |
| `type` | varchar(50) | NOT NULL | — |
| `orderIndex` | int(10) | NOT NULL | — |
| `data` | longtext | NOT NULL | — |
| `createdAt` | datetime | NULL | NULL |
| `createdBy` | varchar(36) | NULL | NULL |
| `reportId` | varchar(36) | NOT NULL | — |
- **PK:** `id` (BTREE)
- **Index:** `repott_fk` on `reportId`
- **FK:** `reportId` → `core_report(id)` CASCADE

#### Table: `core_report_module`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `reportId` | varchar(36) | NOT NULL | — |
| `moduleId` | varchar(36) | NOT NULL | — |
- **PK:** Composite (`reportId`, `moduleId`) (BTREE)
- **FK:** `reportId` → `core_report(id)` CASCADE
- **FK:** `moduleId` → `core_modules(id)` RESTRICT

#### Table: `core_report_used_table`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `reportId` | varchar(50) | NOT NULL | — |
| `tableId` | varchar(50) | NOT NULL | — |
| `tableName` | varchar(100) | NOT NULL | — |
- **PK:** Composite (`reportId`, `tableId`) (BTREE)
- **FK:** `reportId` → `core_report(id)` CASCADE

#### Table: `core_widget_builder`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | — |
| `name` | varchar(100) | NOT NULL | — |
| `ownerId` | varchar(36) | NOT NULL | — |
| `isFavorite` | tinyint(1) | NOT NULL | `0` |
| `isDefault` | tinyint(1) | NOT NULL | `0` |
| `createdAt` | datetime | NOT NULL | — |
| `updatedAt` | datetime | NULL | NULL |
| `limit` | int(10) | NULL | NULL |
| `tables` | longtext | NULL | NULL |
| `globalFilter` | longtext | NULL | NULL |
| `orderBy` | longtext | NULL | NULL |
| `control` | longtext | NULL | NULL |
| `operation` | longtext | NULL | NULL |
| `compare` | longtext | NULL | NULL |
| `priority` | longtext | NULL | NULL |
| `inclusion` | longtext | NULL | NULL |
| `options` | longtext | NULL | NULL |
| `globalOrderIndex` | int(11) | NULL | NULL |
- **PK:** `id` (BTREE)

#### Table: `core_widget_builder_charts`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | `uuid()` |
| `name` | varchar(100) | NULL | NULL |
| `type` | varchar(50) | NOT NULL | — |
| `orderIndex` | int(10) | NOT NULL | — |
| `data` | longtext | NOT NULL | — |
| `notification` | longtext | NOT NULL | `'{}'` |
| `createdAt` | datetime | NULL | NULL |
| `createdBy` | varchar(36) | NULL | NULL |
| `widgetBuilderId` | varchar(36) | NOT NULL | — |
- **PK:** `id` (BTREE)
- **Index:** `repott_fk` on `widgetBuilderId`
- **FK:** `widgetBuilderId` → `core_widget_builder(id)` CASCADE

#### Table: `core_widget_builder_module`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `widgetBuilderId` | varchar(36) | NOT NULL | — |
| `moduleId` | varchar(36) | NOT NULL | — |
- **PK:** Composite (`widgetBuilderId`, `moduleId`) (BTREE)
- **FK:** `moduleId` → `core_modules(id)` RESTRICT
- **FK:** `widgetBuilderId` → `core_widget_builder(id)` CASCADE

#### Table: `core_widget_builder_used_tables`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `widgetBuilderId` | varchar(36) | NOT NULL | — |
| `tableId` | varchar(40) | NOT NULL | — |
| `tableName` | varchar(100) | NOT NULL | — |
- **PK:** Composite (`widgetBuilderId`, `tableId`) (BTREE)
- **FK:** `widgetBuilderId` → `core_widget_builder(id)` CASCADE

#### Table: `core_data_analysis`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | — |
| `name` | varchar(100) | NOT NULL | — |
| `options` | longtext | NULL | NULL |
| `createdAt` | datetime | NOT NULL | — |
| `updatedAt` | datetime | NULL | NULL |
| `ownerId` | varchar(36) | NOT NULL | — |
| `isFavorite` | tinyint(1) | NOT NULL | `0` |
| `isDefault` | tinyint(1) | NOT NULL | `0` |
- **PK:** `id` (BTREE)

#### Table: `core_data_analysis_chart`
- Composite PK: (`chartId`, `dataAnalysisId`)
- **FK:** `chartId` → `core_report_charts(id)` CASCADE
- **FK:** `dataAnalysisId` → `core_data_analysis(id)` CASCADE

#### Table: `core_data_analysis_report`
- Composite PK: (`reportId`, `dataAnalysisId`)
- **FK:** `reportId` → `core_report(id)` CASCADE
- **FK:** `dataAnalysisId` → `core_data_analysis(id)` CASCADE

#### Table: `core_shared_data_analysis`
- PK: `id` (varchar(36), default uuid())
- Columns: `dataAnalysisId`, `ownerId`, `createdAt`, `isFavorite`

#### Table: `core_shared_report`
- PK: `id` (varchar(36), default uuid())
- **FK:** `reportId` → `core_report(id)` CASCADE

#### Table: `core_shared_qbe_report` (implied from code — same structure as shared_report)

#### Table: `core_rotating_dashboard`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | — |
| `name` | varchar(100) | NOT NULL | — |
| `ownerId` | varchar(36) | NOT NULL | — |
| `minutes` | int(255) | NOT NULL | — |
| `isFavorite` | tinyint(1) | NOT NULL | `0` |
| `isDefault` | tinyint(1) | NOT NULL | `0` |
| `dashboardIds` | longtext | NOT NULL | — |
| `createdAt` | datetime | NOT NULL | — |
| `updatedAt` | datetime | NULL | NULL |
- **PK:** `id` (BTREE)

#### Table: `core_shared_rotating_dashboard`
- PK: `id` (varchar(36), default uuid())
- **FK:** `rotatingDashboardId` → `core_rotating_dashboard(id)` CASCADE

#### Table: `core_notification_settings`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | `uuid()` |
| `chartId` | varchar(36) | NOT NULL | — |
| `widgetBuilderId` | varchar(36) | NOT NULL | — |
| `createdAt` | datetime | NULL | `current_timestamp()` |
| `createdBy` | varchar(36) | NULL | NULL |
| `updatedAt` | datetime | NULL | ON UPDATE CURRENT_TIMESTAMP |
| `updatedBy` | varchar(36) | NULL | NULL |
- **PK:** `id` (BTREE)
- **Indexes:** on `widgetBuilderId` (2 indexes), `chartId`

#### Table: `core_notification_sent`
- PK: `id` (varchar(36), default uuid())
- Indexes: `userId`, `notificationId`
- **FK:** `notificationId` → `core_notification_settings(id)` CASCADE
- Columns include: `chartName`, `widgetBuilderName`, `message`, `type`, `color`, `viewed`, `viewedAt`

#### Table: `core_notification_users`
- PK: Composite (`userId`, `notificationId`, `status`)
- `status`: enum('upper','middle','lower','none') default 'none'
- **FK:** `notificationId` → `core_notification_settings(id)` CASCADE
- **FK:** `userId` → `core_application_users(id)` CASCADE

#### Table: `core_connectivity_tables`
- PK: `id` (int, AUTO_INCREMENT)
- Columns: `tableName`, `minutlyBackPeriod`, `whereCondition`

#### Table: `core_connectifity_notifications` (typo preserved)
- PK: `id` (bigint, AUTO_INCREMENT)
- Columns: `title`, `subtitle`, `message`, `type`, `userId`, `color`, `status`, `createdAt`

#### Table: `core_automated_report`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NULL | NULL |
| `ownerId` | varchar(36) | NULL | NULL |
| `reportId` | varchar(36) | NULL | NULL |
| `title` | varchar(100) | NULL | NULL |
| `timeFilter` | varchar(20) | NULL | NULL |
| `isActive` | tinyint(1) | NULL | NULL |
| `createdOn` | datetime | NULL | NULL |
| `updatedOn` | datetime | NULL | ON UPDATE CURRENT_TIMESTAMP |
| `reportHourInterval` | int(11) | NULL | `0` |
| `reportDayInterval` | int(11) | NULL | `0` |
| `relativeHour` | int(11) | NULL | `0` |
| `relativeDay` | int(11) | NULL | `0` |
| `processId` | varchar(64) | NULL | NULL |
| `lastRunDate` | datetime | NULL | NULL |
| `exportType` | varchar(64) | NULL | NULL |
| `isDeleted` | tinyint(1) | NULL | NULL |
| `deletedOn` | datetime | NULL | NULL |
| `recurringHours` | int(11) | NULL | `0` |
| `recurringDays` | int(11) | NULL | `0` |
| `firstOccurence` | datetime | NULL | NULL |
| `method` | varchar(6) | NULL | NULL |
| `activatedOn` | datetime | NULL | NULL |
| `emailSubject` | varchar(100) | NULL | NULL |
| `emailDescription` | longtext | NULL | NULL |
| `errorStack` | longtext | NULL | NULL |
| `errorOn` | datetime | NULL | NULL |
- **No PK** — Index on `id`
- **FK refs:** `core_automated_report_email` and `core_automated_report_sftp` reference this table

#### Table: `core_automated_report_email`
- PK: `id` (bigint, AUTO_INCREMENT)
- **FK:** `automatedReportId` → `core_automated_report(id)` CASCADE

#### Table: `core_automated_report_sftp`
- PK: `id` (bigint, AUTO_INCREMENT)
- Columns include: `username`, `password` (varbinary(200) — encrypted), `host`, `path`
- **FK:** `automatedReportId` → `core_automated_report(id)` CASCADE

#### Table: `core_automated_report_cleaning`
- PK: `id` (int, AUTO_INCREMENT)
- Columns: `processId`, `runDate`, `errorStack`, `errorOn`, `nbOfDeletedFiles`

#### Table: `core_bulk_process`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | `uuid()` |
| `name` | varchar(255) | NULL | NULL |
| `fileOriginalName` | varchar(255) | NULL | NULL |
| `method` | varchar(255) | NULL | NULL |
| `status` | varchar(30) | NULL | NULL |
| `inputFile` | varchar(50) | NULL | NULL |
| `outputFile` | varchar(255) | NULL | NULL |
| `airs` | longtext | NULL | NULL |
| `processingDate` | datetime | NULL | NULL |
| `createdBy` | varchar(36) | NULL | NULL |
| `createdAt` | datetime | NULL | NULL |
| `updatedAt` | datetime | NULL | ON UPDATE CURRENT_TIMESTAMP |
| `finishDate` | datetime | NULL | NULL |
| `updatedBy` | varchar(36) | NULL | NULL |
| `isDeleted` | tinyint(4) | NULL | `0` |
| `deletedAt` | datetime | NULL | NULL |
| `deletedBy` | varchar(36) | NULL | NULL |
| `type` | varchar(10) | NULL | NULL |
- **PK:** `id` (BTREE)

#### Table: `core_bulk_process_method`
- PK: `id` (int, AUTO_INCREMENT)
- Columns: `name`, `headerSample`, `responseHeaderSample`, `type`
- Seed data: 14 methods

#### Table: `core_bulk_process_failure`
- PK: `id` (int, AUTO_INCREMENT)
- Columns: `value`, `method`, `airIp`, `reason`, `proccessId`, `createdAt`

#### Table: `core_bulk_eda_reports` (from code analysis)
- Similar structure to bulk_process

#### Table: `core_decode_process`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | — |
| `name` | varchar(100) | NULL | NULL |
| `originalFileName` | varchar(255) | NOT NULL | — |
| `originalFilePath` | varchar(512) | NOT NULL | — |
| `decodedFilePath` | varchar(512) | NOT NULL | — |
| `recordCount` | int(11) | NULL | `0` |
| `fileType` | enum('SDP','AIR','CCN','TTFILE','ABMPG','UNKNOWN') | NULL | `'UNKNOWN'` |
| `status` | enum('PENDING','PROCESSING','COMPLETED','FAILED') | NULL | `'PENDING'` |
| `createdBy` | varchar(36) | NOT NULL | — |
| `createdAt` | datetime | NULL | `current_timestamp()` |
| `updatedAt` | datetime | NULL | ON UPDATE CURRENT_TIMESTAMP |
| `processId` | int(11) | NULL | NULL |
| `startedAt` | datetime | NULL | NULL |
| `finishedAt` | datetime | NULL | NULL |
| `errorMessage` | text | NULL | NULL |
- **PK:** `id` (BTREE)

#### Table: `core_bill_run_process`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | varchar(36) | NOT NULL | — |
| `name` | varchar(255) | NOT NULL | — |
| `inputFilePath` | varchar(500) | NOT NULL | — |
| `outputFilePath` | varchar(500) | NULL | NULL |
| `msisdnCount` | int(11) | NULL | `0` |
| `startDate` | varchar(8) | NOT NULL | — |
| `endDate` | varchar(8) | NOT NULL | — |
| `cdrRecordCount` | int(11) | NULL | `0` |
| `daRecordCount` | int(11) | NULL | `0` |
| `status` | varchar(20) | NOT NULL | `'PROCESSING'` |
| `errorMessage` | text | NULL | NULL |
| `createdBy` | varchar(36) | NOT NULL | — |
| `createdAt` | datetime | NOT NULL | `current_timestamp()` |
| `startedAt` | datetime | NULL | NULL |
| `finishedAt` | datetime | NULL | NULL |
| `processId` | int(11) | NULL | NULL |
- **PK:** `id` (BTREE)

#### Table: `core_tarrif_process`
- PK: `id` (varchar(36), default uuid())
- Columns: `tarrifId`, `serviceClassId`, `compareDate`, `compareToDate`, `status`, `sdpName`, `createdBy`, `createdAt`, `processId`, `processStartDate`, `errorStack`, `errorOn`, `isDeleted`, `deletedAt`, `deletedBy`

#### Table: `core_tarrif_process_cleanup`
- PK: `id` (int, AUTO_INCREMENT=92295)
- Columns: `processId`, `createdAt`, `errorStack`, `errorOn`, `isFinished`, `isKilled`, `type`, `killedAt`

#### Table: `core_tarrif_records`
- PK: Composite (`treeId`, `fileDate`)
- Columns: `treeId` (int), `fileDate` (datetime), `fileName` (varchar(150))

#### Table: `core_observability_metrics`
- PK: `id` (varchar(36))
- 23 columns including JSON config fields (`tables`, `metricField`, `globalFilter`, `orderBy`, `control`, `operation`, `compare`, `options`, `metricQuery`, `nodeIds`, `explodedField`)

#### Table: `core_observability_charts`
- PK: `id` (varchar(36), default uuid())
- Columns: `name`, `type`, `data`, timestamps, `isConnectivity`, `nodeIds`, `isFavorite`

#### Table: `core_observability_metric_charts`
- Join table: `chartId` ↔ `metricId`
- **FK:** `chartId` → `core_observability_charts(id)` CASCADE
- **FK:** `metricId` → `core_observability_metrics(id)` CASCADE

#### Table: `core_observability_dashboard`
- PK: `id` (varchar(36))
- Columns: `name`, `ownerId`, timestamps, `title`, `isFavorite`

#### Table: `core_observability_dashboard_charts`
- Columns: `dashboardId`, `chartId`, `options`
- Index on `chartId`

#### Table: `core_observability_dashboard_error`
- Columns: `error_stack`, `error_date`, `chartId` (no PK)

#### Table: `core_observability_metrics_alerts`
- PK: `id` (varchar(36), default uuid())
- **FK:** `observabilityMetricId` → `core_observability_metrics(id)` CASCADE

#### Table: `core_observability_metrics_filters`
- PK: `id` (varchar(255), default uuid())
- **FK:** `observabilityMetricId` → `core_observability_metrics(id)` CASCADE

#### Table: `core_observability_metrics_thresholds`
- PK: `id` (int, AUTO_INCREMENT=269)
- Index on `observabilityMetricFilterId`
- Columns: `minimum`, `maximum`, `type`, `isRecursiveAlert`

#### Table: `core_observability_metrics_types`
- PK: `id` (int, AUTO_INCREMENT=9)
- Seed data: 3 types — normal (green), warning (orange), critical (red)

#### Table: `core_observability_metrics_module`
- Composite PK: (`observabilityMetricId`, `moduleId`)
- **FK:** `observabilityMetricId` → `core_observability_metrics(id)` CASCADE

#### Table: `core_observability_metrics_used_tables`
- Composite PK: (`observabilityMetricId`, `tableId`)
- **FK:** `observabilityMetricId` → `core_observability_metrics(id)` CASCADE

#### Table: `core_observability_notification_sent`
- PK: `id` (varchar(36), default uuid())
- Indexes: `userId`
- Columns: `userId`, `message`, `type`, `color`, `createdAt`, `metricId`

#### Table: `core_malicious_requests`
- PK: `id` (bigint, AUTO_INCREMENT)
- Columns: `endpoint`, `method`, `ipAddress`, `headers`, `createdAT`

#### Table: `core_rate_limiter`
- PK: `id` (int, AUTO_INCREMENT=1025)
- Columns: `ipAddress`, `createdAt`

#### Table: `core_customer_care_error`
- PK: `id` (int, AUTO_INCREMENT=22601)
- Columns: `filePath`, `functionName`, `data`, `phone`, `createdAt`

#### Table: `core_trace_tracker`
- PK: `id` (int, AUTO_INCREMENT=203)
- `status`: enum('set','unset')
- Indexes: `phoneNumber`, `status`, `node`

#### Table: `core_chart_id_mapping`
- No PK
- Columns: `baseId`, `oldId`, `newId`, `type`

#### Table: `core_chart_palette`
- PK: `id` (int, AUTO_INCREMENT)
- Columns: `color` (varchar(20))

#### Table: `core_cleanup`
- PK: `id` (int, AUTO_INCREMENT=246)
- Index: `date_idx` on `runDate`

#### Table: `core_ucip_error_codes`
- No PK
- Columns: `error_code` (varchar(255)), `error_message` (longtext)
- Seed data: 270+ error code mappings

#### Table: `core_requests_archive`
- PK: `id` (int unsigned, AUTO_INCREMENT=21626971)
- Index: `requestDate_idx` on `requestDate`
- Columns: `type`, `endpoint`, `requestDate`, `userid`, `payload`, `host`

#### Table: `memory_usage_log`
- PK: `log_time` (timestamp, default current_timestamp())
- Columns: `innodb_buffer_pages_total`, `innodb_buffer_pages_free`, `innodb_buffer_pages_data`, `key_blocks_used`, `threads_connected`

#### Table: `ref_numbers`
- PK: `n` (int)
- Seed data: 0-999
- Engine: InnoDB, charset: latin1

### 4.2 View

**`core_params_tables_details`** — Complex view joining `core_params_table_relations` with `core_tables_field` for parameter table relationship details.

### 4.3 Foreign Key Summary (22 constraints)

| FK | From Table | Column | To Table | Column | ON DELETE |
|----|-----------|--------|----------|--------|-----------|
| 1 | core_application_refresh_token | userId | core_application_users | id | CASCADE |
| 2 | core_automated_report_email | automatedReportId | core_automated_report | id | CASCADE |
| 3 | core_automated_report_sftp | automatedReportId | core_automated_report | id | CASCADE |
| 4 | core_dashboard_widget_builder | dashboardId | core_dashboard | id | CASCADE |
| 5 | core_dashboard_widget_builder | widgetBuilderId | core_widget_builder | id | CASCADE |
| 6 | core_dashboard_chart | chartId | core_widget_builder_charts | id | CASCADE |
| 7 | core_dashboard_chart | dashboardId | core_dashboard | id | CASCADE |
| 8 | core_data_analysis_chart | chartId | core_report_charts | id | CASCADE |
| 9 | core_data_analysis_chart | dataAnalysisId | core_data_analysis | id | CASCADE |
| 10 | core_data_analysis_report | reportId | core_report | id | CASCADE |
| 11 | core_data_analysis_report | dataAnalysisId | core_data_analysis | id | CASCADE |
| 12 | core_report_charts | reportId | core_report | id | CASCADE |
| 13 | core_report_module | reportId | core_report | id | CASCADE |
| 14 | core_report_module | moduleId | core_modules | id | RESTRICT |
| 15 | core_report_used_table | reportId | core_report | id | CASCADE |
| 16 | core_shared_report | reportId | core_report | id | CASCADE |
| 17 | core_shared_rotating_dashboard | rotatingDashboardId | core_rotating_dashboard | id | CASCADE |
| 18 | core_widget_builder_charts | widgetBuilderId | core_widget_builder | id | CASCADE |
| 19 | core_widget_builder_module | moduleId | core_modules | id | RESTRICT |
| 20 | core_widget_builder_module | widgetBuilderId | core_widget_builder | id | CASCADE |
| 21 | core_widget_builder_used_tables | widgetBuilderId | core_widget_builder | id | CASCADE |
| 22 | core_notification_sent | notificationId | core_notification_settings | id | CASCADE |
| 23 | core_notification_users | notificationId | core_notification_settings | id | CASCADE |
| 24 | core_notification_users | userId | core_application_users | id | CASCADE |
| 25 | core_observability_metric_charts | chartId | core_observability_charts | id | CASCADE |
| 26 | core_observability_metric_charts | metricId | core_observability_metrics | id | CASCADE |
| 27 | core_observability_metrics_alerts | observabilityMetricId | core_observability_metrics | id | CASCADE |
| 28 | core_observability_metrics_filters | observabilityMetricId | core_observability_metrics | id | CASCADE |
| 29 | core_observability_metrics_module | observabilityMetricId | core_observability_metrics | id | CASCADE |
| 30 | core_observability_metrics_used_tables | observabilityMetricId | core_observability_metrics | id | CASCADE |

---

## 5. Route & Endpoint Inventory

### 5.1 Summary (25 modules, 150+ endpoints)

| Module | Base Path | Endpoints | Key Middleware |
|--------|-----------|-----------|---------------|
| Auth | `/api/v1/auth` | 6 | validation |
| Users | `/api/v1/users` | 20 | jwt, authorize, validation |
| Dashboard | `/api/v1/dashboard` | 10 | jwt, authorize |
| Reports | `/api/v1/reports` | 25+ | jwt, authorize (9 chart types + 11 exports) |
| Widget Builder | `/api/v1/widgetbuilder` | 15+ | jwt, authorize |
| Observability | `/api/v1/observability` | 25+ | jwt, authorize/strictAuthorize |
| Customer Care | `/api/v1/operations` | 25+ | jwt, authorize |
| ETL Interface | `/api/v1/etlui` | 20 | jwt, authorize |
| Connectivity | `/api/v1/connectivities` | 3 | jwt, authorize |
| Bulk Processing | `/api/v1/bulk` | 9 | jwt, authorize, multer |
| Automated Reports | `/api/v1/automatedreports` | 7 | jwt, authorize |
| Notifications | `/api/v1/notifications` | 5 | jwt, authorize |
| Data Analysis | `/api/v1/dataanalysis` | 15+ | jwt, authorize |
| QBE | `/api/v1/qbe` | 15+ | jwt, authorize |
| Audit Log | `/api/v1/auditlog` | 3 | jwt, authorize |
| Node Definition | `/api/v1/nodedefinition` | 6 | jwt, authorize |
| Parameters | `/api/v1/paramstable` | 6 | jwt, authorize |
| Modules | `/api/v1/modules` | 4 | jwt, authorize |
| Rotating Dashboard | `/api/v1/rotatingdashboard` | 10+ | jwt, authorize |
| Bulk EDA Report | `/api/v1/eda` | 4 | jwt, authorize |
| CDR Decoder | `/api/v1/cdr/decoder` | 4 | jwt, authorize |
| Bill Run | `/api/v1/billrun` | 4 | jwt, authorize |
| Tariff Log | `/api/v1/tarrif` | 6 | jwt, authorize |
| Utility | `/api/v1/utilities` | 2 | keyAuthorisation |
| Deployment | `/api/v1/deploy` | 2 | jwt, authorize |

### 5.2 Auth Endpoints (No JWT required)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/login` | Login → returns JWT + user |
| POST | `/auth/token` | Refresh token |
| POST | `/auth/token/timer` | Refresh with timer |
| GET | `/auth/logout` | Logout (jwt required) |
| GET | `/auth/heartbeat` | Session keepalive (jwt required) |
| POST | `/auth/access` | Check module access (jwt required) |

### 5.3 Export Formats (Reports)

CSV, JSON, HTML, PDF, PNG, JPEG, Excel — each with full-report and per-tab variants.

---

## 6. Socket.IO Analysis

### 6.1 Namespaces

| Namespace | Handler | Auth | Room | Redis Key |
|-----------|---------|------|------|-----------|
| `/notifications` | NotificationHandler | JWT | `notifications` | `notifications:` |
| `/dashboard` | DashboardHandler | JWT | `dashboard` | `dashboard:` |
| `/etl` | EtlHandler | **None** | `etl` | — |
| `/connectivities` | ConnectivityHandler | JWT | `connectivities` | `connectivities:` |
| `/observability_dashboards` | ObservabilityHandler | JWT | `observability_dashboards` | `observability_dashboards:` |
| `/observability_alerts` | ObservabilityAlertsHandler | JWT | `observability_alerts` | `observabilityNotifications:` |

### 6.2 Key Events

- **DashboardHandler:** `run_chart` → generates chart, emits `${widgetBuilderId}_${chartId}`
- **EtlHandler:** `trigger` → triggers chart regen for dashboard clients (Bottleneck rate limited: 10 concurrent, 100ms gap)
- **NotificationHandler:** Server pushes `alert` to specific user sockets
- **ConnectivityHandler:** `fetchData` emitted on connection with initial data
- **ObservabilityHandler:** `run_chart` → emits `${chartId}`

### 6.3 Cross-Handler Communication

- EtlHandler → DashboardHandler (chart regeneration)
- NotificationService → NotificationHandler (`alert` events)
- ConnectivityService → ConnectivityHandler + NotificationHandler

### 6.4 Cluster Support

- `@socket.io/redis-adapter` with key prefix `imonitor-master`, 20s timeout
- `@socket.io/sticky` with round-robin
- `fetchSockets()` with 10 retries for cross-worker queries
- Redis `scanStream` for client enumeration across cluster

---

## 7. Shared Logic & Utilities

### 7.1 Core Utilities (18 modules in `/core/utils/`)

| Utility | NestJS Equivalent |
|---------|------------------|
| `logger.util.ts` | NestJS Logger + Winston |
| `jwt.util.ts` | `@nestjs/passport` + JWT strategy |
| `password.util.ts` | Keep as utility |
| `authorization.util.ts` | NestJS Guard |
| `http.util.ts` | NestJS decorators |
| `database.util.ts` | Keep for legacy DB queries |
| `validation.util.ts` | `class-validator` + Pipes |
| `common.util.ts` | Keep (GUID gen, password gen, file ops) |
| `date.util.ts` | Keep (date-fns wrapper) |
| `pagination.util.ts` | NestJS interceptor |
| `process.util.ts` | Keep for worker scripts |
| `worker.util.ts` | Keep for CPU-bound tasks |
| `sftp.util.ts` | NestJS service |
| `smsc.util.ts` | NestJS service |
| `chart.util.ts` | Keep |
| `threshold.util.ts` | Keep |
| `observability.util.ts` | Keep |
| `app.errors.ts` | NestJS HttpException subclasses |

### 7.2 Background Workers

| Worker | Type | Purpose |
|--------|------|---------|
| `automatedReportScript.ts` | child_process | Generate scheduled reports |
| `bulkProcess.worker.ts` | child_process | Execute bulk operations |
| `scheduledbulkProcess.worker.ts` | child_process | Scheduled bulk ops |
| `cdrDecoder.worker.ts` | worker_threads | CDR file decoding |
| `billRun.worker.ts` | worker_threads | Bill run (Presto queries) |
| `runChart.worker.ts` | worker_threads | Chart generation |
| `observabilityAlarms.worker.ts` | child_process | Metric threshold monitoring |
| `databaseRetentionCleanup.ts` | child_process | DB retention cleanup |
| `requestArchivecleanup.ts` | child_process | Request archive cleanup |
| `automatedReportRetentionCleaning.ts` | child_process | Report file cleanup |

---

## 8. Identified Issues & Tech Debt

### 8.1 Security

1. **SQL injection in authorize middleware** — string interpolation instead of parameterized queries
2. **Hardcoded credentials** — email addresses and some credentials in source code
3. **AES key exposure** — `'Alfa_123!'` hardcoded in migration scripts

### 8.2 Code Quality

1. Heavy `any` usage undermining TypeScript safety
2. `customerCare.service.ts` at 235KB — massive single file
3. Duplicate child process management boilerplate
4. Dead/commented code left in place
5. O(n³) nested loops in notification threshold checking
6. Typo preserved in production table name: `core_connectifity_notifications`

### 8.3 Architecture

1. Tight coupling — services directly instantiate Socket.IO handlers
2. No event system — side effects (email, SMS, notifications) inline
3. Monolithic services — single files handling 20+ operations
4. No request correlation IDs for tracing
5. Missing async error propagation in SMSC utility

---

## 9. Architecture Recommendation

### 9.1 Decision: Modular Architecture

**Recommendation: Standard NestJS Modular Architecture with Domain Separation**

| Factor | Assessment | Verdict |
|--------|-----------|---------|
| Project size | 150+ endpoints, 25 modules — large but mostly CRUD | Modular fits |
| Business logic | Low-medium — data retrieval + formatting | Clean Arch overkill |
| Team familiarity | NestJS modular is standard, lower learning curve | Faster adoption |
| Domain boundaries | Already well-defined by existing module structure | Natural mapping |
| Complex domains | Only CustomerCare, Reports, Notifications have significant logic | Use domain patterns locally |

**Why NOT Clean/Hexagonal Architecture:**
- This is primarily a **data aggregation and visualization platform**
- Most endpoints are CRUD with query generation
- The added layer complexity (domain, application, infrastructure, presentation) would not provide proportional benefit
- Clean Architecture excels for complex business rules — this project's complexity is in data processing

### 9.2 Decision: No CQRS

**Recommendation: Standard Controller → Service for ALL modules**

| Criterion | This Project | Verdict |
|-----------|-------------|---------|
| Read models differ from write | No | Not needed |
| Event sourcing | No | Not needed |
| Separate read/write scaling | No — single MySQL | Not needed |
| Complex write rules | Minimal — validation + INSERT/UPDATE | Not needed |

**Alternative: Event-Driven Side Effects**

Instead of CQRS, extract side effects into `@nestjs/event-emitter` handlers:
- `user.created` → audit log, email
- `report.generated` → notification
- `threshold.exceeded` → email, SMS, socket alert
- `connectivity.changed` → socket broadcast, notification

This gives decoupling benefits without CQRS overhead.

### 9.3 Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      NestJS Application                       │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              Global Middleware Pipeline                  │   │
│  │  Helmet | CORS | RateLimit | RequestFilter | Morgan     │   │
│  └────────────────────────────────────────────────────────┘   │
│                            │                                   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              Guards & Interceptors                      │   │
│  │  JwtAuthGuard | RolesGuard | RequestArchiveInterceptor │   │
│  │  ResponseTransformInterceptor | PaginationInterceptor  │   │
│  └────────────────────────────────────────────────────────┘   │
│                            │                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  Auth    │ │  Users   │ │Dashboard │ │ Reports  │  ...    │
│  │  Module  │ │  Module  │ │  Module  │ │  Module  │ (25)    │
│  │ ──────── │ │ ──────── │ │ ──────── │ │ ──────── │        │
│  │Controller│ │Controller│ │Controller│ │Controller│        │
│  │Service   │ │Service   │ │Service   │ │Service   │        │
│  │DTOs      │ │DTOs      │ │DTOs      │ │DTOs      │        │
│  │Entity    │ │Entity    │ │Entity    │ │Entity    │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                            │                                   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                   Shared Module                         │   │
│  │  MailerService | SmsService | ExportService             │   │
│  │  DateHelper | ChartHelper | PaginationHelper            │   │
│  │  @CurrentUser | @Roles | @Public decorators             │   │
│  └────────────────────────────────────────────────────────┘   │
│                            │                                   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │            Event System (@nestjs/event-emitter)         │   │
│  │  user.* | report.* | threshold.* | connectivity.*      │   │
│  └────────────────────────────────────────────────────────┘   │
│                            │                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Notif.   │ │Dashboard │ │  ETL     │ │Connectiv.│        │
│  │ Gateway  │ │ Gateway  │ │ Gateway  │ │ Gateway  │  ...   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                            │                                   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                   Database Layer                        │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐         │   │
│  │  │  TypeORM   │ │LegacyData  │ │ LegacyEtl  │         │   │
│  │  │iMonitorV3_1│ │  DbModule  │ │  DbModule  │         │   │
│  │  │ (Entities) │ │ (raw SQL)  │ │ (raw SQL)  │         │   │
│  │  └────────────┘ └────────────┘ └────────────┘         │   │
│  │  ┌────────────┐ ┌────────────┐                         │   │
│  │  │   Redis    │ │  Presto    │                         │   │
│  │  │   Module   │ │  Module    │                         │   │
│  │  └────────────┘ └────────────┘                         │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. Module Dependency Map

### 10.1 Feature Modules (v3 → v4)

| v3 Module | v4 NestJS Module | Depends On |
|-----------|-----------------|-----------|
| Auth | `AuthModule` | UsersModule, SharedModule |
| Users | `UsersModule` | SharedModule |
| Dashboard | `DashboardModule` | WidgetBuilderModule, SharedModule |
| Reports | `ReportsModule` | SharedModule, ExportModule |
| WidgetBuilder | `WidgetBuilderModule` | SharedModule |
| DataAnalysis | `DataAnalysisModule` | ReportsModule, SharedModule |
| QBE | `QbeModule` | SharedModule |
| RotatingDashboard | `RotatingDashboardModule` | DashboardModule |
| Observability | `ObservabilityModule` | SharedModule, NotificationModule |
| CustomerCare | `CustomerCareModule` | SharedModule, LegacyDataDbModule |
| Notifications | `NotificationModule` | SharedModule, MailerModule, SmsModule |
| Connectivity | `ConnectivityModule` | SharedModule, NotificationModule |
| AutomatedReport | `AutomatedReportModule` | ReportsModule, MailerModule |
| BulkProcessing | `BulkProcessingModule` | SharedModule, LegacyDataDbModule |
| BulkEdaReport | `BulkEdaReportModule` | SharedModule |
| CdrDecoder | `CdrDecoderModule` | SharedModule |
| BillRun | `BillRunModule` | SharedModule, LegacyPrestoModule |
| TariffLog | `TariffLogModule` | SharedModule |
| ETL | `EtlModule` | SharedModule, LegacyEtlDbModule |
| AuditLog | `AuditLogModule` | SharedModule, LegacyDataDbModule |
| NodeDefinition | `NodeDefinitionModule` | SharedModule, LegacyDataDbModule |
| Parameters | `ParametersModule` | SharedModule |
| Modules | `ModulesModule` | SharedModule |
| Utility | `UtilityModule` | SharedModule |
| Deployment | `DeploymentModule` | SharedModule |

### 10.2 Infrastructure Modules

| Module | Purpose |
|--------|---------|
| `DatabaseModule` | TypeORM for iMonitorV3_1 |
| `LegacyDataDbModule` | Raw mysql2 for iMonitorData |
| `LegacyEtlDbModule` | Raw mysql2 for EtlV3_2 |
| `LegacyPrestoModule` | Presto client for bill runs |
| `RedisModule` | ioredis client |
| `SharedModule` | Cross-cutting utilities |
| `MailerModule` | nodemailer service |
| `SmsModule` | SMPP service |
| `ExportModule` | PDF/Excel/CSV/HTML exports |
| `SocketModule` | Socket.IO gateways |
| `SchedulerModule` | @nestjs/schedule cron jobs |
| `WorkerModule` | Worker thread management |
| `LoggerModule` | Winston + daily rotation |
| `ConfigModule` | @nestjs/config with Joi validation |

---

## 11. Phased Migration Plan

### Phase 1: Project Scaffolding & Infrastructure
**Branch:** `migration/phase-1-scaffolding-typeorm`

| Sub-task | Description | Commit |
|----------|-------------|--------|
| 1.1 | NestJS scaffold + strict TS + @nestjs/config with Joi | `chore: scaffold NestJS project` |
| 1.2 | TypeORM entities for all 51 iMonitorV3_1 tables (from db.sql) | `feat: add TypeORM entities for iMonitorV3_1` |
| 1.3 | TypeORM migration file to recreate full schema | `feat: add TypeORM migration for full schema` |
| 1.4 | LegacyDataDbModule (mysql2 pool for iMonitorData) | `feat: add LegacyDataDbModule` |
| 1.5 | LegacyEtlDbModule (mysql2 pool for EtlV3_2) | `feat: add LegacyEtlDbModule` |
| 1.6 | LegacyPrestoModule (Presto client wrapper) | `feat: add LegacyPrestoModule` |
| 1.7 | Redis module (ioredis) | `feat: add Redis module` |
| 1.8 | Cluster mode + sticky sessions + graceful shutdown | `feat: add cluster mode` |
| 1.9 | Winston logger + daily rotation + correlation IDs | `feat: add logger module` |

### Phase 2: Core Architecture Setup
**Branch:** `migration/phase-2-core-architecture`

| Sub-task | Description |
|----------|-------------|
| 2.1 | SharedModule (decorators, base DTOs, pagination, helpers) |
| 2.2 | JwtAuthGuard + RolesGuard (replace jwt/authorize middleware) |
| 2.3 | Interceptors (RequestArchive, ResponseTransform, RequestFilter) |
| 2.4 | Event system (@nestjs/event-emitter + domain event types) |
| 2.5 | Global exception filters |

### Phase 3: Module-by-Module Migration
**Separate branch per group**

| Group | Branch | Modules |
|-------|--------|---------|
| 3.1 | `migration/phase-3.1-auth-users` | Auth, Users |
| 3.2 | `migration/phase-3.2-core-features` | Modules, Parameters, NodeDefinition |
| 3.3 | `migration/phase-3.3-reporting` | Reports, WidgetBuilder, QBE, Export |
| 3.4 | `migration/phase-3.4-dashboards` | Dashboard, RotatingDashboard, DataAnalysis |
| 3.5 | `migration/phase-3.5-monitoring` | Observability, Connectivity, Notifications |
| 3.6 | `migration/phase-3.6-customer-care` | CustomerCare |
| 3.7 | `migration/phase-3.7-processing` | BulkProcessing, BulkEda, CdrDecoder, BillRun, Tariff |
| 3.8 | `migration/phase-3.8-automation-admin` | AutomatedReport, AuditLog, Utility, Deployment |
| 3.9 | `migration/phase-3.9-background-jobs` | Scheduler, Worker modules |
| 3.10 | `migration/phase-3.10-env-centralization` | Env centralization tech debt (deferred from 3.8) |

#### Tech Debt — Phase 3.8 pre-work (deferred to Phase 3.10)

- **Env centralization**: Replace all `process.env.X \|\| 'fallback'` direct accesses in main-thread services with `ConfigService.get()`. Add missing vars (`DB_DATA_NAME`, `DB_CORE_NAME`) to `env.validation.ts` with proper Joi defaults. Worker scripts (`cdrDecoder.worker.ts`, `billRun.worker.ts`) are exempt — `process.env` is correct there since NestJS DI is unavailable in `worker_threads`.
- Affected services: `customer-care-sdp-trace.service.ts`, `customer-care-history.service.ts`, `customer-care-air-trace.service.ts`, `tarrif-log.service.ts`
- Partial fix already applied: `DB_DATA_NAME` in `dashboard.gateway.ts` (landed in `v0.4.1-socketio-security-fixes`)

### Phase 3.10: Env Centralization Tech Debt
**Branch:** `migration/phase-3.10-env-centralization`

Replace remaining `process.env` direct accesses in main-thread services with `ConfigService.get()`. Add `DB_CORE_NAME` to `env.validation.ts`.

### Phase 4: Socket.IO Gateways
**Branch:** `migration/phase-4-socketio`
**Tag:** `v0.4.0-migration-phase4` | Security fixes: `v0.4.1-socketio-security-fixes`

6 Gateway classes + Redis adapter + JWT WsGuard + Bottleneck rate limiter. Security review completed 2026-03-13; all P0/P1 findings resolved.

### Phase 5: Testing & Validation
**Branch:** `migration/phase-5-testing`

Unit tests + E2E tests + Socket.IO tests + load testing + MANUAL_TESTING.md

**Tag:** `v1.0.0-nestjs-migration`

### Phase 6: Parallel API Verification
**Branch:** `migration/phase-6-parallel-verification`

Run v3 and v4 APIs side by side, replay the same requests to both, and compare responses to verify endpoint parity.

| Sub-task | Description |
|----------|-------------|
| 6.1 | Stand up v3 and v4 in parallel (same DB, separate ports) |
| 6.2 | Build request replay/proxy harness that sends each request to both APIs |
| 6.3 | Compare response status codes, body shapes, and data for every endpoint |
| 6.4 | Log and triage all mismatches — fix v4 until responses match |
| 6.5 | Validate destructive operations (POST/PUT/DELETE) produce identical DB state |
| 6.6 | Verify Socket.IO event parity across all 6 namespaces |

**Tag:** `v1.1.0-parallel-verified`

### Phase 7: QueryBuilder Refactor
**Branch:** `migration/phase-7-querybuilder-refactor`

Refactor the QueryBuilder service (SQL injection fixes, god-method decomposition, proper parameterization) while continuously comparing its query results against the v3 API to prevent regressions.

| Sub-task | Description |
|----------|-------------|
| 7.1 | Set up automated comparison harness: run the same report/chart generation requests through v3 and v4, diff the query results row-by-row |
| 7.2 | Replace string concatenation with parameterized queries (fix SQL injection — findings #1-4, #10) |
| 7.3 | Break down the god method into focused, single-responsibility functions (finding #24) |
| 7.4 | Remove `escapeSQLLiteral` in favour of proper parameterization (finding #10) |
| 7.5 | Add comprehensive unit tests for each decomposed function (findings #8-9) |
| 7.6 | Run full report regression suite — verify every report type produces identical results to v3 |
| 7.7 | Performance benchmark: compare v4 refactored query execution times against v3 baselines |

**Tag:** `v1.2.0-querybuilder-refactored`

---

## 12. Database Migration Strategy

### 12.1 TypeORM Configuration

```typescript
TypeOrmModule.forRoot({
  type: 'mariadb',
  host: configService.get('DB_HOST'),
  port: configService.get('DB_PORT'),
  username: configService.get('DB_USER'),
  password: configService.get('DB_PASSWORD'),
  database: 'iMonitorV3_1',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: false,
  migrationsRun: false,
  logging: ['error', 'warn'],
  extra: {
    connectionLimit: 15,
    enableKeepAlive: true,
    keepAliveInitialDelay: 1000,
  },
})
```

### 12.2 Entity Generation Rules

1. Every entity matches a table in `db.sql` exactly
2. Column types map: varchar→string, int→number, tinyint(1)→boolean, longtext→string, datetime→Date, enum→enum
3. `uuid()` defaults use TypeORM `@Generated('uuid')` or `@BeforeInsert()` UUID generation
4. Composite primary keys use `@PrimaryColumn()` on each column
5. `ON UPDATE CURRENT_TIMESTAMP` mapped with `@UpdateDateColumn()`
6. All foreign keys defined with `@ManyToOne` / `@OneToMany` decorators
7. Preserve original column names (including typos like `connectifity`)

### 12.3 Migration Execution

- Migrations are safe to run on a **fresh empty database**
- Never run against the production iMonitorV3_1
- Seed data included for: roles, modules, sys_config, observability_metrics_types, bulk_process_methods, ucip_error_codes, ref_numbers, tarrif_trees

### 12.4 Dual Pool Support

- TypeORM replaces main pool for iMonitorV3_1 queries
- Limited pool preserved in separate module for `nativeQuery()` calls
- Both pools share same host/port

### 12.5 Manual Validation Required

Before production deployment, validate against live DB:
- [ ] All entity column types match actual schema
- [ ] All foreign key relationships correct
- [ ] UUID vs auto-increment PKs verified
- [ ] Nullable columns correctly identified
- [ ] Default values match
- [ ] AES encrypted varbinary columns work correctly
- [ ] Cross-database JOINs still work with TypeORM connection

---

## 13. Risk Assessment & Rollback

### Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Entity/schema mismatch | Low (have db.sql) | High | Validate against live DB |
| Cross-database query regression | Medium | High | Keep same MySQL connection |
| Socket.IO behavior change | Medium | Medium | E2E tests comparing v3/v4 |
| Worker thread compatibility | Low | Medium | Keep same fork/worker pattern |
| Performance regression | Medium | Medium | Load testing before switch |

### Go-Live Strategy

1. Deploy v4 alongside v3 (blue-green)
2. Route subset of traffic to v4
3. Compare responses between v3 and v4
4. Gradually increase v4 traffic
5. Full cutover when confidence is high

### Milestone Tags

| Tag | Description |
|-----|-------------|
| `v0.1.0-migration-phase1` | Scaffolding + infrastructure |
| `v0.2.0-migration-phase2` | Core architecture + shared module |
| `v0.3.0-migration-phase3` | All modules migrated |
| `v0.4.0-migration-phase4` | Socket.IO migrated |
| `v1.0.0-nestjs-migration` | Testing complete, ready for deploy |
| `v1.1.0-parallel-verified` | All endpoints verified against v3 |
| `v1.2.0-querybuilder-refactored` | QueryBuilder refactored with v3 result parity |

---

*Generated: 2026-03-01 | Schema source: db.sql (Navicat export, 2026-02-28)*
