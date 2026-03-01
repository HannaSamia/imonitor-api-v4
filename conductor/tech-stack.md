# Tech Stack

## Languages

| Language | Version | Usage |
|----------|---------|-------|
| TypeScript | 5.x (standard mode) | Primary language for all application code |
| SQL | MariaDB dialect | Raw queries for legacy database modules |

## Backend Framework

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | NestJS | Latest (v10+) |
| HTTP Platform | Express (via @nestjs/platform-express) | 4.x |
| API Documentation | @nestjs/swagger | Latest |
| Configuration | @nestjs/config + Joi | Latest |
| Scheduling | @nestjs/schedule | Latest |
| Events | @nestjs/event-emitter | Latest |
| WebSockets | @nestjs/websockets + @nestjs/platform-socket.io | Latest |
| Authentication | @nestjs/passport + passport-jwt | Latest |

## Frontend

None — backend API only. Swagger UI served for API documentation.

## Databases

| Database | Purpose | Access Method |
|----------|---------|---------------|
| MariaDB (iMonitorV3_1) | Core application data | TypeORM (entities, repositories) |
| MariaDB (iMonitorData) | Analytics, statistics, node data | Raw SQL via mysql2 (LegacyDataDbModule) |
| MariaDB (EtlV3_2) | ETL flow management | Raw SQL via mysql2 (LegacyEtlDbModule) |
| Redis | Caching, rate limiting, Socket.IO adapter | ioredis |
| Presto | Distributed SQL for CDR bill runs | Raw client (LegacyPrestoModule) |

## ORM / Data Access

| Component | Technology |
|-----------|-----------|
| ORM | TypeORM (iMonitorV3_1 only) |
| Driver | mysql2 |
| Migrations | TypeORM CLI migrations (synchronize: false) |
| Legacy queries | Raw SQL via mysql2 connection pools |

## Real-time

| Component | Technology |
|-----------|-----------|
| WebSocket Server | Socket.IO 4.x |
| Cross-cluster adapter | @socket.io/redis-adapter |
| Sticky sessions | @socket.io/sticky |
| Rate limiting (ETL) | Bottleneck |

## Infrastructure

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 18+ |
| Containerization | Docker + docker-compose |
| Process management | Node.js cluster module |
| Deployment | Self-hosted / Docker |

## Key Dependencies

| Package | Purpose |
|---------|---------|
| class-validator + class-transformer | DTO validation |
| winston + winston-daily-rotate-file | Logging with file rotation |
| helmet | Security headers |
| compression | Response compression |
| bcrypt | Password hashing |
| jsonwebtoken | JWT token handling |
| nodemailer | Email sending |
| multer | File uploads |
| exceljs | Excel generation |
| puppeteer | PDF/image generation |
| csv-writer + fast-csv | CSV processing |
| fast-xml-parser | XML parsing |
| date-fns | Date utilities |
| axios | HTTP client |
| uuid | UUID generation |
| joi | Config schema validation |

## Dev Dependencies

| Package | Purpose |
|---------|---------|
| @nestjs/testing | NestJS test utilities |
| jest + ts-jest | Testing framework |
| supertest | HTTP E2E testing |
| socket.io-client | Socket.IO E2E testing |
| eslint + @typescript-eslint | Linting |
| prettier | Code formatting |
