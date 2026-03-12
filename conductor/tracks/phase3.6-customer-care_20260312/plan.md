# Implementation Plan: Phase 3.6 — Customer Care

**Track ID:** phase3.6-customer-care_20260312
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-12
**Status:** In Progress

## Overview

Migrate the Customer Care module (30 endpoints, ~5,600 lines of v3 service code) to NestJS v4. The monolithic v3 service is split into 5 focused sub-services + 1 orchestrator facade for maintainability. Implementation in 6 phases: dependencies & DTOs, AIR integration, network queries & history, trace management, controller & module wiring, and unit tests.

## Phase 1: Dependencies, DTOs & Shared Utilities

Install required npm packages, create all DTOs with class-validator decorators, and add any missing shared helpers.

### Tasks

- [x] Task 1.1: Verify/install npm dependencies — `ssh2-promise`, `fast-xml-parser`, `axios` (check if already in package.json)
- [x] Task 1.2: Create `MsisdnParamDto` — shared param DTO with `@IsNotEmpty()` msisdn validation, reusable across endpoints
- [x] Task 1.3: Create Customer Care DTOs — `CustomerCareDefaultParamsDto` (msisdn + test), `HourlyBalanceParamsDto` (date, sdpvip, msisdn), `DaHistoryParamsDto` (fromdate, todate, sdpvip, msisdn), `SubscriptionHistoryParamsDto` (fromdate, todate, msisdn, test), `CdrHistoryParamsDto` (fromdate, todate, msisdn), `TraceParamsDto` (sdpvip, msisdn), `GetTraceParamsDto` (fromhour, tohour, sdpvip, msisdn), `AirTraceParamsDto` (msisdn), `GetAirTraceParamsDto` (fromhour, tohour, msisdn), `TraceDateRangeParamsDto` (fromdate, todate), `ExportTraceQueryDto` (raw?: boolean)
- [x] Task 1.4: Create Customer Care response interfaces — mirror v3 DTOs: `SdpDto`, `CustomerCareBasicResponse`, `CustomerCareResponse<T>`, `HourlyBalanceBodyDto`, `DailyDaBodyDTO`, `SobDto`, `HlrResult`, `HssDTO`, `MtasDTO`, `OffersDTO`, `DedicatedAccountsDTO`, `AirDownloadableDTO`, `TraceHistoryDTO`
- [x] Task 1.5: Create internal config interfaces — `CustomerCareXMLRequest`, `CisHttpDTO`, `MsapHttpDTO`, `TraceSystemConfigDTO`, `SftpConfigDTO`, `DaasApiResponse`, `DaasCdrRecord`
- [x] Task 1.6: Add `msisdnFormatter()` helper to shared utils (if not already present) — strips prefix, validates format

### Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Existing 852 tests still pass

## Phase 2: AIR Integration Service

Implement the AIR XML-RPC service that handles all subscriber information queries (SDP, DA, offers, accumulators, PAM, usage, SOB).

### Tasks

- [ ] Task 2.1: Create `CustomerCareAirService` — `airServerAdjuster(isTest)` method that fetches AIR server config from `SystemConfigService`, resolves SDP VIP via DNS, and builds `CustomerCareXMLRequest`
- [ ] Task 2.2: Implement AIR XML-RPC helper methods — `executeAirXmlRpc(request, xmlBody)` that connects via SSH tunnel, sends XML-RPC request, parses response with `fast-xml-parser`
- [ ] Task 2.3: Implement subscriber query methods — `getSDP()`, `getDedicatedAccounts()`, `getOffers()`, `getAccumulators()`, `getPAM()`, `getUsageCounter()`, `getUsageThreshold()`, `getSob()` — each builds XML body, calls AIR, parses response into typed DTOs
- [ ] Task 2.4: Add fire-and-forget error logging — save failures to `core_customer_care_error` via repository (never await/block request)

### Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes

## Phase 3: Network Queries & History Service

Implement HLR/HSS/MTAS queries (CIS HTTP API), subscription history (MSAP API), CDR history (DAAS API), hourly balance, DA history, and Share'n'Sell.

### Tasks

