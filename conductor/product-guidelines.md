# Product Guidelines

## Voice and Tone

**Professional and technical.** Documentation, error messages, and API responses should be precise, unambiguous, and written for an engineering audience. Avoid colloquialisms. Use domain-specific telecom terminology where appropriate.

## Design Principles

### 1. Reliability First

- The system monitors critical telecom infrastructure — downtime or data loss is unacceptable.
- Every endpoint must handle errors gracefully with structured error responses.
- Database connections must include retry logic and health checks.
- Background workers and cron jobs must be fault-tolerant with proper error reporting.

### 2. Developer Experience

- Clean, consistent API contracts across all 150+ endpoints.
- Swagger/OpenAPI documentation auto-generated and always up-to-date.
- Modular architecture where each feature is self-contained and independently testable.
- Conventional commits and clear branch naming for easy navigation of git history.

### 3. Functional Parity

- No endpoint behavior may change during migration unless explicitly agreed upon.
- Response formats, status codes, and error shapes must match v3 exactly.
- Cross-database queries must continue to work identically.

### 4. Incremental Migration

- Each phase is independently deployable and testable.
- Legacy database modules preserve existing query patterns without conversion.
- The system can run alongside v3 for blue-green deployment validation.
