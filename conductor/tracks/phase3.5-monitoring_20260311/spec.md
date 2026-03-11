# Specification: Phase 3.5 — Monitoring (Observability, Connectivity, Notifications)

**Track ID:** phase3.5-monitoring_20260311
**Type:** Feature
**Created:** 2026-03-11
**Status:** Draft

## Summary

Migrate the Observability, Connectivity, and Notifications modules from Express.js v3 to NestJS v4, providing NOC engineers and stakeholders with system metrics monitoring, server connectivity tracking, and threshold-based notification management.

## Context

These three modules form the monitoring backbone of the iMonitor platform. Observability provides configurable metrics with 8 chart types and threshold alarms. Connectivity tracks server health across dynamic per-module tables. Notifications manages user subscriptions and multi-channel alert delivery for widget builder chart thresholds. All three modules have Socket.IO handlers and background workers that are deferred to later phases.

## User Story

As a user, I want to see different metrics about my system and nodes, check the connectivity to all my servers, and receive notifications whenever needed, so that I can monitor my telecom system.

## Acceptance Criteria

- [ ] Observability metrics CRUD — 30 endpoints (metrics, charts, dashboards, favorites, go-to-report, 8 chart generators)
- [ ] Connectivity module — 3 endpoints (list all, history by date range, Excel export)
- [ ] Notifications module — 6 endpoints (list sent with pagination, settings, view, view-all, unsubscribe, test email)
- [ ] All endpoints behind JWT + PrivilegeGuard
- [ ] Unit tests for all services
- [ ] TypeORM entities for ~12 new core tables + raw SQL for iMonitorData tables
- [ ] 8 observability chart generators (status-panel vertical/horizontal, counter-list, hexagon, trend, bar, connectivity, time-travel)
- [ ] Notification processing logic for 15+ widget builder chart types

## Dependencies

- **Existing modules:** `ReportsService` (goToReport conversion), `ExportHelperService` (Excel exports), `LegacyDataDbService` (raw SQL to iMonitorData), `CoreDataModule` (modules, privileges entities)
- **Completed tracks:** Phase 3.2 (Modules entity/tables), Phase 3.3.2 (WidgetBuilder — referenced by Notifications for chart subscriptions)

## Out of Scope

- Socket.IO handlers for Observability, Connectivity, and Notifications (deferred to Phase 4)
- Observability alarm background worker / cron job (deferred to Phase 3.9)
- Email/SMS sending for alarm notifications (deferred to Phase 3.9)
- Real-time chart generation via WebSocket
- `connectivityCheck()` periodic task (deferred to Phase 3.9)

## Technical Notes

- **Observability** queries both iMonitorV3_1 (TypeORM entities) and iMonitorData (raw SQL via `LegacyDataDbService`) for `V3_observability_metrics_stats` and `V3_observability_metrics_exploded_stats`
- **Connectivity** queries dynamic tables (`%connectivity_test`) from iMonitorData — each module has its own connectivity table with custom column names
- **Notifications** references `core_widget_builder_charts` for subscription config — needs WidgetBuilder entity relations
- 8 chart generators follow existing chart generator patterns from Reports/WidgetBuilder modules
- Observability metrics store complex config as JSON columns (tables, globalFilter, options, orderBy, control, compare, operation)
- Threshold evaluation combines time-based filters and alternative (global) filters
- Notification processing handles 15+ chart types with type-specific value extraction

### v3 Endpoint Mapping

#### Observability (`api/v1/observability`) — 30 endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/metrics` | List all metrics |
| GET | `/metrics/{id}` | Get metric by ID |
| GET | `/metrics/nodes` | List module nodes |
| POST | `/nodes/metrics` | Get metrics by node IDs |
| POST | `/metrics/nodes/fields` | Get fields by node IDs |
| POST | `/metrics` | Create metric |
| GET | `/metrics/reports/{id}` | Convert metric to report |
| PUT | `/metrics/{id}` | Update metric |
| PUT | `/favorite/{id}` | Toggle metric favorite |
| POST | `/metrics/generate/tabular` | Execute tabular query |
| POST | `/metrics/generate/single` | Execute single metric query |
| GET | `/charts/metrics/{filter}` | List metrics filtered for charts |
| POST | `/charts` | Create chart |
| GET | `/charts` | List charts |
| GET | `/charts/{id}` | Get chart by ID |
| PUT | `/charts/{id}` | Update chart |
| PUT | `/charts/favorite/{id}` | Toggle chart favorite |
| POST | `/dashboards` | Create dashboard |
| GET | `/dashboards` | List dashboards |
| GET | `/dashboards/{id}` | Get dashboard by ID |
| PUT | `/dashboards/{id}` | Update dashboard |
| PUT | `/dashboards/favorite/{id}` | Toggle dashboard favorite |
| POST | `/generate/status-panel/vertical` | Generate vertical status panel |
| POST | `/generate/status-panel/horizontal` | Generate horizontal status panel |
| POST | `/generate/counter-list` | Generate counter list chart |
| POST | `/generate/hexagon` | Generate hexagon chart |
| POST | `/generate/trend` | Generate trend chart |
| POST | `/generate/bar` | Generate vertical bar chart |
| POST | `/generate/connectivity` | Generate connectivity chart |
| POST | `/generate/time/travel` | Generate time travel chart |

#### Connectivity (`api/v1/connectivities`) — 3 endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List all connectivities |
| GET | `/{fromdate}/{todate}/{filter}` | Connectivity history |
| GET | `/export/excel/{fromdate}/{todate}/{filter}` | Export Excel |

#### Notifications (`api/v1/notification`) — 6 endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List sent notifications (paginated) |
| GET | `/test/{email}` | Test email |
| GET | `/settings` | User notification settings |
| PUT | `/view` | Mark all as viewed |
| PATCH | `/view/{id}` | Mark one as viewed |
| PATCH | `/unsubscribe/{id}` | Unsubscribe from notification |

### Database Tables

**New TypeORM entities (iMonitorV3_1):**
1. `core_observability_metrics`
2. `core_observability_metrics_module` (junction)
3. `core_observability_metrics_used_tables` (junction)
4. `core_observability_metrics_filters`
5. `core_observability_metric_thresholds`
6. `core_observability_metrics_alerts`
7. `core_observability_metrics_types`
8. `core_observability_charts`
9. `core_observability_metric_charts` (junction)
10. `core_observability_dashboard`
11. `core_observability_dashboard_charts` (junction)
12. `core_notification_settings`
13. `core_notification_sent`
14. `core_notification_users`
15. `core_connectifity_notifications` (typo preserved from v3)

**Raw SQL tables (iMonitorData — via LegacyDataDbService):**
- `V3_observability_metrics_stats`
- `V3_observability_metrics_exploded_stats`
- Dynamic `*_connectivity_test` tables (per module)

---

_Generated by Conductor. Review and edit as needed._
