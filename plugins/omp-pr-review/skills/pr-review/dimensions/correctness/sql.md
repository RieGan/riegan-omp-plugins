# Correctness — SQL
## Flag
- `NOT IN (subquery)` where the subquery column is nullable — one NULL makes the predicate never true (returns zero rows). Use `NOT EXISTS`. Check nullability in the schema before reporting.
- `= NULL` / `<> NULL` / `col != x` expecting NULL rows: comparison with NULL is UNKNOWN. Use `IS [NOT] NULL`, `IS DISTINCT FROM` (Postgres, SQLite 3.39+; MySQL `<=>`). `WHERE col <> 'x'` silently drops NULL rows — flag when NULLs are legal and should match.
- Aggregates/NULL arithmetic: `COUNT(col)` skips NULL vs `COUNT(*)`; `SUM`/`AVG` of empty or all-NULL input is NULL not 0 (needs `COALESCE`); integer `a/b` truncates in Postgres and SQLite (MySQL `/` is decimal, `DIV` truncates); string concat with NULL yields NULL (Postgres `||`, MySQL `CONCAT`).
- `UPDATE`/`DELETE` with no `WHERE`, or `WHERE` that references the wrong alias/column so it matches all rows; missing join condition in `UPDATE … FROM`/multi-table delete (cartesian); backfill without batching key.
- JOIN fan-out: join on a non-unique key multiplying rows then `SUM`/`COUNT` (inflated totals) or `DISTINCT` papering over it; `LEFT JOIN` + `WHERE right.col = …` becoming an inner join (condition belongs in `ON`); join on nullable key never matches NULL.
- `LIMIT`/`OFFSET`/`TOP` without a deterministic total `ORDER BY` (ties) — pagination skips/duplicates rows; `ORDER BY` non-unique column alone; `DISTINCT ON` (Postgres) without matching `ORDER BY`.
- `GROUP BY` / select-list mismatch: MySQL without `ONLY_FULL_GROUP_BY` returns arbitrary values; SQLite bare columns arbitrary; `HAVING` vs `WHERE` (filtering before vs after aggregation); window function without `ORDER BY`/frame (default frame `RANGE … CURRENT ROW` peers); `ROW_NUMBER` vs `RANK` ties.
- Implicit casts/collation: comparing string to number (MySQL `'abc' = 0` is true; index not used), varchar vs int join keys, `CHAR` padding, case-insensitive default collation in MySQL vs case-sensitive Postgres (unique constraints, lookups), `LIKE` with unescaped `%`/`_` from data, SQLite type affinity and dynamic typing (string stored in INTEGER column, `'10' < '9'`).
- Time types: `TIMESTAMP WITHOUT TIME ZONE` storing local/UTC-ambiguous values vs `timestamptz`; MySQL `TIMESTAMP` 2038 limit and session `time_zone` conversion vs `DATETIME` (no conversion); `date_trunc`/`BETWEEN` on timestamps with inclusive upper bound (`BETWEEN '2024-01-01' AND '2024-01-31'` misses the last day's rows — use half-open `< next day`); `now()` in transaction vs `clock_timestamp()`; SQLite stores dates as text/int by convention.
- Numeric: `FLOAT`/`DOUBLE` for money (use `NUMERIC(p,s)`); `NUMERIC` without scale rounding; integer overflow on `INT` ids/counters (use `BIGINT`); sequence/auto-increment gaps assumed contiguous; `DECIMAL` division scale.
- Constraints/schema vs code: new `NOT NULL` column without default on populated table (migration fails) or default backfill rewriting a big table; `UNIQUE` with nullable columns (NULLs distinct in Postgres/SQLite/MySQL; `NULLS NOT DISTINCT` is PG15+); FK `ON DELETE CASCADE` deleting more than intended; dropped column/enum value still referenced by code, views, triggers; renamed column with old name still used.
- Migration correctness: down-migration not inverting up; data migration not idempotent on re-run; `CREATE INDEX` expectation (`CONCURRENTLY` cannot run in a transaction block); `ALTER TYPE … ADD VALUE` transaction limits (PG <12); DDL transactional in Postgres/SQLite but implicit-commit in MySQL (partial migration on failure); column type change `USING` cast missing/lossy; ordering of migration files vs dependencies.
- Upsert/transactions: `INSERT … ON CONFLICT`/`ON DUPLICATE KEY` updating the wrong columns or conflict target not matching a unique index; check-then-insert instead of constraint; multi-statement change not in a transaction so failure leaves partial state; `RETURNING` ignored.
- Parameterization bugs (not injection — security owns that): placeholder count/order mismatch, `IN (?)` bound to a single list param, empty list expanding to `IN ()` syntax error / matching nothing (when empty should mean "no filter" or vice versa).
- ORM raw queries: result column order assumed with `SELECT *`; `SELECT *` into positional scan after a column was added.

## Safe (do not flag)
- `NOT IN (literal list)` of non-NULL constants; `NOT IN` on a `NOT NULL` column (confirm in schema).
- `LIMIT 1` without `ORDER BY` for existence/any-row checks or where all matching rows are equivalent; `LIMIT` on `EXISTS`.
- `COUNT(*)` vs `COUNT(col)` where column is `NOT NULL`.
- `DISTINCT`/`GROUP BY` collapsing joins when the joined side is provably one-to-one (unique key).
- `SELECT *` in ad-hoc, `EXISTS (SELECT * …)`, or views regenerated on change; `INSERT … SELECT *` between identical tables only if schema is pinned.
- Missing `WHERE` in intentional full-table statements (`TRUNCATE`-like cleanup, test seed, documented backfill) in migrations or fixtures.
- `timestamptz` semantics: Postgres stores UTC and converts on display — not lossy.
- Float columns for non-money measurements (sensor, score, geo).
- Transactional DDL assumptions on Postgres/SQLite migrations; MySQL migrations that are single-statement and atomic enough.
- Empty-result behavior of `SUM` handled by `COALESCE` already in the outer query.
