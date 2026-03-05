# Implementation Plan: Phase 3.3.2 — WidgetBuilder, QBE & Remaining Reporting

**Track ID:** phase3.3.2-reporting_20260304
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-04
**Status:** [~] In Progress

## Overview

Migrate WidgetBuilder (32 endpoints, 15 chart types) and QBE (14 endpoints, 7 chart types) modules from v3 to NestJS. Extract dedicated query-building services for each: `WidgetBuilderQueryService` (ported from `generateWIdgetBuilder()` with its own `widgetBuilderTableUpdate()` and `IntervalAdjustment()`) and `QbeQueryService` (raw SQL validation + execution). Reuse chart generators and shared helpers from Phase 3.3.1.

## Phase 1: WidgetBuilder Module — CRUD & Foundation

Set up the WidgetBuilder NestJS module with DTOs, controller CRUD endpoints, and service layer for all non-chart-generation operations.

### Tasks

- [x] Task 1.1: Create `WidgetBuilderModule` scaffold — module, controller, service files under `src/modules/widget-builder/`
- [x] Task 1.2: Register widget-builder entities in a `WidgetBuilderDataModule` (or extend `CoreDataModule`) — repos for `CoreWidgetBuilder`, `CoreWidgetBuilderCharts`, `CoreWidgetBuilderModule`, `CoreWidgetBuilderUsedTables`
- [x] Task 1.3: Create DTOs — `SaveWidgetBuilderDto`, `EditWidgetBuilderDto`, `ListWidgetBuildersDto`, `GenerateWidgetBuilderDto`, `GenerateChartByTypeDto`, `WidgetBuilderResponseDto` with class-validator + @ApiProperty decorators. Match v3 field names.
- [x] Task 1.4: Implement `WidgetBuilderService` CRUD methods — `save()`, `list()`, `getById()`, `update()`, `delete()` using TypeORM repos
- [x] Task 1.5: Implement sharing methods — `share()`, `getSharedById()`, `saveSharedWidgetBuilder()`
- [x] Task 1.6: Implement management methods — `favorite()`, `rename()`, `transferOwnership()`, `checkAccess()`, `closeTab()`
- [x] Task 1.7: Implement `privilegedStatisticTables()` — return tables the user has access to (uses modules/privileges)
- [x] Task 1.8: Wire controller CRUD endpoints (14 non-generate endpoints) with Swagger decorators, guards (`@UseGuards(PrivilegeGuard)`), and DTOs
- [x] Task 1.9: Unit tests for WidgetBuilderService CRUD methods and DTOs

### Verification

- [x] All 14 CRUD/management endpoints registered in Swagger
- [x] `npm run build && npm run lint && npm test` pass

## Phase 2: WidgetBuilder Query Service & Chart Generation

Port `generateWIdgetBuilder()` into a dedicated `WidgetBuilderQueryService` and wire up all 18 chart generation endpoints (tabular + 15 chart types + table + cumulative).

### Tasks

- [x] Task 2.1: Create `WidgetBuilderQueryService` under `src/modules/widget-builder/services/` — port `generateWIdgetBuilder()` from v3 `queryBuilder.service.ts` (lines 2700-3100)
- [x] Task 2.2: Port `widgetBuilderTableUpdate()` method — different from Reports' `TableUpdate()`, checks statInterval compatibility across tables
- [x] Task 2.3: Port `IntervalAdjustment()` helper — returns adjusted fromDate based on table statInterval and startTime (no time filter dimension switching like Reports)
- [x] Task 2.4: Port `ProcessWidgetBuilderFieldsByType()` — field processing for widget-specific logic
- [x] Task 2.5: Add new chart generator functions for WidgetBuilder-only chart types not in Reports: `counter`, `exploded-counter`, `percentage`, `exploded-percentage`, `compare-trend`, `solo-bar`, `top-bar`, `table`, `top-least-table`, `cumulative-table` — under `src/modules/widget-builder/charts/`
- [x] Task 2.6: Wire `WidgetBuilderService.executeQuery()` to use `WidgetBuilderQueryService.generateWidgetBuilderQuery()` + `LegacyDataDbService` for execution
- [x] Task 2.7: Implement `generateChartByType()` dispatcher — routes to correct chart generator based on chart type enum
- [x] Task 2.8: Wire controller chart generation endpoints (18 POST `/generate/*` endpoints) with Swagger decorators and DTOs
- [x] Task 2.9: Unit tests for `WidgetBuilderQueryService`, chart generators, and controller generate endpoints

