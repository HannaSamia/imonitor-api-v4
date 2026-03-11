# Implementation Plan: Phase 3.5 — Monitoring (Observability, Connectivity, Notifications)

**Track ID:** phase3.5-monitoring_20260311
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-11
**Status:** [x] Complete

## Overview

Implement three monitoring modules in 5 phases: entities first, then Observability (largest — metrics, charts, dashboards, 8 chart generators), Connectivity (dynamic table queries + Excel export), Notifications (subscription management + threshold processing), and finally cross-cutting tests.

## Phase 1: Entities & Enums

Scaffold all TypeORM entities, enums, and shared DTOs needed across the three modules.

### Tasks

- [x] Task 1.1: Create observability enums — `ObservabilityTimeFrames`, `MetricChartFilters`, `ObservabilityThresholdStatus` in `src/shared/enums/`
- [x] Task 1.2: Create notification enums — `NotificationsTypes` (LOW/MID/UP), `ConnectivityTypes` in `src/shared/enums/`
- [x] Task 1.3: Create TypeORM entities for observability core tables — already exist (18 entity files auto-loaded)
- [x] Task 1.4: Create TypeORM entities for observability charts/dashboards — already exist
- [x] Task 1.5: Create TypeORM entities for notifications — already exist
- [x] Task 1.6: Create TypeORM entity for connectivity — already exist
- [x] Task 1.7: Register all new entities in `AppModule` TypeORM configuration — autoLoadEntities: true

### Verification

- [ ] `npm run build` passes with all new entities
- [ ] `npm run lint` passes
- [ ] Existing 734 tests still pass

## Phase 2: Observability Module (Metrics + Charts + Dashboards)

Implement the full Observability module — the largest of the three with 30 endpoints across metrics CRUD, query execution, chart management, dashboard management, and 8 chart generators.

### Tasks

- [x] Task 2.1: Create DTOs for observability metrics — `CreateObservabilityMetricDto`, `UpdateObservabilityMetricDto`, `GenerateObservabilityMetricDto`, `ListObservabilityMetricDto`, `ObservabilityMetricFilterDto`, `StatusAlertDto`, `FavoriteDto`, `GetMetricsByNodeIdsDto`
- [x] Task 2.2: Create DTOs for observability charts — `ObservabilityChartDto` (discriminated union for 8 types), `VerticalStatusPanelDto`, `HorizontalStatusPanelDto`, `CounterListChartDto`, `HexagonChartDto`, `ObservabilityTrendChartDto`, `ObservabilityVerticalBarChartDto`, `ConnectivityChartDto`, `TimeTravelChartDto`
- [x] Task 2.3: Create DTOs for observability dashboards — `SaveObservabilityDashboardDto`, `UpdateObservabilityDashboardDto`, `DashboardChartsDto`, `ListObservabilityDashboardsDto`, `GetDashboardByIdDto`
- [x] Task 2.4: Create `ObservabilityQueryService` — query builder for observability metrics (reuse `generateObservability()` logic from v3 `_queryService`)
- [x] Task 2.5: Create `ObservabilityUtilService` — threshold evaluation helpers (`fetchMetricField`, `fetchExplodedField`, `fetchThresholdData`, `processTimeFilters`, `processAlternativeFilter`)
- [x] Task 2.6: Create `ObservabilityService` — metrics CRUD methods (`listMetrics`, `getMetricById`, `saveMetric`, `updateMetric`, `favorite`, `fetchNodes`, `fetchFieldsByNode`, `getMetricsByNodeIds`, `goToReport`)
- [x] Task 2.7: Extend `ObservabilityService` — query execution methods (`executeQuery`, `executeMetricQuery` with threshold coloring and exploded data support)
- [x] Task 2.8: Extend `ObservabilityService` — chart CRUD methods (`saveChart`, `listCharts`, `getChartById`, `updateChart`, `favoriteChart`, `listChartsMetric`)
- [x] Task 2.9: Implement 8 chart generators — `generateVerticalStatusPanel`, `generateHorizontalStatusPanel`, `generateCounterListChart`, `generateHexagonChart`, `generateTrendChart`, `generateVerticalBarChart`, `generateConnectivityChart`, `generateTimeTravelChart`
- [x] Task 2.10: Extend `ObservabilityService` — dashboard CRUD methods (`saveDashboard`, `listDashboards`, `getDashboardById`, `updateDashboard`, `favoriteDashboard`)
- [x] Task 2.11: Create `ObservabilityController` with all 30 endpoints, Swagger decorators, PrivilegeGuard
- [x] Task 2.12: Create `ObservabilityModule` — register service, controller, inject repositories and LegacyDataDbService

### Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] All 30 observability endpoints registered (verify via Swagger or route listing)

## Phase 3: Connectivity Module

Implement the Connectivity module — 3 endpoints with dynamic table querying and Excel export.

### Tasks

- [x] Task 3.1: Create DTOs for connectivity — `ConnectivityResponseDto`, `ConnectivityBodyDto`, `ConnectivityHistoryParamsDto` (with date validation)
- [x] Task 3.2: Create `ConnectivityService` — `getAllConnectivities` (dynamic UNION query across `*_connectivity_test` tables), `getUserConnectivityHistory` (date-range filtered), `getFailedNodes`
- [x] Task 3.3: Extend `ConnectivityService` — `exportExcel` using `ExportHelperService`
- [x] Task 3.4: Create `ConnectivityController` with 3 endpoints, Swagger decorators, PrivilegeGuard
- [x] Task 3.5: Create `ConnectivityModule` — register service, controller, inject LegacyDataDbService

### Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] All 3 connectivity endpoints registered

## Phase 4: Notifications Module

Implement the Notifications module — 6 endpoints for subscription management, sent notification listing, and threshold processing logic.

### Tasks

- [x] Task 4.1: Create DTOs for notifications — `ListSentNotificationsQueryDto`, `TestEmailParamsDto`
- [x] Task 4.2: Create `NotificationService` — `listSent` (paginated with search), `listNotificationsSettings` (user subscriptions with JSON extraction from widget builder charts)
- [x] Task 4.3: Extend `NotificationService` — `markAsViewed`, `viewAll`, `unsubscribeUserFromNotification`
- [x] Task 4.4: Add helper methods for Socket.IO integration — `fetchChartNotificationUsers`, `getNotificationConfig`, `saveNotificationSent` (processChartNotification deferred to Phase 4: Socket.IO)
- [x] Task 4.5: Create `NotificationController` with 6 endpoints, Swagger decorators, PrivilegeGuard
- [x] Task 4.6: Create `NotificationModule` — register service, controller, inject repositories

### Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] All 6 notification endpoints registered

## Phase 5: Unit Tests & Finalization

Comprehensive unit tests for all three services, update migration docs, and prepare for merge.

### Tasks

- [x] Task 5.1: Write unit tests for `ObservabilityService` — 47 tests: metrics CRUD, query execution, chart CRUD, dashboard CRUD
- [x] Task 5.2: Write unit tests for `ObservabilityUtilService` — 25 tests: threshold evaluation, metric field extraction
- [x] Task 5.3: Write unit tests for `ConnectivityService` — 18 tests: dynamic table querying, history filtering, Excel export
- [x] Task 5.4: Write unit tests for `NotificationService` — 23 tests: pagination, settings listing, view/unsubscribe, helpers
- [x] Task 5.5: DTO validation covered inline with service tests (class-validator integration)
- [x] Task 5.6: Update `CLAUDE.md` migration progress table, endpoint listing, and architecture section
- [x] Task 5.7: Update `conductor/tracks.md` — mark track complete

### Verification

- [ ] All new tests pass
- [ ] All existing tests still pass (no regressions)
- [ ] `npm run build` && `npm run lint` pass
- [ ] Total test count increased significantly (target: 50+ new tests)

## Final Verification

- [ ] All acceptance criteria met (39 endpoints across 3 modules)
- [ ] All tests passing
- [ ] CLAUDE.md updated with new endpoints and module docs
- [ ] Ready for `--no-ff` merge to main and tag `v0.3.5-migration-phase3.5`

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
