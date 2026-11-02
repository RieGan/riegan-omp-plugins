# Performance — SQL and migrations

## Flag
### Queries
- New `WHERE`/`JOIN`/`ORDER BY`/`GROUP BY` column with no usable index on a table that is large or growing (>= ~1e5 rows, or unbounded append like events/orders/logs) -- look up the table's existing indexes in schema/migrations; state which index is missing. Postgres does not auto-index foreign keys; MySQL/InnoDB does for FKs it creates. Unindexed FK used in joins or `ON DELETE CASCADE` makes parent deletes scan the child.
- Function/expression/cast on an indexed column in the predicate (`WHERE lower(email) = $1`, `date(created_at) = ...`, `col + 1 = x`, `CAST(id AS text)`), or implicit type mismatch (text vs int/uuid param, collation mismatch) -- index unusable; fix: expression index (Postgres/SQLite) / generated column (MySQL) / rewrite as range (`created_at >= d AND created_at < d + 1`).
- Leading-wildcard `LIKE '%x'`/`ILIKE '%x%'` on a large table without `pg_trgm`/FTS index; `OR` across different columns without per-branch indexes (MySQL index merge aside); `NOT IN (subquery)` on large sets (also NULL semantics -- correctness) -- use `NOT EXISTS`.
- Composite index column order not matching the query (range column before equality column, query filters on 2nd column only) -- state the query shape and index definition.
- `OFFSET` pagination for deep pages of a large table (`LIMIT 20 OFFSET 100000`) -- cost grows linearly with offset; fix: keyset (`WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT n`). Not for admin lists under ~1e4 rows.
- No `LIMIT`/pagination on a list endpoint query over a growing table; `ORDER BY` without supporting index plus `LIMIT` on a large table (full sort); `SELECT COUNT(*)` of a large table per request (Postgres full scan; InnoDB scans an index).
- `SELECT *` on wide tables/with large `text`/`jsonb`/`bytea` columns when only a few columns are used on a hot path, or breaking index-only scans -- name the heavy column. Otherwise do not flag.
- Correlated subquery or per-row scalar function in `SELECT`/`WHERE` over a large table where a join/window works; `DISTINCT` used to mask a join fan-out; `UNION` where `UNION ALL` suffices (dedup sort) at large N.
- Query inside an application loop (see language files); `IN (...)` lists built from thousands of ids per request (bind-parameter limits: SQLite 32766 since 3.32, Postgres 65535, MySQL 65535 placeholders); use `= ANY($1)`/temp table/join.
- Long transactions on request path: transaction held open across external HTTP calls/user think time -- row/table locks and bloat (concurrency owns lock ordering).
- New index that duplicates an existing prefix index, or many indexes added to a write-heavy hot table -- write amplification; flag only with a named existing index or a high-write table.

### Migrations and lock duration (large tables only; say how you know the table is large)
- Postgres `CREATE INDEX` without `CONCURRENTLY` on a live table -- blocks writes for the duration; fix: `CREATE INDEX CONCURRENTLY` (cannot run in a transaction block; migration tool needs no-transaction mode); likewise `DROP INDEX CONCURRENTLY`, `REINDEX CONCURRENTLY`.
- Postgres `ADD COLUMN ... DEFAULT <volatile expr>` (e.g. `random()`, `clock_timestamp()`) rewrites the table; constant defaults are metadata-only since PG 11 (do not flag those). `ALTER COLUMN TYPE` rewrites the table and indexes except binary-coercible cases (e.g. `varchar(n)` to larger `n`/`text`). `ADD COLUMN ... GENERATED ALWAYS AS ... STORED` rewrites.
- Postgres `SET NOT NULL` scans under ACCESS EXCLUSIVE (PG 12+ skips the scan if a validated `CHECK (col IS NOT NULL)` exists); `ADD FOREIGN KEY`/`ADD CHECK` validates under lock -- fix: `NOT VALID` then `VALIDATE CONSTRAINT` (SHARE UPDATE EXCLUSIVE). `ADD UNIQUE`: build index concurrently then `ADD CONSTRAINT ... USING INDEX`.
- Any DDL taking ACCESS EXCLUSIVE without `lock_timeout` on a hot table -- queues behind a long query, then blocks all traffic behind it; flag when the repo's other migrations set `lock_timeout` or the table is hot.
- MySQL 8: `ALGORITHM=INSTANT` is available for `ADD COLUMN` (8.0.12+; last-position-only before 8.0.29), but changing column type, adding `FULLTEXT`/`SPATIAL`, `CHANGE ... charset`, or `ADD PRIMARY KEY` rebuild/copy the table; index add is online but heavy. Explicit `ALGORITHM=COPY`/`LOCK=EXCLUSIVE` on a big table; for very large tables note gh-ost/pt-osc usage in the repo.
- SQLite: `ALTER TABLE` is limited; table-rebuild migrations (create new, copy, drop, rename) on a large table hold the write lock for the copy; SQLite has only one writer, so a long single-transaction backfill blocks all writes.
- Backfill/UPDATE of an entire large table in one statement/transaction (`UPDATE t SET x = ...` of millions of rows) -- long lock, WAL/bloat; fix: batch by primary-key range with commits.
- Drop/rename column or table in the same deploy as code that still uses it is a correctness/API issue, not this file.

## Do not flag
- Missing index on small/static lookup tables, boolean/low-cardinality columns where a seq scan wins, columns already covered by a leading column of an existing composite index, or one-off report/admin queries.
- `SELECT *` in tests, ORM entity loads of narrow tables, `EXISTS (SELECT 1 ...)` style.
- `OFFSET` on small bounded lists, or where the page cap is enforced (<= ~100 pages of results).
- Migrations on tables created in the same migration/release or known-empty; concurrent index creation already used; `ADD COLUMN` with constant default or nullable no default (PG 11+, MySQL INSTANT); MySQL online index add on moderate tables.
- Query planner speculation without data ("planner might choose seq scan"); index suggestions for queries already served by the primary key/unique constraint.
- CTE materialization worries: Postgres 12+ inlines non-recursive side-effect-free CTEs referenced once (use `MATERIALIZED` only when stated).
- `COUNT(*)` on small tables or with a selective predicate; `ORDER BY` on a tiny result.
- Denormalization or `jsonb` choices; data-type width choices (int vs bigint) unless a named overflow (correctness) or size at scale.