### Verification

- [x] All 32 WidgetBuilder endpoints registered and responding
- [x] `npm run build && npm run lint && npm test` pass

## Phase 3: QBE Module — Full Implementation

Implement the QBE module with its dedicated `QbeQueryService` for raw SQL validation and execution, plus CRUD and chart generation.

### Tasks

- [x] Task 3.1: Create `QbeModule` scaffold — module, controller, service files under `src/modules/qbe/`
- [x] Task 3.2: Create DTOs — `SaveQbeDto`, `UpdateQbeDto`, `ProcessQbeDto`, `QbeRunDto`, `QbeDto`, `QbeAutoCompleteTablesDto` with class-validator + @ApiProperty decorators
- [x] Task 3.3: Create `QbeQueryService` under `src/modules/qbe/services/` — raw SQL validation (SELECT only, block INSERT/UPDATE/DELETE/DROP/ALTER), date placeholder replacement (`_fromDate_`, `_toDate_`), table privilege verification via `modifyQuery()`
- [x] Task 3.4: Implement `QbeService` CRUD — `save()`, `update()`, `getById()`, `getSharedById()`, `saveSharedQbe()`. QBE stores in `core_report` table with `isQbe = true` flag + `core_shared_qbe_report` for sharing
- [x] Task 3.5: Implement `QbeService.generateQbe()` — calls `QbeQueryService.validateAndExecute()`, returns `QbeRunDto` with header, fields, body, processedQuery
- [x] Task 3.6: Implement `QbeService.privilegedStatisticTables()` — return available tables for QBE autocomplete
- [ ] Task 3.7: Wire QBE chart generation — reuse chart generators from Reports (pie, doughnut, trend, vertical bar, horizontal bar, progress, exploded progress) with QBE data
- [ ] Task 3.8: Wire controller — all 14 endpoints with Swagger decorators, guards, DTOs
- [ ] Task 3.9: Unit tests for `QbeQueryService` (SQL validation edge cases), `QbeService`, controller, and DTOs

### Verification

- [ ] All 14 QBE endpoints registered and responding
- [ ] QBE SQL validation rejects DML/DDL statements
- [ ] `npm run build && npm run lint && npm test` pass

## Phase 4: Integration, Cross-Module Verification & Finalization

Verify both modules work together, ensure no regressions in Reports, and finalize.

### Tasks

- [ ] Task 4.1: Verify WidgetBuilder and QBE modules load correctly alongside Reports in `AppModule`
- [ ] Task 4.2: Verify shared chart helpers work correctly when called from all three modules (Reports, WidgetBuilder, QBE)
- [ ] Task 4.3: Verify privilege/access guards work consistently across all three modules
- [ ] Task 4.4: Run full test suite — confirm no regressions in existing 421+ tests
- [ ] Task 4.5: Update CLAUDE.md — add WidgetBuilder and QBE endpoints to the endpoint inventory, update architecture section
- [ ] Task 4.6: Final `npm run build && npm run lint && npm test` — all green

### Verification

- [ ] 46 total endpoints added (32 WidgetBuilder + 14 QBE)
- [ ] All existing tests still pass (no regressions)
- [ ] CLAUDE.md updated with new endpoints
- [ ] Ready for merge to main

## Final Verification

- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] 32 WidgetBuilder endpoints match v3 request/response contracts
- [ ] 14 QBE endpoints match v3 request/response contracts
- [ ] `WidgetBuilderQueryService` extracted as dedicated service
- [ ] `QbeQueryService` extracted as dedicated service
- [ ] Ready for review

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