- [ ] Task 3.1: Create `CustomerCareNetworkService` — `getHLR()`, `getHSS()`, `getMTAS()` via CIS HTTPS API with custom certificates from SystemConfig
- [ ] Task 3.2: Create `CustomerCareHistoryService` — `getSubscriptionHistory()`, `getMsapSubscriptionHistory()`, `getMsapVasSubscription()` via MSAP REST API with API key + certificates
- [ ] Task 3.3: Implement CDR history — `getCdrHistory()` and `exportCdrHistoryExcel()` via DAAS API, with paginated retrieval and Excel export using `ExportHelperService`
- [ ] Task 3.4: Implement balance queries — `getHourlyBalance()` and `getDailyDAHistory()` querying iMonitorData tables via `LegacyDataDbService`
- [ ] Task 3.5: Implement `shareNSellTransactionHistory()` — query iMonitorData via `LegacyDataDbService`

### Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes

## Phase 4: Trace Management Services

Implement SDP trace and AIR trace management (set/unset/fetch/export via SSH/SFTP).

### Tasks

- [ ] Task 4.1: Create `CustomerCareSdpTraceService` — `setTrace()` and `unsetTrace()` via SSH command execution + trace tracker DB updates
- [ ] Task 4.2: Implement SDP trace fetch — `fetchTrace()` via SFTP file retrieval, parses trace data
- [ ] Task 4.3: Implement SDP trace exports — `exportSdpTraceHtml()` (with provider mapping), `exportSdpTraceRawMappingHtml()` (raw with mapping), `exportSdpTraceRawText()` (plain TXT)
- [ ] Task 4.4: Create `CustomerCareAirTraceService` — `setAirTrace()`, `unsetAirTrace()` via SSH commands + trace tracker DB updates
- [ ] Task 4.5: Implement AIR trace fetch — `fetchAirTrace()` via SSH, returns `AirDownloadableDTO` with download URL
- [ ] Task 4.6: Implement AIR trace exports — `exportAirTraceHtml()`, `downloadAirTrace()` (returns `ITextToFile`)
- [ ] Task 4.7: Implement trace history — `fetchTraceHistory()` and `fetchTracedNumbers()` querying `core_trace_tracker` via TypeORM

### Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes

## Phase 5: Controller, Facade Service & Module Wiring

Create the orchestrator service, controller with all 30 endpoints, and module registration.

### Tasks

- [ ] Task 5.1: Create `CustomerCareService` (facade) — inject all 5 sub-services, delegate each method to the appropriate sub-service
- [ ] Task 5.2: Create `CustomerCareController` with 30 GET endpoints — full Swagger decorators (@ApiTags, @ApiOperation, @ApiResponse, @ApiBearerAuth, @ApiParam), PrivilegeGuard, param DTOs with validation pipes
- [ ] Task 5.3: Handle file download endpoints — CDR Excel export, SDP trace HTML/TXT exports, AIR trace HTML/download using appropriate NestJS response patterns (StreamableFile or file path + cleanup)
- [ ] Task 5.4: Create `CustomerCareModule` — register all services, controller, inject repositories (CoreCustomerCareError, CoreTraceTracker), import SharedModule + LegacyDataDbModule
- [ ] Task 5.5: Register `CustomerCareModule` in `AppModule`

### Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] All 30 endpoints registered (verify via route listing or Swagger)

## Phase 6: Unit Tests & Finalization

Comprehensive unit tests for all services, update migration docs.

### Tasks

- [ ] Task 6.1: Write unit tests for `CustomerCareAirService` — airServerAdjuster, getSDP, getDedicatedAccounts, getOffers, getAccumulators, getPAM, getUsageCounter, getUsageThreshold, getSob, error logging
- [ ] Task 6.2: Write unit tests for `CustomerCareNetworkService` — getHLR, getHSS, getMTAS
- [ ] Task 6.3: Write unit tests for `CustomerCareHistoryService` — getSubscriptionHistory, getMsapSubscriptionHistory, getMsapVasSubscription, getCdrHistory, exportCdrHistoryExcel, getHourlyBalance, getDailyDAHistory, shareNSellTransactionHistory
- [ ] Task 6.4: Write unit tests for `CustomerCareSdpTraceService` — setTrace, unsetTrace, fetchTrace, exports
- [ ] Task 6.5: Write unit tests for `CustomerCareAirTraceService` — setAirTrace, unsetAirTrace, fetchAirTrace, exports
- [ ] Task 6.6: Write unit tests for `CustomerCareService` (facade) — delegation tests
- [ ] Task 6.7: Write unit tests for `CustomerCareController` — all 30 endpoint handler tests
- [ ] Task 6.8: Write DTO validation tests for all param DTOs
- [ ] Task 6.9: Update CLAUDE.md migration progress table, update MIGRATION.md if needed
- [ ] Task 6.10: Final build + lint + full test suite verification

### Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] All tests pass (existing 852 + new customer care tests)
- [ ] No regressions in existing modules
