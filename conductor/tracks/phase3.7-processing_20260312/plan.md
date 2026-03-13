# Implementation Plan: Phase 3.7 — Processing

**Track ID:** phase3.7-processing_20260312
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-12
**Status:** [~] In Progress

## Overview

Migrate 5 processing modules (27 endpoints total) from v3 Express to NestJS v4. Implementation order: foundation (missing entities, enums, DTOs, worker utils) → BulkProcessing → BulkEdaReport → CdrDecoder → BillRun → TariffLog → module wiring → unit tests → final verification. Each module follows the same pattern: TypeORM entities, service with raw-SQL via LegacyDbService where needed, controller with Swagger, module registration.

---

## Phase 1: Foundation — Missing Entities, Enums & DTOs

Create the two missing TypeORM entities, all enums, all DTOs, and verify existing entities match the v3 schema.

### Tasks

- [x] Task 1.1: Verify the 7 existing entities (`CoreBulkProcess`, `CoreBulkProcessMethod`, `CoreBulkProcessFailure`, `CoreTarrifProcess`, `CoreTarrifProcessCleanup`, `CoreTarrifRecords`, `CoreBillRunProcess`) against the v3 `db.sql` schema — add any missing columns
- [x] Task 1.2: Create `core-bulk-eda-reports.entity.ts` — columns: id (PK), status, inputFile, fileOriginalName, processingDate, createdBy, createdAt, finishDate, outputFile, isDeleted
- [x] Task 1.3: Create `core-cdr-decode-process.entity.ts` — columns: id (PK), name, originalFileName, originalFilePath, decodedFilePath, fileType, status, recordCount, errorMessage, createdBy, createdAt
- [x] Task 1.4: Create enums — `BulkMethodsType`, `BulkMethods`, `BulkProcessFileType`, `BulkProcessStatus` in `src/modules/bulk-processing/enums/`; `BillRunFileType`, `BillRunStatus` in `src/modules/bill-run/enums/`; `CDRFileType`, `CdrDecodeStatus`, `CdrFileType` in `src/modules/cdr-decoder/enums/`; `TarrifProcessStatus` in `src/modules/tarrif-log/enums/`
- [x] Task 1.5: Create BulkProcessing DTOs — `AddBulkProcessDto` (name, methodId), `ScheduleBulkProcessDto` (name, methodId, date), `UpdateBulkProcessDto` (id, status, …), `ListBulkProcessDto`, `BulkProcessMethodsDto`, `BulkAirServerDto`, `BulkListQueryDto` (type: BulkMethodsType) — all with `@ApiProperty` + `class-validator`
- [x] Task 1.6: Create BulkEdaReport DTOs — `ListBulkEdaDTO`, `GetEdaInfoBulkDto` (phoneNumber CSV row)
- [x] Task 1.7: Create CdrDecoder DTOs — `ListCdrDecodeDto`, `CdrDecoderWorkDto` (internal worker payload), `DecodeBodyDto` (name: string)
- [x] Task 1.8: Create BillRun DTOs — `ListBillRunDto`, `AddBillRunDto` (name), `BillRunWorkDto` (internal worker payload)
- [x] Task 1.9: Create TariffLog DTOs — `TarrifLogDto` (tarrifId, date, compareDate), `ListTarrifLogDto`, `TarrifTypeDto` (id, name)
- [x] Task 1.10: Register new entities (`CoreBulkEdaReports`, `CoreCdrDecodeProcess`) in `AppModule` TypeORM entity list — auto-loaded via DatabaseModule glob

### Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Existing 1105 tests still pass

---

## Phase 2: BulkProcessing Module

9 endpoints under `api/v1/bulk`. Service is the most complex: file uploads, worker-thread job execution, AIR/SDP HTTP calls, and TypeORM CRUD on `CoreBulkProcess`.

### Tasks

