# API — SQL & DB migrations
Focus is compatibility, reversibility, and deploy order. Pure lock-duration/index cost belongs to performance; flag here only when the form is wrong for the tool or breaks mixed-version deploys.

## Flag
### Expand / contract (all engines)
- `DROP COLUMN`/`DROP TABLE`/`RENAME COLUMN`/`RENAME TABLE`/type change in the same release as the code stopping its use — during rolling deploy the old release still queries the old name. Required sequence: expand (add new, dual-write, backfill) → switch reads → stop writes → contract in a later release. Find old-code readers via grep on the column name in the pre-PR tree (ORM models, raw SQL, views, reports, other services' repos listed in the monorepo).
- `ADD COLUMN ... NOT NULL` without a `DEFAULT` on an existing table — fails if rows exist (Postgres/MySQL strict) or, in SQLite, is rejected outright; also breaks old code that INSERTs without the column. Fix: add nullable (or with default), backfill, then enforce.
- New `UNIQUE`/`CHECK`/`FOREIGN KEY` constraint, or `NOT NULL` on existing column, with no prior check/dedup/backfill step — migration fails mid-deploy on legacy rows. Report with the specific column and evidence that violating data is plausible (nullable column previously written with nulls, no existing unique index).
- Narrowing type/length (`varchar(255)`→`varchar(50)`, `bigint`→`int`, `text`→enum, `timestamptz`→`timestamp`) — truncation/failure/data loss.
- Enum/CHECK value removed while rows or old code still use it.
- Data backfill (`UPDATE` over the whole table, `DELETE`) in the same transaction/migration as DDL on a large table — long locks, one giant transaction, no resume. Prefer batched backfill outside the schema migration.
- Irreversible migration (`down` missing/raises/drops data) in a repo where other migrations are reversible, with no backup/rollback note; `down` that does not restore dropped data.
- Migration references application models/enums that will change later (breaks on fresh replay); raw `INSERT`/seed relying on current code; non-idempotent steps where the tool may retry (missing `IF NOT EXISTS`/`IF EXISTS` only where the repo's convention uses them).
- Ordering: new migration timestamp/number collides or sorts before an already-applied one; depends on an object created in an unmerged/later migration; two heads (Alembic multiple heads, Django conflicting leaf nodes, Rails duplicate version).
- Schema change with no matching ORM model/migration counterpart (model edited, migration missing, or vice versa); Prisma/Drizzle/Django `makemigrations --check` drift.
- Views, triggers, functions, stored procs, or materialized views depending on the altered column — `DROP`/type change fails or silently breaks them.
### PostgreSQL
- `CREATE INDEX` on a populated table without `CONCURRENTLY` blocks writes for the build; `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY` / `REINDEX CONCURRENTLY` inside a transaction block errors. Check the tool: Rails needs `disable_ddl_transaction!`; Alembic needs `with op.get_context().autocommit_block()` (or `postgresql_concurrently=True` inside it); Flyway needs `executeInTransaction=false`; Django needs `atomic = False` (use `AddIndexConcurrently`); golang-migrate/goose run a multi-statement file in a transaction unless configured otherwise (goose: `-- +goose NO TRANSACTION`). A failed concurrent build leaves an `INVALID` index that must be dropped.
- `ADD COLUMN` with a constant default is metadata-only since PG 11 (do not flag as a rewrite); a volatile default (`random()`, `clock_timestamp()`, `gen_random_uuid()`) forces a full table rewrite under `ACCESS EXCLUSIVE`. `now()` is stable, so fast.
- `ALTER COLUMN ... TYPE` rewrites the table unless binary-coercible (e.g. `varchar(n)` → larger/unbounded `varchar`/`text`; PG 9.2+). `SET NOT NULL` scans the table under `ACCESS EXCLUSIVE`; on PG 12+ it skips the scan if a validated `CHECK (col IS NOT NULL)` exists — safe pattern is `ADD CONSTRAINT ... CHECK (...) NOT VALID`, `VALIDATE CONSTRAINT`, then `SET NOT NULL`. Same `NOT VALID` → `VALIDATE` pattern for foreign keys.
- No `lock_timeout`/`statement_timeout` guard on DDL needing `ACCESS EXCLUSIVE` on a hot table when the repo's other migrations set one — queued lock blocks all traffic.
- Renaming a column/table breaks old code instantly; Postgres has no alias. Expand-contract with a view or dual columns.
### MySQL / MariaDB
- DDL implicitly commits and is not transactional — a failed multi-statement migration leaves a half-applied schema; check for re-run safety.
- Engine/version-dependent algorithm: MySQL 8.0.12+ `ALGORITHM=INSTANT` for add column (8.0.29+ also drop column/any position); otherwise `INPLACE` or table `COPY` (blocks writes). Large-table `ALTER` with no explicit `ALGORITHM=`/`LOCK=` clause, or via a tool (gh-ost/pt-osc/Vitess) the repo normally uses, is worth flagging only with a size signal.
- `ADD COLUMN NOT NULL` without default on non-strict `sql_mode` silently fills implicit defaults (`0`, `''`); changing `utf8` → `utf8mb4`/collation changes index length limits and comparison semantics (unique violations).
- Implicit conversion from `ENUM` reorder/removal remaps stored ordinals.
### SQLite
- No `ALTER COLUMN`/`ADD CONSTRAINT`; changes require the rebuild pattern (create new, copy, drop, rename) inside a transaction with `PRAGMA foreign_keys=OFF`/`foreign_key_check`. `DROP COLUMN` (3.35+) fails on indexed/PK/FK/used-in-view columns; `RENAME COLUMN` (3.25+) rewrites references. `NOT NULL` add requires a non-null default.

## Safe (do not flag)
- Add nullable column, add column with constant default (PG 11+, MySQL 8 INSTANT), add table, add index on an empty/new table or created in the same migration, add enum value (`ALTER TYPE ... ADD VALUE` — only flag use in same transaction on PG < 12).
- Destructive drop in a contract migration whose expand/stop-using steps are in an earlier merged release (cite the evidence) or for a column nothing reads (grep proves it).
- Dev/test/seed schemas, local-only SQLite caches, ephemeral/rebuilt data stores, tables new in the same PR.
- Non-concurrent `CREATE INDEX` on small/new tables, or where the repo's migrations consistently do so and the table is not shown to be large.
- Missing `down` migration when the repo has no down migrations; missing `IF NOT EXISTS` when the tool guarantees once-only application.
- Generated schema dumps (`schema.rb`, `structure.sql`, `schema.prisma` snapshot) that mirror an already-reviewed migration.
