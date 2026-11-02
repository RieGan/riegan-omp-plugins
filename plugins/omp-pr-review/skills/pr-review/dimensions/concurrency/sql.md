# Concurrency — SQL

## Flag
- Read-then-write lost update: `SELECT balance …` in app, compute, `UPDATE … SET balance = :new` — two sessions read the same value, one write is lost, at any isolation level below SERIALIZABLE (and under MySQL REPEATABLE READ, which does not prevent it). Fix: `UPDATE t SET n = n + :d WHERE …` (+ `AND n >= :d` check on rows-affected), `SELECT … FOR UPDATE`, or a version column with `WHERE version = :v` and rows-affected check.
- `SELECT … FOR UPDATE` missing where code does check-then-act inside a transaction (`IF stock > 0 THEN UPDATE`); or present but outside a transaction (autocommit releases the lock immediately); or locks via a non-indexed predicate (MySQL InnoDB locks scanned range/gap, can lock the table).
- Existence check then insert (`SELECT 1 …; INSERT …`) without a unique constraint — duplicate rows under concurrency. Needs `UNIQUE` + `INSERT … ON CONFLICT` (Postgres/SQLite) / `ON DUPLICATE KEY UPDATE` (MySQL). Check the unique index exists in the schema/migration.
- Upsert races: `ON CONFLICT DO NOTHING` followed by a `SELECT` expecting the row (may be invisible/uncommitted-deleted); use `DO UPDATE … RETURNING`. Postgres `MERGE` (15+) is not race-free without a unique index (can raise unique violation or insert duplicates); MySQL `INSERT … ON DUPLICATE KEY UPDATE` with multiple unique keys matches unpredictably and takes gap locks that deadlock.
- Inconsistent row/table lock order across statements or code paths (`UPDATE a` then `b` in one path, `b` then `a` in another; batch updates without `ORDER BY id`) — deadlock. Quote both sites. Multi-row `UPDATE`/`DELETE` has no guaranteed lock order; lock explicitly with `SELECT … ORDER BY id FOR UPDATE`.
- Queue-style consumers (`SELECT … LIMIT n` then mark processed) without `FOR UPDATE SKIP LOCKED` (Postgres 9.5+, MySQL 8.0+) — two workers claim the same rows. Check the claim and mark are one atomic statement or one transaction.
- Isolation assumptions: code or comment assumes serializable/snapshot behavior but the connection uses defaults (Postgres READ COMMITTED, MySQL REPEATABLE READ). Postgres REPEATABLE READ/SERIALIZABLE transactions fail with SQLSTATE `40001`/`40P01` — flag when the new code raises isolation but has no retry loop on serialization failure/deadlock (MySQL 1213, 1205).
- Write skew: two transactions each read an invariant across rows (on-call count ≥1, room capacity) and write different rows — passes snapshot isolation. Needs SERIALIZABLE, lock of a parent row, or a constraint.
- Advisory locks: Postgres `pg_advisory_lock` (session-level) in pooled connections (PgBouncer transaction mode) — lock held by a connection the app no longer owns, or released on the wrong one; use `pg_advisory_xact_lock`. Missing unlock on error path; MySQL `GET_LOCK` timeout result unchecked (returns 0/NULL, not an error).
- Long transaction: `BEGIN` … external HTTP call/queue publish/`sleep`/user wait … `COMMIT` — holds row locks and a pool connection; in Postgres blocks vacuum. Side effects inside the transaction fire even if it rolls back; publish after commit (or outbox row in the same transaction).
- Migration hazards under concurrent traffic: `CREATE INDEX` without `CONCURRENTLY` (Postgres, blocks writes; cannot run inside a transaction block), `ALTER TABLE` adding `NOT NULL`/default/FK/`CHECK` that rewrites or validates the table under `ACCESS EXCLUSIVE` lock (Postgres 11+ makes constant defaults cheap; `ADD FOREIGN KEY`/`CHECK` need `NOT VALID` then `VALIDATE`), no `lock_timeout` set so the DDL queues behind a long query and blocks all traffic behind it. Report only for tables that are realistically large/hot.
- Backfill `UPDATE` of whole table in one statement/transaction — long locks, replication lag; needs batching by key range.
- `LOCK TABLE`/table-level DDL inside request transactions; `SELECT … FOR UPDATE` without `NOWAIT`/`SKIP LOCKED`/`lock_timeout` on a user-facing path — requests queue unboundedly.
- Counter/sequence emulation (`SELECT MAX(id)+1`) — duplicates; use sequences/identity. Gap-free numbering via sequences is not possible; flag only when the code assumes it.
- SQLite: `BEGIN` (deferred) that reads then writes upgrades to a write lock and fails with `SQLITE_BUSY` instead of waiting; use `BEGIN IMMEDIATE` and `busy_timeout`; multiple writers without WAL mode.
- Idempotency: INSERT of an external event/payment/webhook with no unique key on event id — redelivery duplicates.

## Safe (do not flag)
- Single atomic statements (`UPDATE … SET n = n + 1`, `INSERT … ON CONFLICT DO UPDATE`) — atomic at any isolation level.
- Read-then-write guarded by `FOR UPDATE`, a unique constraint, a version/CAS check with rows-affected verification, or SERIALIZABLE with retry.
- Read-only transactions and plain reads whose staleness is acceptable (reports, listings).
- Postgres `INSERT … ON CONFLICT DO NOTHING` when the caller does not need the row, or only needs "was it inserted" via `RETURNING`.
- `CREATE INDEX CONCURRENTLY` outside a transaction; `CREATE INDEX` on new/empty/small tables created in the same migration; DDL in a migration for a table not yet in use.
- Short transactions touching one row with no external call.
- READ COMMITTED non-repeatable reads in code that does one read per transaction.
- Deadlock-prone-looking multi-row `UPDATE` on a single row key or with the same deterministic `ORDER BY` in all paths.
- ORM `save()`/`update()` with optimistic-lock version column enabled (Hibernate `@Version`, Rails `lock_version`, EF concurrency token).
