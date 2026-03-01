# SQL Style Guide

## General

- All raw SQL queries are used exclusively in Legacy Database Modules (iMonitorData, EtlV3_2, Presto).
- iMonitorV3_1 queries go through TypeORM — no raw SQL for that database.
- Always use parameterized queries (`?` placeholders) — never string interpolation.

## Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Tables | Original names preserved exactly | `V3_sdp_nodes`, `core_etl_flows` |
| Columns | Original names preserved exactly | `stat_date`, `ip_address` |
| Aliases | lowercase with underscore | `AS total_count` |

## Query Formatting

```sql
SELECT
  t.column_one,
  t.column_two,
  SUM(t.value) AS total_value
FROM \`iMonitorData\`.V3_sdp_stats AS t
WHERE t.stat_date >= ?
  AND t.stat_date < ?
  AND t.node_name = ?
GROUP BY t.column_one, t.column_two
ORDER BY t.stat_date DESC
LIMIT ?
```

## Rules

1. **Backtick database names** that contain dots or special characters: `` `iMonitorV3_1` ``.
2. **Always use parameterized queries** — pass values as the second argument to `query()`.
3. **Prefix table names with database** for cross-database queries: `` `iMonitorData`.V3_sdp_stats ``.
4. **Use uppercase SQL keywords**: `SELECT`, `FROM`, `WHERE`, `JOIN`, `ORDER BY`.
5. **One column per line** in SELECT for readability.
6. **Indent JOIN and WHERE clauses** for clarity.

## Cross-Database Queries

```sql
SELECT m.tableName, s.stat_date
FROM \`iMonitorV3_1\`.core_modules_tables AS m
JOIN \`iMonitorData\`.V3_sdp_stats AS s ON s.node_name = m.paramsNodeName
WHERE m.mId = ?
```

## Security

- Never use string interpolation for values: `WHERE id = '${id}'` is forbidden.
- Table/column names from user input must be validated against an allowlist.
- Use the `mysql2` `escape()` function only as a last resort for dynamic identifiers.
