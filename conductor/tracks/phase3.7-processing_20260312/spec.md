# Specification: Phase 3.7 — Processing

**Track ID:** phase3.7-processing_20260312
**Type:** Feature
**Created:** 2026-03-12
**Status:** Draft

## Summary

Migrate the five Processing modules from Express.js v3 to NestJS v4: BulkProcessing (bulk job management with worker-thread execution), BulkEdaReport (EDA CSV batch lookup), CdrDecoder (CDR file decoding via Python worker), BillRun (Presto-backed CDR bill run), and TariffLog (tariff comparison via external service). Together these add 27 endpoints to the v4 API.

## Context

Phase 3.6 completed Customer Care (31 endpoints). Phase 3.7 migrates the processing pipeline modules — all of which involve file uploads, asynchronous worker-thread execution, and file-based result downloads. Workers fire-and-forget from within the request cycle; their internal logic (BilRun Presto queries, CDR Python decoding) lives in separate worker scripts. Full worker script implementation is Phase 3.9; Phase 3.7 ships functional API + worker stubs that update process status correctly.

## User Story

As a NOC engineer, I want processing operations — bulk jobs, CDR decoding, bill runs, and tariff logs — available in the v4 API so that the migration achieves full functional parity with v3.

## Acceptance Criteria

- [ ] All 27 endpoints implemented with full route parity vs v3 (paths, methods, params)
- [ ] All endpoints protected with JWT + PrivilegeGuard; full Swagger decorators on all controllers
- [ ] BulkProcessing, BulkEdaReport, CdrDecoder, TariffLog process tables accessed via TypeORM; BillRun process table via TypeORM; iMonitorData queries (TariffLog `SERVICE_CLASSES`) via `LegacyDataDbService`
- [ ] BillRun worker stub fires via `worker_threads` and calls `LegacyPrestoService` structure; CdrDecoder worker stub fires via `worker_threads`; BulkProcessing worker stub fires
- [ ] Unit tests for all services (mocked TypeORM repos + LegacyDbService), all passing with no regressions against the existing 1105 tests
- [ ] `npm run build` and `npm run lint` pass clean; branch merged to `main` and tagged `v0.3.7-migration-phase3.7`

## Dependencies

None — all required infrastructure (SharedModule, LegacyDataDbModule, LegacyPrestoModule, CustomerCareModule) is already in place from prior phases.

## Out of Scope

- Socket.IO gateways for processing events (Phase 4)
- Automated/scheduled job triggers — `scheduledbulkProcess.worker.ts` (Phase 3.8/3.9)
- E2E tests against live DB (Phase 5)
- Any changes to existing modules

## Technical Notes

### Route Paths (from v3 contracts — preserve exactly)

| Module | Base Path | Endpoints |
|--------|-----------|-----------|
| BulkProcessing | `api/v1/bulk` | 9 |
| BulkEdaReport | `api/v1/eda` | 4 |
| CdrDecoder | `api/v1/cdr/decoder` | 4 |
| BillRun | `api/v1/billrun` | 4 |
| TariffLog | `api/v1/tarrif` | 6 |

> **Note:** TariffLog controller in v3 has `@Route('/tarriff')` (double-f) but the contracts + routes mount it at `/tarrif` (single-f). Use `api/v1/tarrif` in v4.
> **Note:** CdrDecoder controller has `@Route('/cdr-decoder')` but contracts mount it at `api/v1/cdr/decoder`. Use `api/v1/cdr/decoder` in v4.

### Endpoint Inventory

#### BulkProcessing (`api/v1/bulk`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/balance` | JWT + Privilege | Multipart CSV; bulk charging upload |
| POST | `/` | JWT + Privilege | Multipart; add process (file + name + methodId) |
| POST | `/schedule` | JWT + Privilege | Multipart; schedule process (file + name + methodId + date) |
| GET | `/` | JWT + Privilege | List processes (query: `type: BulkMethodsType`) |
| GET | `/methods` | JWT + Privilege | List methods (query: `type: BulkMethodsType`) |
| GET | `/airs` | JWT + Privilege | List AIR servers |
| GET | `/:id/download/:type` | JWT + Privilege | Download input/output file |
| PUT | `/:id` | JWT + Privilege | Update process |
| DELETE | `/:id` | JWT + Privilege | Delete process |

> Skip v3 `/test` and `/test2` dev-only endpoints — not in contracts.

