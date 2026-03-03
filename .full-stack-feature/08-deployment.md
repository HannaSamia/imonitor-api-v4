# Step 8: Deployment & Infrastructure

**Status**: Complete
**Output**: `docs/phase3.1-deployment-guide.md`

## Summary

A comprehensive deployment guide has been created at `docs/phase3.1-deployment-guide.md` covering:

1. **Pre-deployment checklist** — Environment variables (JWT_KEY min 32 chars, CORS_ORIGIN recommended), new dependency (@nestjs/jwt), database migration (8 indexes)
2. **Database migration** — Three execution options (TypeORM CLI, Docker exec, direct SQL), zero-downtime via InnoDB online DDL, verification queries, rollback procedure
3. **Deployment procedure** — Migration-first order, Docker build/deploy, connection pool increase to 20, health check verification
4. **Rollback plan** — Decision criteria, Git-based app rollback, independent DB rollback (DROP INDEX IF EXISTS), backward-compatible schema
5. **Monitoring** — JWT error rates, guard rejection rates, login latency, connection pool utilization, MariaDB index statistics, Redis health
6. **Post-deployment verification** — Automated curl tests for login/heartbeat/logout, index existence check, EXPLAIN verification, container health

## Key Recommendations
- Increase connection pool from 5 to 20 (configurable via env var)
- Verify JWT_KEY is 32+ characters before deployment
- Configure CORS_ORIGIN for production
- Monitor index usage via MariaDB INDEX_STATISTICS after deployment
