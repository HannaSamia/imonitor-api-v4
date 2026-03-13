# Implementation Plan: Phase 4 — Socket.IO Gateways

**Track ID:** phase4-socketio_20260313
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-13
**Status:** [x] Complete

## Overview

Create `src/gateways/` with a `GatewaysModule` containing 6 NestJS WebSocket
gateways, a `WsJwtGuard`, and a shared `RedisSocketStateService` for cross-cluster
socket state. Wire the Redis adapter and Bottleneck limiter. Register the module
in `AppModule`. Write unit tests for every gateway and the guard.

## Phase 1: Foundation — Module scaffold & WsJwtGuard

Create the `GatewaysModule` skeleton, shared socket-state service, and the
JWT guard for WebSocket handshakes. No gateway logic yet.

### Tasks

- [x] Task 1.1: Confirm `@socket.io/redis-adapter`, `@socket.io/sticky`, and
      `bottleneck` are in `package.json`; install if missing
- [x] Task 1.2: Create `src/gateways/gateways.module.ts` — imports RedisModule,
      declares all 6 gateways; exports `NotificationsGateway`,
      `ConnectivityGateway`, `ObservabilityAlertsGateway` for use by feature modules
- [x] Task 1.3: Create `src/gateways/ws-jwt.guard.ts` — reads
      `socket.handshake.auth.token`, verifies with `JwtService`, attaches
      decoded payload to `socket.data.user`; throws `WsException('Unauthorized')`
      on failure
- [x] Task 1.4: Write unit tests for `WsJwtGuard`
      (`src/gateways/ws-jwt.guard.spec.ts`)
- [x] Task 1.5: Create `src/gateways/redis-socket-state.service.ts` — injectable
      service wrapping ioredis for `scanStream`, `lrange`/`rpush`/`del`/`set`/`get`
      used by all gateways; `fetchSockets(namespace, room)` with up to 10 retries
- [x] Task 1.6: Write unit tests for `RedisSocketStateService`

### Verification

- [x] `npm run build` passes with no new errors
- [x] `npm test` — new spec files pass

## Phase 2: Dashboard & Observability Gateways

Implement the two chart-running gateways that accept `run_chart` from clients.

### Tasks

- [x] Task 2.1: Create `src/gateways/dashboard/dashboard.gateway.ts`
  - `@WebSocketGateway({ namespace: '/dashboard', transports: ['websocket'] })`
  - On `connection`: join room, call `getClientsFromStorage()` (also inserts to
    `V3_opened_dashboards_stats` via `LegacyDataDbService`)
  - On `run_chart`: deduplicate in Redis, call `WidgetBuilderService.generateChartByType()`,
    emit `{widgetBuilderId}_{chartId}`; on error save to `core_dashboard_error`
    and emit error object
  - On `disconnect`: remove Redis key
  - Expose `getClientsFromStorage()` (public, used by EtlGateway)
  - Apply `WsJwtGuard` via `@UseGuards`
- [x] Task 2.2: Write unit tests for `DashboardGateway`
- [x] Task 2.3: Create `src/gateways/observability/observability-dashboard.gateway.ts`
  - `@WebSocketGateway({ namespace: '/observability_dashboards', transports: ['websocket'] })`
  - On `run_chart`: deduplicate in Redis, call
    `ObservabilityService.generateChartByTypeForDashboard()`, emit `{chartId}`;
    on error save to `core_observability_dashboard_error`
  - Apply `WsJwtGuard`
- [x] Task 2.4: Write unit tests for `ObservabilityDashboardGateway`

### Verification

- [x] `npm run build` passes
- [x] `npm test` — all new specs pass

## Phase 3: Notification & Alert Push Gateways

Implement the three server-push gateways (Notifications, ConnectivityGateway,
ObservabilityAlerts) that maintain a socketId→userId Redis map and expose
`sendAlert` / `broadcastConnectivity` methods for feature services to call.

### Tasks

