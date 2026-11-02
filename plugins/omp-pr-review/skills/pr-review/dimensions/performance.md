# Performance review
Covers: complexity regressions, N+1 calls, unbounded loads/queries, hot-loop allocation, blocking IO, serial independent IO, missing indexes, cache growth/absence on hot paths, unbounded fan-out, missing timeouts, frontend payload/bundle size, resource leaks, DDL lock duration.
Not covered (other dimension owns it): cache staleness/invalidation correctness, data races and lock ordering (correctness / concurrency); SQL injection or DoS-as-attack (security); API shape (api); style-level "cleaner" rewrites (structure).

## Method
1. Classify each changed code path as hot or cold. Hot: request/RPC handlers, queue consumers, render paths, loops over user- or tenant-scaled data, per-event callbacks, DB queries run per request. Cold: startup/init, CLI one-shot, migrations' data, admin/maintenance scripts, tests, fixtures, dev tooling, error-only branches. Report only hot paths, plus cold paths whose runtime scales with prod data and could exhaust memory or hold locks.
2. For each hot path, name N: what grows (rows, items per user, payload bytes, concurrent requests) and a realistic magnitude read from schema, config, pagination caps, fixtures, or docs. No N you can justify, no finding.
3. Compare before/after: what was the cost class before the diff (O(1) query, O(n) loop, bounded page) and after. A regression is a change in class or in call count per unit of N, not a pre-existing cost the diff merely touches.
4. Trace loops: every call inside a loop body (including callees one or two levels deep, ORM attribute access, `await`, `fetch`) - does it do IO or O(n) work per iteration?
5. Trace queries: new/changed predicate, ORDER BY, JOIN column -> find the schema/migration for a usable index; check LIMIT/pagination and result consumption.
6. Check lifetimes of anything added to module/global/static/long-lived state (caches, maps, listeners, timers, subscriptions): is there a bound, eviction, or removal?
7. Check external calls (HTTP, DB, RPC): timeout, concurrency bound, and whether they are on the request path.
8. Frontend: what is added to the initial bundle (new dependency, top-level import) and to the render path.
9. Estimate the consequence in the finding: "N=10k rows -> 10k queries ~ 10-30s at 1-3ms each", not "slower".

## Flag
### Algorithmic
- Nested iteration, `includes`/`in list`/`indexOf`/`find` inside a loop, sort inside a loop, repeated full-collection scans -- N is user/tenant-scaled and N >= ~1e3-1e4 reachable; quote both loops.
- Recomputing a loop-invariant that is expensive (regex compile, parse, config read, query) per iteration -- loop body runs per item of scaled data.
- String/array rebuilt by repeated copy (`acc = [...acc, x]`, `s = s + x` on non-optimized types, `slice` chains) in a loop -- quadratic at realistic N.

### IO and queries
- N+1: DB query, ORM lazy attribute load, or HTTP/RPC call per item in a loop or per element of a mapped collection -- show the per-item call and the source of the collection; a batch/JOIN/`IN` alternative exists.
- Independent awaits/IO executed serially (`await a(); await b();` with no data dependency) on a request path -- both are network/disk IO, and nothing requires order or rollback sequencing.
- Unbounded read: query without LIMIT/pagination on a list endpoint, `findAll`/`SELECT *` of a growing table, whole-file `read()`/`readFile` of user-sized or log-sized files, loading full result set to filter in app code -- table/file grows with usage; name the growth source.
- Offset pagination (`OFFSET n`) deep into large tables, or `COUNT(*)` on every page request over a large table -- table >= ~1e5 rows.
- New query predicate/order/join on an unindexed column of a large or growing table -- find the table's index definitions and the row-count evidence; also FK columns used in joins/deletes.
- Sync/blocking call on the event loop or async executor (sync fs, sync crypto, sync HTTP, CPU loops over large payloads) on a request path.
- External call with no timeout on a request path, or retries without backoff/cap -- default is infinite/very long for that client; name the client's default.
- Unbounded fan-out: `Promise.all`/spawn/goroutine/`gather` over a user-sized collection with no limit, hitting DB or a rate-limited service -- collection size is user-controlled.

