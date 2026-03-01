# Product Definition

## Project Name

iMonitor API v4

## Description

Enterprise telecom monitoring API with real-time dashboards, automated reporting, and customer care operations.

## Problem Statement

The existing Express.js API has architectural debt, tight coupling, and scalability issues that need modernization. The v3 codebase uses InversifyJS DI, raw SQL queries, and tightly-coupled Socket.IO handlers that make the system difficult to maintain, test, and scale.

## Target Users

Both NOC (Network Operations Center) engineers and management stakeholders viewing dashboards and reports:

- **NOC Engineers**: Monitor network node health in real-time, handle customer care operations (SDP/AIR/CIS lookups), manage bulk processes, and respond to observability alerts.
- **Management Stakeholders**: View dashboards and reports, access data analysis, and review automated report outputs.
- **System Administrators**: Manage users, roles, modules, ETL flows, and system configuration.

## Key Goals

1. **Full functional parity with v3** — Every existing endpoint must behave identically after migration.
2. **Improved architecture and maintainability** — Modular NestJS architecture with proper DI, event-driven side effects, and clean separation of concerns.
3. **Better scalability with clustering and event-driven design** — Multi-worker clustering with Redis-backed Socket.IO, event emitter for decoupled cross-module communication.

## Context

This project is a migration from `imonitor-v3-api` (Express.js + InversifyJS + TSOA) to NestJS with TypeORM. The full migration plan is documented in [MIGRATION.md](../MIGRATION.md).