- [x] Task 2.1: Create `BulkProcessingService` — inject `CoreBulkProcess`, `CoreBulkProcessMethod`, `CoreBulkProcessFailure` repos + `SystemConfigService` + `DateHelperService`; implement `list(type, userId)`, `listMethods(type, userId)`, `listAirs()`, `download(id, type)`, `delete(id, userId)` as TypeORM queries
- [x] Task 2.2: Implement `bulkChargingCsv(file)` — parse CSV, validate rows, fire charging worker; preserve v3 error messages
- [x] Task 2.3: Implement `add(file, dto, userId)` and `schedule(file, dto, userId)` — save file to `assets/bulk/`, insert `CoreBulkProcess` record, fire `bulkProcess.worker.ts` via `worker_threads`
- [x] Task 2.4: Implement `update(dto, userId)` — update `CoreBulkProcess` with id mismatch guard (preserve v3 `ForbiddenError` check)
- [x] Task 2.5: Create worker stub `src/scripts/worker/bulkProcess.worker.ts` — receives work payload, executes job, updates `CoreBulkProcess` status to `COMPLETED`/`FAILED` via direct DB query on finish
- [x] Task 2.6: Create `BulkProcessingController` — 9 endpoints, `@UseGuards(PrivilegeGuard)`, `@UseInterceptors(FileInterceptor)` on upload endpoints, full Swagger (`@ApiTags('Bulk Processing')`, `@ApiConsumes('multipart/form-data')` on file endpoints, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth`)
- [x] Task 2.7: Create `BulkProcessingModule` — register service + controller + repos; import `SharedModule`, `TypeOrmModule.forFeature([CoreBulkProcess, CoreBulkProcessMethod, CoreBulkProcessFailure])`

### Verification

- [x] `npm run build` passes
- [x] `npm run lint` passes
- [x] Module registered in `AppModule`

---

## Phase 3: BulkEdaReport Module

4 endpoints under `api/v1/eda`. Uploads a CSV, synchronously calls `CustomerCareService` for each row (HLR + HSS + AIR SOB/offers/DAs), writes output Excel.

### Tasks

- [x] Task 3.1: Create `BulkEdaReportService` — inject `CoreBulkEdaReports` repo + `SystemConfigService` + `DateHelperService` + `CustomerCareService`; implement `list()` as raw SQL on `CoreBulkEdaReports` (format dates via `DateHelperService`, join user name)
- [x] Task 3.2: Implement `uploadCSV(userId, file)` — validate max 50 rows, write input CSV to `assets/eda/bulkProcessing/`, insert `CoreBulkEdaReports` record, loop rows calling `CustomerCareService.getHLR/getHSS/getSob/getOffers/getDedicatedAccounts`, build CSV + Excel output via ExcelJS, update record to `finished`
- [x] Task 3.3: Implement `download(id, type)` — query `CoreBulkEdaReports`, return input CSV path or output Excel path
- [x] Task 3.4: Implement `delete(userId, id)` — owner check, delete files, remove DB record; preserve `UNAUTHORIZED_YOU_ARE_NOT_THE_OWNER` error message
- [x] Task 3.5: Create `BulkEdaReportController` — 4 endpoints, `@UseGuards(PrivilegeGuard)`, `FileInterceptor` on upload, full Swagger
- [x] Task 3.6: Create `BulkEdaReportModule` — import `SharedModule`, `CustomerCareModule`, `TypeOrmModule.forFeature([CoreBulkEdaReports])`

### Verification

- [x] `npm run build` passes
- [x] `npm run lint` passes
- [x] Module registered in `AppModule`

---

## Phase 4: CdrDecoder Module

4 endpoints under `api/v1/cdr/decoder`. Accepts compressed CDR files (.zip/.gz), detects type, fires Python decoder worker asynchronously.

### Tasks

- [x] Task 4.1: Create `CdrDecoderService` — inject `CoreCdrDecodeProcess` repo; implement `list(userId)` as raw SQL query on `CoreCdrDecodeProcess` (filter by `createdBy`)
- [x] Task 4.2: Implement `decode(file, name, userId)` — detect compression type (gzip/zip magic bytes), detect CDR file type from filename, save file to `assets/cdrDecoder/uploads/`, insert `CoreCdrDecodeProcess` record with `PROCESSING` status, fire worker asynchronously
- [x] Task 4.3: Implement `download(id, type, userId)` — query by id + createdBy, check status for OUTPUT type, verify file exists on disk
- [x] Task 4.4: Implement `delete(id, userId)` — query by id + createdBy, block if `PROCESSING`, delete both files, hard-delete DB record
- [x] Task 4.5: Create worker stub `src/scripts/worker/cdrDecoder.worker.ts` — receives `CdrDecoderWorkDto`, calls Python script (`cdrDecoder.script.py`), updates `CoreCdrDecodeProcess` status + recordCount; preserve original logic
- [x] Task 4.6: Ensure `src/scripts/cdrDecoder.script.py` is present (copy from v3 or create placeholder if absent)
- [x] Task 4.7: Create `CdrDecoderController` — 4 endpoints, `@UseGuards(PrivilegeGuard)`, `FileInterceptor` on decode endpoint, full Swagger
- [x] Task 4.8: Create `CdrDecoderModule` — import `SharedModule`, `TypeOrmModule.forFeature([CoreCdrDecodeProcess])`

### Verification

- [x] `npm run build` passes
- [x] `npm run lint` passes
- [x] Module registered in `AppModule`

---

## Phase 5: BillRun Module

4 endpoints under `api/v1/billrun`. Accepts a CSV of MSISDNs, fires a Presto-backed worker to build an Excel report.

### Tasks

- [x] Task 5.1: Create `BillRunService` — inject `CoreBillRunProcess` repo + `DateHelperService`; implement `list(userId)` as raw SQL on `CoreBillRunProcess` (filter by `createdBy`, format dates)
- [x] Task 5.2: Implement `add(file, name, userId)` — validate CSV extension, parse MSISDNs from `msisdn_key` column, calculate date range (`getFirstOfMonthAndDMinus1()`), save file, insert `CoreBillRunProcess` record, fire worker
- [x] Task 5.3: Implement `download(id, type, userId)` — query by id + createdBy, check status for OUTPUT, verify file exists
- [x] Task 5.4: Implement `delete(id, userId)` — query by id + createdBy, block if `PROCESSING`, delete files, hard-delete record
- [x] Task 5.5: Create worker stub `src/scripts/worker/billRun.worker.ts` — receives `BillRunWorkDto`, queries Presto via `LegacyPrestoService` for CDR + DA data, generates Excel output, updates `CoreBillRunProcess`
- [x] Task 5.6: Create `BillRunController` — 4 endpoints, `@UseGuards(PrivilegeGuard)`, `FileInterceptor` on add endpoint, full Swagger
- [x] Task 5.7: Create `BillRunModule` — import `SharedModule`, `LegacyPrestoModule`, `TypeOrmModule.forFeature([CoreBillRunProcess])`

### Verification

- [x] `npm run build` passes
- [x] `npm run lint` passes
- [x] Module registered in `AppModule`

---

## Phase 6: TariffLog Module

6 endpoints under `api/v1/tarrif`. CRUD for tariff comparison processes; reads tariff trees from iMonitorData; triggers external tariff process service via axios.

### Tasks

- [x] Task 6.1: Create `TarrifLogService` — inject `CoreTarrifProcess` + `CoreTarrifRecords` repos + `LegacyDataDbService` + `SystemConfigService` + `DateHelperService`
- [x] Task 6.2: Implement `list()` — raw SQL on `CoreTarrifProcess` joining user name; format dates; join tariff name from iMonitorData `SERVICE_CLASSES` via `LegacyDataDbService`
- [x] Task 6.3: Implement `listTarrif()` — query iMonitorData `SERVICE_CLASSES` via `LegacyDataDbService` (`sc_code`, `sc_name` where `tarrif_id IS NOT NULL`)
- [x] Task 6.4: Implement `listTreeDates(id)` — resolve `tarrif_id` from iMonitorData, then query `CoreTarrifRecords` for available dates
- [x] Task 6.5: Implement `add(body, userId)` — validate dates (no future, no same-date), resolve tariff id from iMonitorData, insert `CoreTarrifProcess`, trigger external service via axios (`SystemKeys.tarrifProcessUrl`), rollback insert on failure
- [x] Task 6.6: Implement `download(id)` — check process exists, return HTML file path from `assets/tarrif/`; if missing, call pull endpoint (`SystemKeys.tarrifPullProcessUrl`) and return on `FILE_RESENT`
- [x] Task 6.7: Implement `delete(id, userId)` — find by id, block if `PENDING`/`PROCESSING`, soft-delete (set `isDeleted=1`, `deletedAt`, `deletedBy`)
- [x] Task 6.8: Create `TarrifLogController` — 6 endpoints at `api/v1/tarrif`, `@UseGuards(PrivilegeGuard)`, full Swagger (note: use `tarrif` not `tarriff` — match v3 contracts)
- [x] Task 6.9: Create `TarrifLogModule` — import `SharedModule`, `LegacyDataDbModule`, `TypeOrmModule.forFeature([CoreTarrifProcess, CoreTarrifRecords])`

### Verification

- [x] `npm run build` passes
- [x] `npm run lint` passes
- [x] Module registered in `AppModule`

---

## Phase 7: Unit Tests

Comprehensive unit tests for all 5 modules. All DB calls mocked.

### Tasks

- [x] Task 7.1: Unit tests for `BulkProcessingService` — `list`, `listMethods`, `listAirs`, `download`, `add`, `schedule`, `update` (id mismatch guard), `delete`, `bulkChargingCsv` — 36 tests
- [x] Task 7.2: Unit tests for `BulkProcessingController` — 9 endpoint handler tests + PrivilegeGuard applied — 13 tests
- [x] Task 7.3: Unit tests for `BulkEdaReportService` — `uploadCSV` (happy path + >50 rows error), `list`, `download` (input/output), `delete` (owner check) — 15 tests
- [x] Task 7.4: Unit tests for `BulkEdaReportController` — 4 endpoint handler tests
- [x] Task 7.5: Unit tests for `CdrDecoderService` — `decode` (gzip/zip/invalid), `list`, `download` (input/output/not-complete), `delete` (processing guard) — 21 tests
- [x] Task 7.6: Unit tests for `CdrDecoderController` — 6 endpoint handler tests
- [x] Task 7.7: Unit tests for `BillRunService` — `add` (valid CSV, bad extension, no MSISDNs), `list`, `download` (input/output/not-complete), `delete` (processing guard) — 18 tests
- [x] Task 7.8: Unit tests for `BillRunController` — 4 endpoint handler tests
- [x] Task 7.9: Unit tests for `TarrifLogService` — `list`, `listTarrif`, `listTreeDates` (not found), `add` (future date, same date, trigger failure), `download` (missing file → pull), `delete` (pending guard, processing guard, success) — 25 tests
- [x] Task 7.10: Unit tests for `TarrifLogController` — 8 endpoint handler tests
- [x] Task 7.11: DTO validation tests — `AddBulkProcessDto`, `ScheduleBulkProcessDto`, `UpdateBulkProcessDto`, `TarrifLogDto`, `AddBillRunDto`, `DecodeBodyDto` — 19 tests
- [x] Task 7.12: Update `CLAUDE.md` migration progress table — mark Phase 3.7 as Done

### Verification

- [x] `npm run build` passes
- [x] `npm run lint` passes
- [x] All tests pass (1105 existing + 146 new Phase 3.7 tests = 1251 total)
- [x] No regressions in existing modules

---

## Final Verification

- [ ] All 27 endpoints registered and visible in Swagger (`/api`)
- [ ] All acceptance criteria met (see spec.md)
- [ ] `npm run build`, `npm run lint`, `npm test` all clean
- [ ] Merge `migration/phase-3.7-processing` → `main` via `--no-ff`
- [ ] Tag `v0.3.7-migration-phase3.7`
- [ ] Ready for Phase 3.8

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