### Memory and resources
- Hot-loop allocation: per-iteration object/buffer/closure/clone creation that could be hoisted or reused -- loop is per request item at N >= 1e4, or per frame/event; not for one-off loops.
- Unbounded growth: module/global map or cache keyed by request-derived values (user id, URL, query string) with no eviction/TTL/size cap.
- Leaks: `addEventListener`/`on`/subscribe/`setInterval` registered per call or per mount without matching removal; unclosed files/connections/response bodies on a repeated path.
- Caching: new expensive computation or external fetch on a hot path, repeated with identical inputs across requests, with an existing cache facility in the repo unused -- or a new in-process cache that is per-instance where the repo uses a shared one.

### Frontend
- New heavy dependency imported at top level of an entry/route chunk (whole-library import like `import _ from 'lodash'`, moment locales, full icon packs) when a lighter/subpath import or lazy import is the repo's pattern -- cite approximate added size.
- Render-path work: expensive computation on every render with changing deps, state updates causing re-render of a large list, lists without virtualization at N >= ~1e3 items.
- Images/assets added uncompressed and large on the critical path -- cite size.

### DDL
- Migration holding long locks on a large table: index creation that blocks writes, table rewrite, full-scan validation under ACCESS EXCLUSIVE -- table is large in prod (say how you know) and the engine/version's semantics are checked in the sql language file.

## Do not flag
- Micro-optimizations: `for` vs `map`, `+=` vs `join` on small strings, `Vec` preallocation, struct field ordering, destructuring cost, `forEach` vs `for...of`.
- Anything lacking a scale trigger. "Could be faster", "may not scale", "consider caching" without a named N and a before/after cost class.
- Cold paths: startup, one-shot CLI, build scripts, migrations' own data steps on small lookup tables, admin/backfill scripts, tests/fixtures/benchmarks, error-path-only code.
- Loops over inherently small or bounded collections (enum values, config entries, page-size-capped lists <= ~100, fixed route tables) even if nested.
- N+1 where the "loop" is over <= ~10 items by construction, or the per-item call is an in-memory/cached lookup.
- Serial awaits that have a real ordering dependency, share a transaction/connection, or must respect rate limits; serial operations in tests.
- Premature caching/memoization suggestions; `useMemo`/`useCallback` absence where the child is not memoized or React Compiler is enabled in the repo.
- Missing index where the table is demonstrably tiny/static, the predicate is already served by a leading column of an existing composite, or the query is an admin report.
- Pre-existing slow code merely moved or reindented in the diff.
- Readability-vs-speed tradeoffs the author documented; benchmarks-in-PR-description showing no regression.
- Choice of data structure/algorithm within the same complexity class; constant-factor guesses.
- Memory "could be large" for values bounded by validated input limits (body-size caps, max page size) that you have read.
- Lock/contention concerns that need interleaving analysis -> concurrency dimension.

## Severity anchors
- Critical: per-request query/call loop over an unbounded user collection on a main endpoint (timeouts/outage at prod N); unbounded in-memory load of a table or upload that can OOM the service; migration rewriting/blocking writes on a core multi-million-row table in the deploy path.
- Important: N+1 on a list endpoint with realistic N=100-1k; missing index for a new filter on a >1e5-row table; sync fs/crypto call on the event loop in a handler; no timeout on a new external call in the request path; per-key global cache with no eviction; whole-library import adding >100 KB to the initial bundle.
- Minor: independent awaits serialized on a low-traffic endpoint (adds one extra RTT); per-render recomputation of a moderately costly value; listener added without removal in a component that mounts rarely; SELECT * pulling a few unused wide columns.

## Language notes
- `skill://pr-review/dimensions/performance/typescript.md` -- read when diff touches *.ts, *.tsx, *.js, *.jsx, package.json, bundler config.
- `skill://pr-review/dimensions/performance/go.md` -- read when diff touches *.go.
- `skill://pr-review/dimensions/performance/python.md` -- read when diff touches *.py, Django/SQLAlchemy/pandas code.
- `skill://pr-review/dimensions/performance/rust.md` -- read when diff touches *.rs, Cargo.toml.
- `skill://pr-review/dimensions/performance/sql.md` -- read when diff touches *.sql, migrations, ORM query builders, schema files, or raw query strings.
