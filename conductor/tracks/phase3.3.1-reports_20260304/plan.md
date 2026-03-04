# Implementation Plan: Phase 3.3.1 — Reports Module

**Track ID:** phase3.3.1-reports_20260304
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-04
**Status:** [~] In Progress

## Overview

Migrate the Reports module in 5 phases: foundation (repos, DTOs, enums), CRUD endpoints, chart generation, export endpoints, and unit tests. Branch: `migration/phase-3.3.1-reports`.

## Phase 1: Foundation — Entities, Repos, DTOs, Enums, Module Scaffold

Register report entities in TypeORM, create the ReportsModule scaffold, define all DTOs, and port chart enums/constants.

### Tasks

- [x] Task 1.1: Register report entities (CoreReport, CoreReportCharts, CoreReportModule, CoreReportUsedTable, CoreSharedReport) in a new `ReportsModule` via `TypeOrmModule.forFeature()`
- [x] Task 1.2: Create chart enums — `ChartType`, `ChartStatus`, `ChartUseType` in `src/modules/reports/enums/`
- [x] Task 1.3: Create chart constants — default colors, chart config defaults in `src/modules/reports/constants/`
- [x] Task 1.4: Create request DTOs with class-validator: `SaveReportDto`, `EditReportDto`, `RenameReportDto`, `ChangeReportOwnerDto`, `ShareReportDto`, `GenerateReportDto`, `GenerateChartByTypeDto`, `ExportReportParamsDto`, `ExportTabParamsDto`
- [x] Task 1.5: Create response DTOs: `ReportDto`, `ListReportDto`, `ExecuteQueryResultDto`, `SideTablesDto`, `PrivilegedTableDto`
- [x] Task 1.6: Scaffold `ReportsModule`, `ReportsController`, `ReportsService` with empty methods

### Verification

- [x] `npm run build` passes
- [x] `npm run lint` passes (0 errors, warnings only for stub params)
- [x] Module registers in AppModule without errors

## Phase 2: Report CRUD & Sharing Endpoints

Implement the 12 CRUD + sharing endpoints with full privilege checks.

### Tasks

- [x] Task 2.1: Implement `privilegedStatisticTables()` — fetch tables user has access to via CoreModulesTables/CoreTablesField/CorePrivileges joins
- [x] Task 2.2: Implement `list()` — get user's reports + shared reports, filtered by privilege
- [x] Task 2.3: Implement `getReportById()` — load report with charts, modules, usedTables relations; validate access
- [x] Task 2.4: Implement `getSharedReportById()` — load shared report entry + full report
- [x] Task 2.5: Implement `save()` — create report + charts + modules + usedTables in transaction
- [x] Task 2.6: Implement `update()` — update report + sync charts (create/update/delete by ChartStatus) in transaction
- [x] Task 2.7: Implement `rename()`, `favorite()`, `changeReportOwner()` — simple update operations with ownership validation
- [x] Task 2.8: Implement `deleteReport()` — ownership + module admin check, cascade delete
- [x] Task 2.9: Implement `share()` — insert CoreSharedReport rows for each userId
- [x] Task 2.10: Implement `saveSharedReport()` — duplicate shared report as user's own (new UUID, copy charts/modules/usedTables)
- [x] Task 2.11: Implement `closeTab()` — delete chart by reportId + chartId
- [x] Task 2.12: Wire all CRUD endpoints in controller with Swagger decorators, guards (`@UseGuards(PrivilegeGuard)`), and `@CurrentUser()`

### Verification

- [x] `npm run build` passes
- [x] All 12 CRUD endpoints visible in Swagger (controller wired from Phase 1)
- [x] TypeORM queries match v3 SQL logic

## Phase 3: Query Builder & Chart Generation

Implement the QueryBuilderService (dynamic SQL generation) and 9 chart generation endpoints.

### Tasks

- [x] Task 3.1: Create `QueryBuilderService` — translate report config (tables, filters, timeFilter, orderBy, limit, operation, compare) into parameterized SQL queries against iMonitorData
- [x] Task 3.2: Implement `executeQuery()` (tabular endpoint) — use QueryBuilderService + LegacyDataDbService to run query, return headers + body
- [x] Task 3.3: Implement `generatedQuery()` — return the SQL string without executing
- [x] Task 3.4: Port chart generation functions — `generatePie`, `generateDoughnut`, `generateTrend`, `generateVerticalBar`, `generateHorizontalBar`, `generateProgress`, `generateExplodedProgress` into `src/modules/reports/charts/` as injectable services or pure functions
- [x] Task 3.5: Implement chart endpoints (pie, doughnut, trend, verticalBar, horizontalBar, progress, explodedProgress) — each calls buildChartGenerateResult + chart generator
- [x] Task 3.6: Implement `generateChartByType()` — dynamic chart generation dispatching to the correct generator by ChartType enum
- [x] Task 3.7: Wire all chart endpoints in controller with Swagger decorators + GenerateChartDto

### Verification

- [x] `npm run build` passes
- [x] All 10 chart/query endpoints visible in Swagger
- [x] QueryBuilderService generates SQL matching v3 patterns (// SDQ: requires manual verification)

## Phase 4: Export Endpoints

Implement the 11 export endpoints (7 full-report + 4 per-tab).

### Tasks

- [x] Task 4.1: Extend `ExportHelperService` or create `ReportExportService` with methods: `exportCSV`, `exportJSON`, `exportHTML`, `exportPDF`, `exportPNG`, `exportJPEG`
- [x] Task 4.2: Port HTML template rendering — report HTML generation with embedded chart data (from v3 `exportHtmlFunctions`)
- [x] Task 4.3: Implement puppeteer-based conversion service — HTML → PDF, HTML → PNG, HTML → JPEG
- [x] Task 4.4: Implement full-report export endpoints: CSV, JSON, HTML, PDF, PNG, JPEG, Excel
- [x] Task 4.5: Implement per-tab export endpoints: HTML, PDF, PNG, JPEG (single chart/tab)
- [x] Task 4.6: Wire all 11 export endpoints in controller with Swagger decorators and route params (`:reportId/:status/:fromdate/:todate/:interval`)

### Verification

- [x] `npm run build` passes
- [x] All 11 export endpoints visible in Swagger
- [ ] Export file generation works (// SDQ: requires manual verification with live data)

## Phase 5: Unit Tests & Cleanup

Comprehensive unit tests for the Reports module.

### Tasks

- [ ] Task 5.1: Unit tests for `ReportsService` — CRUD methods (mocked repos, mocked LegacyDataDbService)
- [ ] Task 5.2: Unit tests for `QueryBuilderService` — SQL generation from various report configs
- [ ] Task 5.3: Unit tests for chart generation functions — input/output validation
- [ ] Task 5.4: Unit tests for DTOs — class-validator validation with `plainToInstance()` + `validate()`
- [ ] Task 5.5: Unit tests for `ReportExportService` — mocked file I/O and puppeteer
- [ ] Task 5.6: Verify `npm run build`, `npm run lint`, `npm test` all pass with zero failures
- [ ] Task 5.7: Update CLAUDE.md migration progress table (Phase 3.3.1 → Done)

### Verification

- [ ] `npm test` passes with all new tests
- [ ] `npm run test:cov` shows adequate coverage for reports module
- [ ] No regressions in existing 316 tests

## Final Verification

- [ ] All 32 report endpoints functional and documented in Swagger
- [ ] All acceptance criteria from spec.md met
- [ ] Tests passing (`npm test`)
- [ ] Build clean (`npm run build && npm run lint`)
- [ ] Ready for merge to main and tag `v0.3.3.1-migration-phase3.3.1`

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