- [x] Task 3.1: Create `src/gateways/notifications/notifications.gateway.ts`
  - `@WebSocketGateway({ namespace: '/notifications', transports: ['websocket'] })`
  - On `connection`: join room, store `socketId → userId` in Redis
    (`notifications:{socketId}`)
  - On `disconnect`: remove Redis key
  - Expose `sendAlert(userId, payload)` — looks up all socketIds for userId,
    emits `alert` event to each
  - Apply `WsJwtGuard`
- [x] Task 3.2: Write unit tests for `NotificationsGateway`
- [x] Task 3.3: Create `src/gateways/connectivity/connectivity.gateway.ts`
  - `@WebSocketGateway({ namespace: '/connectivities', transports: ['websocket'] })`
  - On `connection`: join room, store `socketId → userId` in Redis
    (`connectivities:{socketId}`), call `ConnectivityService.getAllConnectivities(userId)`,
    emit `fetchData` with result
  - On `disconnect`: remove Redis key
  - Apply `WsJwtGuard`
- [x] Task 3.4: Write unit tests for `ConnectivityGateway`
- [x] Task 3.5: Create `src/gateways/observability/observability-alerts.gateway.ts`
  - `@WebSocketGateway({ namespace: '/observability_alerts', transports: ['websocket'] })`
  - On `connection`: join room, store `socketId → userId` in Redis
    (`observabilityNotifications:{socketId}`)
  - On `disconnect`: remove Redis key
  - Expose `sendAlert(userId, payload)` — same lookup pattern as
    `NotificationsGateway`
  - Apply `WsJwtGuard`
- [x] Task 3.6: Write unit tests for `ObservabilityAlertsGateway`

### Verification

- [x] `npm run build` passes
- [x] `npm test` — all specs pass

## Phase 4: ETL Gateway & Redis Adapter Integration

Implement the ETL gateway (no auth, Bottleneck, cross-gateway triggers) and
wire the Redis adapter + `setupWorker` into `main.ts`.

### Tasks

- [x] Task 4.1: Create `src/gateways/etl/etl.gateway.ts`
  - `@WebSocketGateway({ namespace: '/etl', transports: ['websocket'] })`
  - No `WsJwtGuard` (no auth)
  - Inject `DashboardGateway`, `WidgetBuilderService`, `ConnectivityService`,
    `NotificationService`, `DashboardErrorRepository`
  - Initialize `Bottleneck({ maxConcurrent: 10, minTime: 100 })` with ioredis client
  - On `trigger`: call `WidgetBuilderService.fetchWidgetBuilderByTables(tableName)`,
    iterate connected dashboard clients via `DashboardGateway.getClientsFromStorage()`,
    schedule each unique chart through Bottleneck; after success call
    `NotificationService.processChartNotification()` (skip COMPARE_TREND/TREND/PIE);
    on error save `core_dashboard_error` and emit error to socket
  - On `connectivityCheck`: call `ConnectivityService.connectivityCheck()`
- [x] Task 4.2: Write unit tests for `EtlGateway`
- [x] Task 4.3: Update `src/main.ts` — after `app.listen()`, attach
      `@socket.io/redis-adapter` (pub/sub ioredis clients, key `imonitor-master`,
      requestsTimeout 20000); call `setupWorker(io)` when `cluster.isWorker`
- [x] Task 4.4: Register `GatewaysModule` in `AppModule` imports
- [x] Task 4.5: Export `NotificationsGateway`, `ConnectivityGateway`,
      `ObservabilityAlertsGateway` from `GatewaysModule`; import `GatewaysModule`
      in the feature modules that call `sendAlert` / connectivity broadcast
      (NotificationsModule, ConnectivityModule, ObservabilityModule)

### Verification

- [x] `npm run build` passes
- [x] `npm test` — all suites pass
- [x] `npm run lint` passes

## Final Verification

- [x] All 11 acceptance criteria from spec.md met
- [x] `npm run build` clean
- [x] `npm run lint` clean
- [x] `npm test` — all suites pass (1397 tests, 83 suites — all green)
- [x] `GatewaysModule` registered and gateways visible in NestJS startup log
- [x] Conventional commit history on branch `migration/phase-4-socketio`
- [x] Ready for merge and tag `v0.4.0-migration-phase4`

---
_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
