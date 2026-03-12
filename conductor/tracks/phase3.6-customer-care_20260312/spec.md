# Specification: Phase 3.6 — Customer Care

**Track ID:** phase3.6-customer-care_20260312
**Type:** Feature
**Created:** 2026-03-12
**Status:** Draft

## Summary

Migrate the Customer Care module from Express.js v3 to NestJS v4, providing telecom operations teams with subscriber information queries, balance/usage tracking, trace management, CDR history, and network status lookups via AIR/SDP/HLR/HSS/MTAS/CIS/MSAP/DAAS integrations.

## Context

Customer Care is the largest single service in v3 (~5,600 lines). It provides 30 REST endpoints under `/api/v1/operations` that integrate with multiple external telecom systems (AIR XML-RPC, SDP DNS resolution, HLR/HSS/MTAS network queries, CIS HTTP API, MSAP API, DAAS CDR API). The service handles subscriber lookups, balance queries, trace management via SSH/SFTP, and CDR history retrieval. All configuration (AIR servers, CIS/MSAP credentials, trace configs) is stored in `core_system_config` and fetched via `SystemRepository`.

## User Story

As a telecom operations engineer, I want to look up subscriber details (SDP, dedicated accounts, offers, accumulators, PAM, usage counters/thresholds, SOB), check network status (HLR, HSS, MTAS), query balance history (hourly balance, daily DA history), manage traces (set/unset/fetch SDP and AIR traces), view CDR history, and check subscription history, so that I can diagnose and resolve customer issues.

## Acceptance Criteria

- [ ] 30 endpoints under `/api/v1/operations` matching v3 routes exactly
- [ ] All endpoints behind JWT + PrivilegeGuard
- [ ] AIR XML-RPC integration (SDP, dedicated accounts, offers, accumulators, PAM, usage counter/threshold, SOB)
- [ ] DNS-based SDP resolution via `airServerAdjuster()`
- [ ] HLR, HSS, MTAS network query integrations (CIS HTTP API)
- [ ] MSAP API integration for subscription history (basic, bundle, VAS)
- [ ] DAAS API integration for CDR history + Excel export
- [ ] SDP trace management (set/unset/fetch via SSH + SFTP)
- [ ] AIR trace management (set/unset/fetch/download via SSH)
- [ ] Trace history and pending traces list
- [ ] Hourly balance and daily DA history queries against iMonitorData
- [ ] Share'n'Sell transaction history
- [ ] CDR history Excel export
- [ ] SDP trace exports (HTML with provider mapping, HTML raw, TXT raw)
- [ ] AIR trace exports (HTML, downloadable text)
- [ ] Error logging to `core_customer_care_error` table
- [ ] Unit tests for all service methods
- [ ] DTOs with class-validator + @ApiProperty for all inputs

## Dependencies

- **Existing modules:** `SharedModule` (DateHelperService, ExportHelperService), `LegacyDataDbModule` (raw SQL to iMonitorData), `CoreDataModule` (SystemConfig entity)
- **Existing entities:** `CoreCustomerCareError`, `CoreTraceTracker` (already created)
- **External systems:** AIR servers (XML-RPC over SSH), CIS HTTP API, MSAP REST API, DAAS CDR API
- **npm packages needed:** `ssh2-promise` (SSH/SFTP), `fast-xml-parser` (XML parsing), `axios` (HTTP client for CIS/MSAP/DAAS) — check if already installed

## Out of Scope

- Bulk processing operations (Phase 3.7)
- Socket.IO real-time updates (Phase 4)
- Background workers/cron jobs (Phase 3.9)
- AIR server health monitoring

## Technical Notes

