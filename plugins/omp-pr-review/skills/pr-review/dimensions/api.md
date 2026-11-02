# API / contract & compatibility review
Covers: breaking changes to any surface other code, clients, operators, or stored data depend on — HTTP/RPC routes, status codes, request/response shapes, exported library symbols, CLI flags, config keys/env vars, event/message schemas, serialized/persisted formats, feature flags, DB schema migrations and data backfills, rolling-deploy compatibility, versioning/deprecation/changelog.
Not covered (other dimension owns it): lock duration/index build cost as a pure perf issue (performance; flag here only the compat/irreversibility angle), authz on routes (security), logic bugs inside handlers (correctness), missing tests (tests), race between concurrent writers (concurrency).

## Method
1. Enumerate every contract surface the diff touches: route tables/OpenAPI/proto/GraphQL schema, exported symbols and package manifests, flag/env/config parsers, event types and topics, serializers/ORM models, migration files, changelog/version files.
2. For each surface, classify the change: removed, renamed, retyped, narrowed accepted input, widened output, changed default/ordering/status code/error shape, changed semantics with same shape, or purely additive-optional.
3. List consumers. In-repo: `lsp` references, then grep for string forms (route paths, JSON keys, env names, topic names) that references miss. External: is the surface public (published package, documented API, mobile/CLI clients, other services' repos)? Check for versioned paths (`/v1`), `CHANGELOG`, release config, `pub`/export markers, semver policy in README.
4. Determine deploy order and mixed-version window: old code + new schema, new code + old schema, old producers + new consumers and vice versa, old clients with new server, stale mobile apps, queued/persisted messages written by the old version. Name which pair breaks.
5. For migrations: read the whole migration plus the code in this PR that reads/writes the affected columns; read earlier migrations in the repo to learn its tooling (transactional DDL? online-DDL helpers? down migrations?) and match it.
6. Check the release mechanics: is a version bump, deprecation shim, changelog entry, or migration of in-repo callers/docs/fixtures missing for a change that needs it?
7. Report only when you can name the consumer (or class of consumer) that breaks and the sequence that breaks it.

## Flag
### Wire/HTTP/RPC
- Field/route removed or renamed, type changed, enum value removed or renumbered, optional → required in a request, nullable → non-null in a response — a named in-repo consumer or a public/versioned surface still uses the old form.
- Status code, error body shape, pagination envelope, sort order, or default changed (e.g. default page size, 404 → 400, 200 → 204) — an in-repo client or documented contract branches on it.
- Same shape, different semantics (units, timezone, ID format, case sensitivity, null-vs-missing) — consumers parse the field in this repo or docs state the old meaning.
- Proto/Avro/Thrift: field number reused or retyped, `required` added, field removed without `reserved` — verify against the schema diff and any `buf breaking`/schema-registry config.
- New required response field read by a new client while the old server is still deployed (client-before-server ordering).
### Library / CLI / config
- Exported symbol removed, renamed, signature changed, or type narrowed/widened in a published package — package is >= 1.0 or states a stability policy, and no deprecation alias/major bump accompanies it.
- CLI flag/subcommand removed or renamed, exit code changed, stdout format changed for machine-readable output — scripts/CI/docs in repo invoke it.
- Config key/env var renamed or default changed with no fallback to the old name — deployment manifests, `.env.example`, Helm/compose files in repo still set the old one.
- Feature flag removed or its default flipped while the old code path is still deployed or the flag is set in a config in repo.
### Events / persisted data
- Event/message schema changed incompatibly while producers and consumers deploy separately, or while old messages remain in a queue/topic/retention window — consumer does not tolerate the old shape.
- Serialized format (cache entries, files, session cookies, JWT claims, pickled/gob/JSON blobs) changed without versioning — old blobs remain readable by new code path (or vice versa during rollback).
- Rollback-unsafe change: new code writes data old code cannot read, so reverting the deploy corrupts or crashes.
### Migrations
- Destructive op (DROP COLUMN/TABLE, TRUNCATE, type narrowing, DELETE backfill) while code from the previous release still reads/writes it — expand/contract violated within one release.
- Column rename in one step; NOT NULL added without default or backfill on a table that already has rows; unique constraint added on data not shown to be unique.
- Irreversible migration (no down, or down drops data) with no backup/rollback note, in a repo whose other migrations are reversible.
- Backfill/data rewrite inside the same transaction as DDL on a large table; migration depends on ORM models that later change; migration not idempotent where the tool may re-run it; ordering/timestamp collision or dependency on a migration not yet merged.
- Index/constraint creation form that blocks writes or fails in the tool's transaction wrapper (see `api/sql.md`).
### Process
- Public breaking change with no version bump, deprecation period, or changelog entry in a repo that maintains them (quote the convention from CHANGELOG/CONTRIBUTING/release config).

## Do not flag
- Internal/private APIs (unexported, `_`-prefixed, `internal/`, `pub(crate)`, module-local) where every caller is updated in this PR — verify callers via `lsp`, not assumption.
- Pre-1.0 / `0.x` libraries or explicitly unstable/experimental/beta surfaces where the repo states no stability guarantee.
- Additive changes: new optional request field, new response field, new endpoint, new enum value on an output a tolerant-reader client ignores (flag only if a consumer exhaustively switches and fails closed), new optional kwarg/flag with the old default.
- Breaking change the PR description or changelog declares intentional with a major bump or version path; flag only a concrete gap (e.g. in-repo caller not updated).
- Strictly internal service-to-service surface deployed atomically from one monorepo release, where no mixed-version window exists.
- Lockfile/generated client/schema output churn that merely reflects the source change already reviewed.
- Speculative "external users might depend on this" for unpublished/private packages and undocumented endpoints with no in-repo consumer.
- Missing `down` migration when the repo has no down migrations at all.
- Test-only, fixture-only, or dev-script surfaces.
- Lock/rewrite cost of a migration on a table not shown to be large; escalate only with evidence (comments, seeds, row counts, sibling migrations treating it as large).

## Severity anchors
- Critical: migration drops/renames a column the still-running previous release reads → errors or data loss during deploy; irreversible destructive migration with no backup path; new code writes persisted format old code cannot read, so rollback corrupts data; event schema change that makes consumers drop or crash on in-flight messages.
- Important: removing a response field or changing a status code used by an in-repo client or versioned public API; renaming an env var/config key with no fallback while manifests in repo set the old name; removing an exported symbol from a >= 1.0 package without major bump; NOT NULL column without default on a populated table.
- Minor: deprecation without a removal timeline or changelog entry in a repo that keeps one; new enum value missing from an in-repo exhaustive consumer that degrades gracefully; migration lacks idempotency guard the tool does not require.

## Language notes
- `skill://pr-review/dimensions/api/typescript.md` — read when diff touches `*.ts`, `*.tsx`, `*.js`, `package.json`, `tsconfig*.json`, OpenAPI/zod schemas.
- `skill://pr-review/dimensions/api/go.md` — read when diff touches `*.go`, `go.mod`, `*.proto`.
- `skill://pr-review/dimensions/api/python.md` — read when diff touches `*.py`, `pyproject.toml`, `setup.cfg`, pydantic/dataclass models.
- `skill://pr-review/dimensions/api/rust.md` — read when diff touches `*.rs`, `Cargo.toml` (features, `rust-version`).
- `skill://pr-review/dimensions/api/sql.md` — read when diff touches `*.sql`, migration directories (Alembic, Rails, Django, Flyway, Prisma, Knex, goose, golang-migrate, diesel), or ORM schema files.
