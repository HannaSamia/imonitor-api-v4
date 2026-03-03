# Phase 3.1 -- Deployment & Infrastructure Guide: Auth & Users Module Refactoring

**Project**: iMonitor API v4 (NestJS 10 + TypeORM 0.3.x + MariaDB)
**Module**: Auth & Users (Phase 3.1)
**Database**: MariaDB `iMonitorV3_1`
**Date**: March 2026
**Version**: 0.1.0

---

## Table of Contents

1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [Database Migration Steps](#2-database-migration-steps)
3. [Deployment Procedure](#3-deployment-procedure)
4. [Rollback Plan](#4-rollback-plan)
5. [Monitoring Recommendations](#5-monitoring-recommendations)
6. [Post-Deployment Verification](#6-post-deployment-verification)
7. [Appendix: Environment Variable Reference](#7-appendix-environment-variable-reference)

---

## 1. Pre-Deployment Checklist

Complete every item before proceeding to the deployment.

### 1.1 Environment Variables

No new environment variables are introduced in this phase. The following existing variables require review or modification:

| Variable | Status | Required Action |
|----------|--------|----------------|
| `JWT_KEY` | **Modified requirement** | Must be at least 32 characters. Verify the current value meets this minimum length. If it does not, generate a new key (`openssl rand -base64 48`) and rotate it. **Warning**: Changing `JWT_KEY` invalidates all existing user sessions -- plan accordingly. |
| `CORS_ORIGIN` | **New recommendation** | Currently `app.enableCors()` is called with no origin restriction (allows all origins). For production, set a `CORS_ORIGIN` environment variable and pass it to `enableCors({ origin: process.env.CORS_ORIGIN })`. This is a security hardening item, not a functional blocker. |
| `DB_HOST` | Existing | No change required. |
| `DB_USER` | Existing | No change required. Verify the user has `CREATE INDEX` and `DROP INDEX` privileges on `iMonitorV3_1`. |
| `DB_PASSWORD` | Existing | No change required. |
| `DB_PORT` | Existing | No change required (default: 3306). |
| `REDIS_HOST` | Existing | No change required (default: `localhost`; overridden to `redis-server` in Docker Compose). |
| `REDIS_PORT` | Existing | No change required (default: 6379). |
| `REDIS_PASSWORD` | Existing | No change required. |

**JWT_KEY minimum length validation**: The current `env.validation.ts` schema validates `JWT_KEY` as `Joi.string().required()`. The recommendation from the security review is to enforce a minimum of 32 characters. This is a code-level action item for a future iteration; for this deployment, verify the production value manually:

```bash
# On the deployment server, check the current key length:
echo -n "$JWT_KEY" | wc -c
# Must output 32 or greater
```

### 1.2 Dependencies

One new npm dependency was added in this phase:

| Package | Version | Purpose |
|---------|---------|---------|
| `@nestjs/jwt` | `^10.2.0` | JWT signing and verification via NestJS DI, replacing the standalone `jsonwebtoken` usage with a module-integrated approach |

This dependency is already listed in `package.json`. The `npm ci` step during the Docker build will install it automatically. No manual intervention is needed.

**Verification before deployment**:

```bash
# Confirm the dependency is in package.json
grep '@nestjs/jwt' package.json

# Confirm it resolves correctly in the lock file
grep '@nestjs/jwt' package-lock.json | head -5
```

### 1.3 Database Migration

A single migration file adds 8 new indexes across 4 tables:

| # | Table | Index Name | Columns | Type |
|---|-------|-----------|---------|------|
| 1 | `core_application_users` | `IDX_users_userName` | `(userName)` | Single |
| 2 | `core_application_users` | `IDX_users_email` | `(email)` | Single |
| 3 | `core_application_users` | `IDX_users_isDeleted` | `(isDeleted)` | Single |
| 4 | `core_application_users` | `IDX_users_email_isDeleted` | `(email, isDeleted)` | Composite |
| 5 | `core_application_users` | `IDX_users_userName_isDeleted` | `(userName, isDeleted)` | Composite |
| 6 | `core_privileges` | `IDX_privileges_userId_moduleId` | `(UserId, ModuleId)` | Composite |
| 7 | `core_application_refresh_token` | `IDX_refreshToken_jwtId` | `(jwtId)` | Single |
| 8 | `core_minimum_privileges` | `IDX_minPriv_request_method` | `(request, method)` | Composite |

**Migration file**: `src/database/migrations/1709500000000-AddAuthIndexes.ts`

### 1.4 Code Changes Summary (for awareness)

This deployment includes the following code changes. No action is required from the deployment engineer beyond deploying the build artifact, but these are documented for context:

- Entity `@Index` decorators added to 4 entity files
- `CorePrivileges` entity property names changed from PascalCase to camelCase (with `@Column({ name: ... })` mapping -- database columns unchanged)
- `PrivilegeGuard` refactored from raw SQL (`DataSource.query()`) to TypeORM repository pattern
- Service files updated to use camelCase property names for `CorePrivileges`
- `CoreMinimumPrivileges` entity enhanced with `@Index` and `@ManyToOne` relation

**No DDL changes to column definitions or table structure. All changes are additive indexes only.**

### 1.5 Pre-Deployment Approval Checklist

- [ ] `JWT_KEY` verified to be >= 32 characters
- [ ] Database user `DB_USER` has `CREATE INDEX` / `DROP INDEX` privileges
- [ ] All 88 tests passing in the CI pipeline (0 failures)
- [ ] `package-lock.json` is committed and up to date
- [ ] Docker image builds successfully in staging
- [ ] Health check endpoint (`GET /health`) returns 200 in staging
- [ ] Database backup completed (see Section 2.1)
- [ ] Stakeholders notified of the deployment window

---

## 2. Database Migration Steps

### 2.1 Pre-Migration Backup

Always take a backup before running migrations in production:

```bash
# Full database dump (compressed)
mysqldump -h $DB_HOST -u $DB_USER -p$DB_PASSWORD \
  --single-transaction \
  --routines \
  --triggers \
  --databases iMonitorV3_1 \
  | gzip > iMonitorV3_1_backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Verify the backup
gunzip -t iMonitorV3_1_backup_*.sql.gz && echo "Backup OK"
```

For a lighter-weight backup (schema only, since we are only adding indexes):

```bash
mysqldump -h $DB_HOST -u $DB_USER -p$DB_PASSWORD \
  --single-transaction \
  --no-data \
  iMonitorV3_1 \
  core_application_users core_privileges core_application_refresh_token core_minimum_privileges \
  > schema_backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2.2 Running the Migration

The migration uses `CREATE INDEX IF NOT EXISTS`, which is idempotent and safe to run multiple times.

**Option A: Via TypeORM CLI (recommended)**

```bash
# From the project root on the deployment server (or via the container)
# Ensure .env is loaded with production database credentials

# Dry run -- verify which migrations will execute
npm run typeorm -- migration:show -d src/database/data-source.ts

# Run the migration
npm run migration:run
```

This executes: `ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts`

TypeORM will:
1. Check the `migrations` table for already-executed migrations
2. Execute `AddAuthIndexes1709500000000.up()` if not already run
3. Record the migration in the `migrations` table

**Option B: Via Docker exec (if deploying with Docker Compose)**

```bash
# Enter the running API container
docker exec -it imonitor-api-v4 sh

# Run the migration inside the container
node -e "
  const { DataSource } = require('typeorm');
  const ds = new DataSource({
    type: 'mariadb',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: (process.env.coreDbName || 'iMonitorV3_1').replace(/\x60/g, ''),
    migrations: ['dist/database/migrations/*.js'],
  });
  ds.initialize()
    .then(d => d.runMigrations())
    .then(r => { console.log('Migrations applied:', r.length); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
"
```

**Option C: Direct SQL (manual, for DBA-controlled environments)**

If the TypeORM CLI is not available in the production environment, run the index creation SQL directly:

```sql
-- Connect to the iMonitorV3_1 database
USE iMonitorV3_1;

-- core_application_users (5 indexes)
CREATE INDEX IF NOT EXISTS IDX_users_userName
  ON core_application_users (userName);

CREATE INDEX IF NOT EXISTS IDX_users_email
  ON core_application_users (email);

CREATE INDEX IF NOT EXISTS IDX_users_isDeleted
  ON core_application_users (isDeleted);

CREATE INDEX IF NOT EXISTS IDX_users_email_isDeleted
  ON core_application_users (email, isDeleted);

CREATE INDEX IF NOT EXISTS IDX_users_userName_isDeleted
  ON core_application_users (userName, isDeleted);

-- core_privileges (1 index)
CREATE INDEX IF NOT EXISTS IDX_privileges_userId_moduleId
  ON core_privileges (UserId, ModuleId);

-- core_application_refresh_token (1 index)
CREATE INDEX IF NOT EXISTS IDX_refreshToken_jwtId
  ON core_application_refresh_token (jwtId);

-- core_minimum_privileges (1 index)
CREATE INDEX IF NOT EXISTS IDX_minPriv_request_method
  ON core_minimum_privileges (request, method);
```

**Important**: If using Option C, you must also manually insert a record into the TypeORM `migrations` table so that the CLI does not attempt to re-run the migration:

```sql
INSERT INTO migrations (timestamp, name)
VALUES (1709500000000, 'AddAuthIndexes1709500000000');
```

### 2.3 Expected Downtime

**None.** All statements use `CREATE INDEX IF NOT EXISTS`, which on MariaDB with InnoDB:

- Uses the online DDL (`ALGORITHM=INPLACE, LOCK=NONE`) by default for secondary index creation
- Does not block concurrent DML (INSERT, UPDATE, DELETE, SELECT)
- The table remains fully readable and writable during index creation

For the expected table sizes in a typical iMonitor deployment:

| Table | Estimated Rows | Index Creation Time |
|-------|---------------|-------------------|
| `core_application_users` | ~500 | < 1 second |
| `core_privileges` | ~5,000 | < 1 second |
| `core_application_refresh_token` | ~10,000 | 1-2 seconds |
| `core_minimum_privileges` | ~100 | < 1 second |

Total estimated migration time: **under 5 seconds**.

### 2.4 Migration Verification

After running the migration, verify all indexes were created:

```sql
-- Check core_application_users indexes (expect 6: PK + 5 new)
SHOW INDEX FROM core_application_users;

-- Check core_privileges indexes (expect 2: PK + 1 new)
SHOW INDEX FROM core_privileges;

-- Check core_application_refresh_token indexes (expect 3: PK + existing FK + 1 new)
SHOW INDEX FROM core_application_refresh_token;

-- Check core_minimum_privileges indexes (expect 2: PK + 1 new)
SHOW INDEX FROM core_minimum_privileges;
```

Confirm the query optimizer uses the new indexes:

```sql
-- Login query should use IDX_users_userName_isDeleted or IDX_users_email_isDeleted
EXPLAIN SELECT id, isLocked, email, userName, passwordHash, allowMultipleSessions, theme
FROM core_application_users
WHERE userName = 'testuser' AND isDeleted = 0;

-- Privilege check should use IDX_privileges_userId_moduleId
EXPLAIN SELECT * FROM core_privileges
WHERE UserId = 'test-uuid' AND ModuleId = 1;

-- Logout should use IDX_refreshToken_jwtId
EXPLAIN SELECT * FROM core_application_refresh_token
WHERE jwtId = 'test-jti';

-- PrivilegeGuard should use IDX_minPriv_request_method
EXPLAIN SELECT * FROM core_minimum_privileges
WHERE request = '/api/v1/users' AND method = 'GET';
```

Each `EXPLAIN` output should show the expected index name in the `key` column.

### 2.5 Migration Rollback

If the migration needs to be reverted:

**Option A: Via TypeORM CLI**

```bash
npm run migration:revert
```

This calls `AddAuthIndexes1709500000000.down()`, which executes:

```sql
DROP INDEX IF EXISTS IDX_users_userName ON core_application_users;
DROP INDEX IF EXISTS IDX_users_email ON core_application_users;
DROP INDEX IF EXISTS IDX_users_isDeleted ON core_application_users;
DROP INDEX IF EXISTS IDX_users_email_isDeleted ON core_application_users;
DROP INDEX IF EXISTS IDX_users_userName_isDeleted ON core_application_users;
DROP INDEX IF EXISTS IDX_privileges_userId_moduleId ON core_privileges;
DROP INDEX IF EXISTS IDX_refreshToken_jwtId ON core_application_refresh_token;
DROP INDEX IF EXISTS IDX_minPriv_request_method ON core_minimum_privileges;
```

**Option B: Direct SQL**

Run the `DROP INDEX IF EXISTS` statements above manually, then remove the migration record:

```sql
DELETE FROM migrations WHERE name = 'AddAuthIndexes1709500000000';
```

**Rollback impact**: The application continues to function correctly without the indexes. The only effect is reduced query performance (full table scans instead of index seeks). No data loss occurs.

---

## 3. Deployment Procedure

### 3.1 Deployment Order

The deployment must follow this sequence:

```
Step 1: Database migration (add indexes)
         |
         | Indexes are additive and fully compatible with both
         | the old and new application code.
         |
Step 2: Application deployment (new Docker image)
         |
         | The new code uses the new indexes via TypeORM decorators
         | and repository queries. The code also works without the
         | indexes (just slower -- TypeORM generates the same SQL).
         |
Step 3: Post-deployment verification
```

Steps 1 and 2 can run concurrently if desired, since the index creation does not block the running application and the new code works with or without the indexes.

### 3.2 Docker Build and Deploy

**Build the new image:**

```bash
# From the project root
docker build -t imonitor-api-v4:phase3.1 .

# Tag for your registry (if applicable)
docker tag imonitor-api-v4:phase3.1 your-registry.example.com/imonitor-api-v4:phase3.1
docker push your-registry.example.com/imonitor-api-v4:phase3.1
```

The Dockerfile uses a multi-stage build:
- **Stage 1 (builder)**: `node:20-alpine`, runs `npm ci` + `npm run build`
- **Stage 2 (production)**: `node:20-alpine`, installs production deps only (`npm ci --omit=dev`), copies `dist/` from builder, runs as non-root user `appuser`

**Deploy with Docker Compose:**

```bash
# Pull the latest image (if using a registry)
docker compose pull api

# Recreate the API container with the new image
docker compose up -d --no-deps --build api

# Monitor startup logs
docker compose logs -f api --tail=100
```

**Deploy without Docker Compose (standalone):**

```bash
# Stop the old container
docker stop imonitor-api-v4
docker rm imonitor-api-v4

# Start the new container
docker run -d \
  --name imonitor-api-v4 \
  --env-file .env \
  -e NODE_ENV=production \
  -e REDIS_HOST=redis-server \
  -e REDIS_PORT=6379 \
  -p 8004:5011 \
  --network imonitor-v4-network \
  --restart always \
  imonitor-api-v4:phase3.1
```

### 3.3 Connection Pool Configuration

The current database configuration in `database.module.ts` sets:

```typescript
extra: {
  connectionLimit: 5,
  enableKeepAlive: true,
  keepAliveInitialDelay: 1000,
}
```

**Recommendation from the performance review**: Increase `connectionLimit` to **20** to handle concurrent authentication requests without connection starvation. This is especially important because:

- JWT guard queries the database on every request (for `keepLogin` checks)
- PrivilegeGuard queries two tables on every protected request
- Login, logout, and token refresh each perform multiple sequential queries

To apply this change, update the `connectionLimit` value in `src/database/database.module.ts`:

```typescript
extra: {
  connectionLimit: 20,    // was: 5
  enableKeepAlive: true,
  keepAliveInitialDelay: 1000,
}
```

Alternatively, make it configurable via environment variable:

```typescript
extra: {
  connectionLimit: configService.get<number>('DB_CONNECTION_LIMIT', 20),
  enableKeepAlive: true,
  keepAliveInitialDelay: 1000,
}
```

**MariaDB server-side check**: Ensure the MariaDB server's `max_connections` accommodates the new pool size multiplied by the number of API instances:

```sql
SHOW VARIABLES LIKE 'max_connections';
-- Should be >= (20 connections/instance * N instances) + headroom for admin connections
-- For a single instance: max_connections >= 30 is sufficient
-- For clustered (CPUS > 1): max_connections >= (20 * CPUS) + 10
```

### 3.4 Health Check Verification

The application exposes a health check endpoint at `GET /health` (marked `@Public()`, no authentication required).

**Docker HEALTHCHECK** is already configured in the Dockerfile:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${APPLICATION_PORT}/health || exit 1
```

**Manual health check after deployment:**

```bash
# From the host machine (port 8004 maps to container port 5011)
curl -s http://localhost:8004/health | jq .

# Expected response (HTTP 200):
# {
#   "status": "ok",
#   "info": {
#     "database": { "status": "up" },
#     "redis": { "status": "up" },
#     "memory_heap": { "status": "up" }
#   },
#   "error": {},
#   "details": {
#     "database": { "status": "up" },
#     "redis": { "status": "up" },
#     "memory_heap": { "status": "up" }
#   }
#  }
```

The health check verifies three components:
1. **Database**: TypeORM ping check (confirms MariaDB connectivity)
2. **Redis**: Custom health indicator (confirms Redis connectivity)
3. **Memory**: Heap usage under 256 MB threshold

If the health check returns a non-200 status, investigate the failing component before directing traffic to the new instance.

### 3.5 Swagger Verification

If `SWAGGER_ENABLED` is not set to `false`, verify the Swagger documentation loads:

```bash
curl -s http://localhost:8004/api-docs-json | jq '.paths | keys | length'
# Should return the total number of registered routes
```

Or visit `http://<host>:8004/api-docs` in a browser to confirm the auth and user endpoints are documented.

---

## 4. Rollback Plan

### 4.1 Decision Criteria

Initiate rollback if any of the following occur after deployment:

- Health check (`GET /health`) returns non-200 for more than 2 minutes
- JWT authentication failures spike above baseline (monitor `JwtAuthGuard` error logs)
- Login endpoint (`POST /api/v1/auth/login`) returns 500 errors
- Database connection pool exhaustion (repeated `ER_CON_COUNT_ERROR` in logs)
- Guard rejection rate exceeds 50% of requests (excluding legitimate 401/403)

### 4.2 Application Rollback (Git-Based)

```bash
# 1. Identify the last known good commit
git log --oneline -10

# 2. Check out the previous version
git checkout <last-known-good-commit>

# 3. Rebuild and redeploy
docker build -t imonitor-api-v4:rollback .
docker compose up -d --no-deps --build api

# 4. Verify health
curl -s http://localhost:8004/health | jq .status
# Expected: "ok"
```

**Alternative -- Docker image rollback (if the previous image is available):**

```bash
# If the previous image was tagged
docker compose down api
# Update docker-compose.yml image tag to the previous version, or:
docker run -d \
  --name imonitor-api-v4 \
  --env-file .env \
  -e NODE_ENV=production \
  -e REDIS_HOST=redis-server \
  -e REDIS_PORT=6379 \
  -p 8004:5011 \
  --network imonitor-v4-network \
  --restart always \
  imonitor-api-v4:previous-tag
```

### 4.3 Database Rollback

The database rollback is independent of the application rollback. The indexes are purely additive and do not affect data or schema compatibility.

**When to rollback the database migration**:
- Only if the indexes themselves cause performance degradation (extremely unlikely)
- Not needed for application-level rollback (old code ignores the indexes -- they are transparent)

**How to rollback**:

```bash
# Via TypeORM CLI
npm run migration:revert
```

Or via direct SQL:

```sql
DROP INDEX IF EXISTS IDX_users_userName ON core_application_users;
DROP INDEX IF EXISTS IDX_users_email ON core_application_users;
DROP INDEX IF EXISTS IDX_users_isDeleted ON core_application_users;
DROP INDEX IF EXISTS IDX_users_email_isDeleted ON core_application_users;
DROP INDEX IF EXISTS IDX_users_userName_isDeleted ON core_application_users;
DROP INDEX IF EXISTS IDX_privileges_userId_moduleId ON core_privileges;
DROP INDEX IF EXISTS IDX_refreshToken_jwtId ON core_application_refresh_token;
DROP INDEX IF EXISTS IDX_minPriv_request_method ON core_minimum_privileges;

-- Remove migration record so TypeORM can re-run it later
DELETE FROM migrations WHERE name = 'AddAuthIndexes1709500000000';
```

### 4.4 Schema Compatibility

The Phase 3.1 changes are fully backward-compatible:

| Change | Forward Compatible | Backward Compatible |
|--------|-------------------|-------------------|
| 8 new indexes | Yes -- old code ignores them | Yes -- new code works without them (slower) |
| CorePrivileges property naming | Yes -- `@Column({ name: ... })` produces identical SQL | Yes -- PascalCase/camelCase is TypeScript-only |
| PrivilegeGuard refactor | Yes -- repository queries produce equivalent SQL | Yes -- raw SQL still works if reverted |
| CoreMinimumPrivileges relation | Yes -- additive | Yes -- entity not used by old code |

**No data migration is required.** The database schema (columns, types, constraints) is unchanged. Only indexes are added.

---

## 5. Monitoring Recommendations

### 5.1 Key Metrics to Watch

Monitor these metrics for the first 24-48 hours after deployment:

| Metric | Source | Baseline | Alert Threshold |
|--------|--------|----------|-----------------|
| JWT verification errors | `JwtAuthGuard` logs | Near zero | > 10/minute |
| Guard rejection rate (403) | `PrivilegeGuard`, `RolesGuard` logs | Stable | > 50% increase from baseline |
| Login failure rate (401) | `AuthService.login()` logs | Stable | > 30% increase from baseline |
| Login response time (p95) | Request archive / APM | < 500ms | > 1000ms |
| Token refresh failures | `AuthService.refreshToken()` logs | Near zero | > 5/minute |
| Database connection pool usage | MariaDB `SHOW STATUS LIKE 'Threads_connected'` | < 10 | > 80% of `connectionLimit` (16 out of 20) |
| Health check status | `GET /health` | 200 OK | Any non-200 |
| Memory heap usage | Health check `memory_heap` | < 256 MB | > 200 MB |
| API response time (global p95) | Request archive | < 1000ms | > 2000ms |

### 5.2 Log Patterns for New Logger Instances

Phase 3.1 introduces `Logger` instances in the following classes. Monitor these log contexts:

| Logger Context | Class | What to Watch For |
|----------------|-------|-------------------|
| `JwtAuthGuard` | `src/auth/guards/jwt-auth.guard.ts` | `"Invalid access token"` errors -- indicates malformed or expired JWTs that are not keepLogin |
| `PrivilegeGuard` | `src/auth/guards/privilege.guard.ts` | `"PrivilegeGuard error:"` -- indicates unexpected errors during privilege resolution (database connectivity, missing data) |
| `RolesGuard` | `src/auth/guards/roles.guard.ts` | `"RolesGuard error:"` -- module-level role check failures |
| `ApiKeyGuard` | `src/auth/guards/api-key.guard.ts` | `"Invalid api key"` -- API key authentication failures |
| `AuthService` | `src/modules/auth/auth.service.ts` | Login attempts, session conflicts, token refresh failures |
| `UsersService` | `src/modules/users/users.service.ts` | User CRUD operations, privilege updates |

**Log search patterns (for Winston/structured logging):**

```bash
# JWT authentication failures (high priority)
docker compose logs api | grep -i "JwtAuthGuard" | grep -i "error\|unauthorized"

# Guard rejections (privilege/role failures)
docker compose logs api | grep -i "PrivilegeGuard\|RolesGuard" | grep -i "error\|forbidden"

# Login failures
docker compose logs api | grep -i "AuthService" | grep -i "INVALID_CREDENTIALS\|ACCOUNT_LOCKED"

# Database errors (connection issues)
docker compose logs api | grep -i "ER_CON_COUNT\|ECONNREFUSED\|connection"
```

### 5.3 MariaDB Monitoring Queries

Run these periodically to assess index effectiveness and connection health:

```sql
-- Connection pool utilization
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';

-- Slow queries (if slow_query_log is enabled)
SHOW STATUS LIKE 'Slow_queries';

-- Index usage statistics (MariaDB 10.5+)
SELECT * FROM information_schema.INDEX_STATISTICS
WHERE TABLE_SCHEMA = 'iMonitorV3_1'
AND TABLE_NAME IN (
  'core_application_users',
  'core_privileges',
  'core_application_refresh_token',
  'core_minimum_privileges'
);

-- Table scan vs index usage
SHOW STATUS LIKE 'Handler_read%';
-- Compare Handler_read_rnd_next (full scans) vs Handler_read_key (index seeks)
-- After deploying indexes, Handler_read_key should increase significantly
```

### 5.4 Redis Monitoring

```bash
# Check Redis connectivity and memory
docker exec -it $(docker compose ps -q redis-server) redis-cli -a $REDIS_PASSWORD INFO memory

# Monitor connected clients
docker exec -it $(docker compose ps -q redis-server) redis-cli -a $REDIS_PASSWORD INFO clients
```

---

## 6. Post-Deployment Verification

Execute these verification steps within 30 minutes of deployment.

### 6.1 Automated Checks

```bash
# 1. Health check
curl -sf http://localhost:8004/health | jq .status
# Expected: "ok"

# 2. Login endpoint (functional test)
curl -s -X POST http://localhost:8004/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"credential":"<test-username>","password":"<test-password>"}' \
  | jq '{status: .status, hasToken: (.data.token != null)}'
# Expected: {"status":"success","hasToken":true}

# 3. Protected endpoint (using token from step 2)
TOKEN=$(curl -s -X POST http://localhost:8004/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"credential":"<test-username>","password":"<test-password>"}' \
  | jq -r '.data.token')

curl -s http://localhost:8004/api/v1/users/me \
  -H "Authorization: Bearer $TOKEN" \
  | jq '{status: .status, hasEmail: (.data.email != null)}'
# Expected: {"status":"success","hasEmail":true}

# 4. Heartbeat
curl -s http://localhost:8004/api/v1/auth/heartbeat \
  -H "Authorization: Bearer $TOKEN" \
  | jq .status
# Expected: "success"

# 5. Logout
curl -s http://localhost:8004/api/v1/auth/logout \
  -H "Authorization: Bearer $TOKEN" \
  | jq .status
# Expected: "success"

# 6. Verify token is invalidated after logout
curl -s http://localhost:8004/api/v1/users/me \
  -H "Authorization: Bearer $TOKEN"
# Expected: 401 Unauthorized
```

### 6.2 Database Index Verification

```sql
-- Verify all 8 indexes exist
SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'iMonitorV3_1'
AND INDEX_NAME LIKE 'IDX_%'
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- Expected output: 8 distinct INDEX_NAME values across 4 tables
-- (composite indexes will have multiple rows with different SEQ_IN_INDEX)
```

### 6.3 Performance Comparison

Compare query execution plans before and after:

```sql
-- This should show "Using index" or the index name in the key column
EXPLAIN SELECT id FROM core_application_users
WHERE userName = 'admin' AND isDeleted = 0;

EXPLAIN SELECT * FROM core_privileges
WHERE UserId = '00000000-0000-0000-0000-000000000001' AND ModuleId = 1;

EXPLAIN SELECT * FROM core_application_refresh_token
WHERE jwtId = '00000000-0000-0000-0000-000000000001';

EXPLAIN SELECT * FROM core_minimum_privileges
WHERE request = '/api/v1/users' AND method = 'GET';
```

### 6.4 Docker Container Health

```bash
# Check container status and health
docker ps --filter name=imonitor-api-v4 --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
# Status should show "(healthy)" after the start-period (10s) + first health check (30s)

# Check for restart loops
docker inspect imonitor-api-v4 --format '{{.RestartCount}}'
# Expected: 0
```

---

## 7. Appendix: Environment Variable Reference

Complete list of environment variables used by the application, with Phase 3.1 annotations:

| Variable | Required | Default | Phase 3.1 Notes |
|----------|----------|---------|-----------------|
| `DB_HOST` | Yes | -- | No change |
| `DB_USER` | Yes | -- | Must have `CREATE INDEX` privilege |
| `DB_PASSWORD` | Yes | -- | No change |
| `DB_PORT` | No | `3306` | No change |
| `DB_LIMIT_USER` | Yes | -- | No change |
| `DB_LIMIT_PASSWORD` | Yes | -- | No change |
| `coreDbName` | No | `` `iMonitorV3_1` `` | No change |
| `dataDbName` | No | `` `iMonitorData` `` | No change |
| `etlDbName` | No | `` `EtlV3_2` `` | No change |
| `PORT` | No | `5011` | No change |
| `CPUS` | No | `1` | No change |
| `NODE_ENV` | No | `development` | Must be `production` for production |
| `JWT_KEY` | Yes | -- | **Verify >= 32 chars** |
| `MAIL_HOST` | Yes | -- | No change |
| `MAIL_FROM` | Yes | -- | No change |
| `MAIL_AUTH_EMAIL` | Yes | -- | No change |
| `MAIL_AUTH_PASSWROD` | Yes | -- | No change (typo preserved from v3) |
| `REDIS_HOST` | No | `localhost` | No change |
| `REDIS_PORT` | No | `6379` | No change |
| `REDIS_PASSWORD` | No | `''` | No change |
| `NB_OF_REQUESTS` | No | `200` | No change |
| `RATE_LIMIT_DURATION_SEC` | No | `60` | No change |
| `RATE_BLOCK_DURATION` | No | `180` | No change |
| `SWAGGER_ENABLED` | No | `true` | No change |
| `CORS_ORIGIN` | No | `*` (all) | **Recommended**: set to explicit origin |
| `DB_CONNECTION_LIMIT` | No | `5` | **Recommended**: set to `20` |

---

**End of Deployment Guide -- Phase 3.1 Auth & Users Module Refactoring**