#### BulkEdaReport (`api/v1/eda`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/upload` | JWT + Privilege | Multipart CSV; max 50 rows; calls CustomerCareService for HLR/HSS/AIR lookup per row; produces Excel output |
| GET | `/` | JWT + Privilege | List all EDA reports |
| GET | `/:id/download/:type` | JWT + Privilege | Download input CSV or output Excel |
| DELETE | `/:id` | JWT + Privilege | Delete (owner check) + file cleanup |

#### CdrDecoder (`api/v1/cdr/decoder`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/` | JWT + Privilege | Multipart compressed file (.zip/.gz); detect CDR type; fire worker |
| GET | `/` | JWT + Privilege | List user's decode processes |
| GET | `/:id/download/:type` | JWT + Privilege | Download original or decoded file |
| DELETE | `/:id` | JWT + Privilege | Delete (blocks if PROCESSING) + file cleanup |

#### BillRun (`api/v1/billrun`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/` | JWT + Privilege | Multipart CSV of MSISDNs; fire Presto worker |
| GET | `/` | JWT + Privilege | List user's bill runs |
| GET | `/:id/download/:type` | JWT + Privilege | Download input or output Excel |
| DELETE | `/:id` | JWT + Privilege | Delete (blocks if PROCESSING) + file cleanup |

#### TariffLog (`api/v1/tarrif`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/` | JWT + Privilege | Add tariff comparison (body: tarrifId, date, compareDate); triggers external service |
| GET | `/` | JWT + Privilege | List all tariff processes |
| GET | `/trees` | JWT + Privilege | List tariff types from iMonitorData `SERVICE_CLASSES` |
| GET | `/:id/dates` | JWT + Privilege | List available dates for a tariff tree |
| GET | `/:id/download` | JWT + Privilege | Download HTML report (triggers pull if missing) |
| DELETE | `/:id` | JWT + Privilege | Soft delete (blocks if PENDING/PROCESSING) |

### Entity Inventory

**Already exist in v4** (verify column alignment with v3 schema):
- `core-bulk-process.entity.ts`
- `core-bulk-process-method.entity.ts`
- `core-bulk-process-failure.entity.ts`
- `core-tarrif-process.entity.ts`
- `core-tarrif-process-cleanup.entity.ts`
- `core-tarrif-records.entity.ts`
- `core-bill-run-process.entity.ts`

**Must create**:
- `core-bulk-eda-reports.entity.ts` — columns: id, status, inputFile, createdBy, createdAt, fileOriginalName, processingDate, isDeleted, finishDate, outputFile
- `core-cdr-decode-process.entity.ts` — columns: id, name, originalFileName, originalFilePath, decodedFilePath, fileType, status, recordCount, errorMessage, createdBy, createdAt

### DB Access Patterns

| Module | iMonitorV3_1 (TypeORM) | iMonitorData (LegacyDataDbService) | External |
|--------|----------------------|----------------------------------|---------|
| BulkProcessing | `CoreBulkProcess`, `CoreBulkProcessMethod`, `CoreBulkProcessFailure` | — | AIR/SDP HTTP via `SystemConfigService` |
| BulkEdaReport | `CoreBulkEdaReports` | — | CustomerCareService (HLR/HSS/AIR) |
| CdrDecoder | `CoreCdrDecodeProcess` | — | worker_threads (Python script) |
| BillRun | `CoreBillRunProcess` | — | worker_threads → `LegacyPrestoService` |
| TariffLog | `CoreTarrifProcess`, `CoreTarrifRecords` | `SERVICE_CLASSES` (sc_code, sc_name, tarrif_id) | axios to `tarrifProcessUrl` + `tarrifPullProcessUrl` |

### Worker Thread Strategy

Workers fire-and-forget within the request handler (same pattern as v3 `runWorker()`). In v4:
- Copy/adapt `src/scripts/worker/` directory for `bulkProcess.worker.ts`, `cdrDecoder.worker.ts`, `billRun.worker.ts`
- Workers update the process record status (`COMPLETED`/`FAILED`) on finish
- Python script dependency (`cdrDecoder.script.py`) must be present in assets

### Constants to Preserve

Preserve all v3 `ErrorMessages` constants verbatim (including typos) from:
- `bulkProcessMessages`, `bulkEdaReportSuccessMessages`, `bulkEdaReportErrorMessages`
- `CdrDecodeErrorMessages`, `BillRunErrorMessages`, `tarrifLogsMessages`

---

_Generated by Conductor. Review and edit as needed._