- **Route prefix:** `api/v1/operations` (NOT `api/v1/customer-care` — preserve v3 path)
- v3 service is 5,600 lines — split into sub-services in v4:
  - `CustomerCareAirService` — AIR XML-RPC calls (SDP, DA, offers, accumulators, PAM, usage, SOB)
  - `CustomerCareSdpTraceService` — SDP trace set/unset/fetch/export via SSH/SFTP
  - `CustomerCareAirTraceService` — AIR trace set/unset/fetch/export via SSH
  - `CustomerCareNetworkService` — HLR, HSS, MTAS via CIS HTTP API
  - `CustomerCareHistoryService` — Subscription history (MSAP API), CDR history (DAAS API), hourly balance, DA history, Share'n'Sell
  - `CustomerCareService` — Orchestrator facade delegating to sub-services
- All external system configs fetched from `core_system_config` via `SystemConfigService`
- `msisdnFormatter()` already exists in v4 shared helpers or needs creation
- Error logging to `core_customer_care_error` is fire-and-forget (never blocks request)
- Trace tracker uses `core_trace_tracker` table (TypeORM entity exists)
- Hourly balance and DA history query iMonitorData tables via `LegacyDataDbService`
- CIS/MSAP use HTTPS with custom certificates — need cert file paths from system config
- AIR XML-RPC uses SSH2Promise for tunneled connections

### v3 Endpoint Mapping

#### Customer Care (`api/v1/operations`) — 30 endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/sdp/:msisdn/:test` | SDP details (name, VIP, ID) |
| GET | `/dedicated-accounts/:msisdn/:test` | Dedicated accounts list |
| GET | `/offers/:msisdn/:test` | Active offers |
| GET | `/accumulators/:msisdn/:test` | Accumulators |
| GET | `/pam/:msisdn/:test` | PAM services |
| GET | `/usage-counter/:msisdn/:test` | Usage counters |
| GET | `/usage-threshold/:msisdn/:test` | Usage thresholds |
| GET | `/sob/:msisdn/:test` | Service of Breath status |
| GET | `/hlr/:msisdn` | HLR query |
| GET | `/hss/:msisdn` | HSS query |
| GET | `/mtas/:msisdn` | MTAS query |
| GET | `/hourlybalance/:date/:sdpvip/:msisdn` | Hourly balance |
| GET | `/dadailyhistory/:fromdate/:todate/:sdpvip/:msisdn` | Daily DA history |
| GET | `/subhistory/:fromdate/:todate/:msisdn/:test` | Subscription history |
| GET | `/msap/subhistory/:fromdate/:todate/:msisdn/:test` | MSAP bundle history |
| GET | `/msap/vas/subhistory/:msisdn/:test/:fromdate/:todate` | MSAP VAS history |
| GET | `/cdr/history/:fromdate/:todate/:msisdn` | CDR history |
| GET | `/cdr/history/:fromdate/:todate/:msisdn/export` | CDR history Excel export |
| GET | `/sellnshare/history/:fromdate/:todate/:msisdn` | Share'n'Sell transactions |
| GET | `/settrace/:sdpvip/:msisdn` | Set SDP trace |
| GET | `/unsettrace/:sdpvip/:msisdn` | Unset SDP trace |
| GET | `/gettrace/:fromhour/:tohour/:sdpvip/:msisdn` | Fetch SDP trace |
| GET | `/gettrace/:fromhour/:tohour/:sdpvip/:msisdn/export` | Export SDP trace HTML |
| GET | `/gettrace/:fromhour/:tohour/:sdpvip/:msisdn/export/raw` | Export SDP trace TXT |
| GET | `/air/settrace/:msisdn` | Set AIR trace |
| GET | `/air/unsettrace/:msisdn` | Unset AIR trace |
| GET | `/air/gettrace/:fromhour/:tohour/:msisdn` | Fetch AIR trace |
| GET | `/air/gettrace/:fromhour/:tohour/:msisdn/export` | Export AIR trace HTML |
| GET | `/air/download/trace/:fromhour/:tohour/:msisdn` | Download AIR trace TXT |
| GET | `/trace/history/:fromdate/:todate` | Trace history |
| GET | `/trace/pending` | Pending traced numbers |
