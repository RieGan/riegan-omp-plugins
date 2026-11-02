# Concurrency & reliability review

Covers: shared-state races, check-then-act/TOCTOU, non-atomic read-modify-write, lock ordering/deadlock, locks held across IO/await, goroutine/task/thread leaks, missing cancellation/timeouts, channel/queue misuse, unbounded buffering, idempotency of retried operations/webhooks/consumers, retry policy, partial failure across services, transaction boundaries, distributed locks, graceful shutdown.
Not covered (other dimension owns it): algorithmic/latency cost without a correctness defect (performance); logic errors in single-threaded flow (correctness); authz/injection (security); public contract breaks (api); missing tests (tests).

## Method
1. List every concurrent entry point the change adds or touches: HTTP/RPC handlers, workers, goroutines, spawned async tasks, threads, cron/schedulers, queue/webhook consumers, signal/shutdown hooks, retry wrappers.
2. For each, list the shared state it reaches: module/global/static vars, singletons, caches, instance fields on long-lived objects, files, DB rows, external resources (queues, locks, S3 keys). Discard per-request, stack-local, or immutable data.
3. For each shared item, identify every other entry point that reads or writes it (grep/lsp references). A race needs two actors; name both.
4. Construct a concrete interleaving: `A reads X; B writes X; A writes X+1` with real function names and the yield point (await, IO, lock release, goroutine switch, txn boundary) that permits it. No interleaving, no finding.
5. For every lock: where acquired, where released on every path (error, panic, early return, cancellation), what runs while held (IO, await, callbacks, other locks), acquisition order vs. other sites.
6. For every spawned unit: who awaits/joins it, how it stops (context, signal, channel close), what happens to its error, what bounds its count.
7. For every retried or redelivered operation (retry loop, queue consumer, webhook, cron overlap, client double-submit): is repeating it safe? Find the idempotency key, upsert, or dedupe table; if absent, walk the second delivery.
8. For every cross-service/multi-step write: kill the process after each step; is the state recoverable or a duplicate-producing half-state? Compare with the repo's existing outbox/saga/idempotency pattern.
9. For every external call: find the timeout and cancellation path; compare with how sibling calls in the repo set them.

## Flag
### Shared state
- Read-modify-write on shared state across a yield point (`await`, IO, lock release) — name the two actors and the lost-update outcome.
- Check-then-act (exists→create, balance check→debit, `if !cache[k] {cache[k]=…}`) with no lock/unique constraint/atomic op — second actor between check and act.
- Lazy init or singleton creation reachable from concurrent callers without once/lock/promise-sharing — double init with side effects.
- Unsynchronized map/slice/collection mutation from multiple threads/goroutines — see language file for what is actually unsafe.
- Shared state mutated in a callback/hook registered on a long-lived object while another path iterates it.

### Locks and deadlock
- Two code paths taking the same locks in different orders — quote both sites.
- Lock held across network/disk IO, `await`, channel send, or user callback — consequence is stall of all waiters or self-deadlock on re-entry.
- Lock not released on error/early-return/panic path (no `defer`/`finally`/RAII guard).
- Non-reentrant lock re-acquired by a callee on the same path.
- Distributed lock without TTL, without fencing token, or released by a non-owner; TTL shorter than the guarded work.

### Lifecycle and cancellation
- Spawned goroutine/task/thread with no join, no stop signal, or blocked forever on a channel/queue nobody drains — leak per request/event.
- Unbounded fan-out (`spawn` per item/request) with no semaphore/pool on input the caller controls.
- Unbounded queue/channel/buffer between a faster producer and slower consumer, with no backpressure or drop policy.
- Cancellation/deadline not propagated: request-scoped work started with a fresh/background context, or a signal/abort not forwarded to the downstream call.
- Blocking wait with no timeout on an external dependency in a request path.
- Shutdown path that drops in-flight work (exit before drain), or workers started with no stop hook where siblings have one.
- Errors from background tasks discarded (unobserved rejection, ignored `Result`, goroutine error not collected) so failure is silent.

### Retries and idempotency
- Retry of a non-idempotent operation (charge, send, insert without key) on timeout/5xx — a timeout does not mean the first attempt failed.
- Retry loop with no cap, no backoff, or no jitter against a shared dependency — synchronized retry storm; report only when the loop is new or its policy changed.
- Retrying non-retryable errors (4xx, validation) or swallowing the cancellation error inside the retry loop.
- At-least-once consumer/webhook handler whose side effects are not deduplicated (no event-id check, no unique constraint, no upsert), or dedupe check separated from the effect by a non-atomic gap.
- Ack/commit before processing completes (loss) or after side effects with no dedupe (duplicates) — match to the repo's stated delivery guarantee.
- Cron/scheduled job with no overlap guard when runtime can exceed the interval, or runs on every replica when it must be singular.

### Transactions and partial failure
- DB transaction held open across network call, `await` of external work, or user wait — pool exhaustion, lock holding.
- Read-then-write inside a transaction at default isolation with no row lock/atomic UPDATE/version check, on data another writer changes.
- DB write plus message publish (or two services) with no outbox/compensation — crash between them leaves divergence; flag when the repo already has the pattern elsewhere or the loss is data-affecting.
- Partial failure of a batch (`Promise.all`, loop of writes) leaves some applied with no rollback, resume, or report.
- Side effect (email, charge, publish) performed inside a transaction that can still roll back or retry.

## Do not flag
- Races with no constructible interleaving, or "this might not be thread-safe" without naming the second actor.
- Single-threaded contexts: JS/TS between two `await`s in one synchronous block; Python asyncio code with no await between read and write; code confined to one goroutine/thread/actor.
- Per-request, stack-local, freshly constructed, or immutable/frozen data; state written once before publication (before goroutines start).
- Module-level state initialized at import/startup and only read afterward.
- Missing timeout/retry on calls where the repo's HTTP/DB client or framework applies a default you can see in config or the client constructor.
- Fire-and-forget on purpose with a comment, or best-effort telemetry/logging/metrics where loss is stated acceptable.
- Retries layered on operations that are idempotent by key or method (PUT, DELETE, upsert, conditional write) — verify the key, then drop.
- "Use a mutex/channel/atomic instead" style preferences when the existing synchronization is already correct.
- Lock-free structures from the standard library or well-known crates/packages used as documented.
- Missing graceful shutdown in scripts, CLIs, tests, and one-shot jobs.
- Theoretical memory-model reorderings on x86-typical code with proper sync primitives present.
- Pool/concurrency sizing opinions without a concrete exhaustion path (performance owns throughput).

## Severity anchors
- Critical: non-idempotent payment/email/provisioning retried on timeout with no key; lost update on balance/inventory/counter that is read then written outside a lock or atomic UPDATE; inconsistent lock order between two hot paths producing deadlock; transaction + publish where crash loses a committed order's event.
- Important: goroutine/task leaked per request (unreachable channel, no cancel); request path calls external service with no timeout; webhook consumer inserts without dedupe so redelivery duplicates rows; lock held across `await` of remote call on a shared resource; unbounded `Promise.all` over caller-sized input hitting a rate-limited API.
- Minor: retry loop lacks jitter but caps attempts at 3 on a low-traffic path; background error logged but not surfaced; cron overlap possible only when runtime is 10× expected; missing `defer unlock` on a path that cannot currently error.

## Language notes
- `skill://pr-review/dimensions/concurrency/typescript.md` — read when diff has *.ts, *.tsx, *.js, *.mjs, package.json (Node/Bun/React async, workers).
- `skill://pr-review/dimensions/concurrency/go.md` — read when diff has *.go, go.mod.
- `skill://pr-review/dimensions/concurrency/python.md` — read when diff has *.py (asyncio, threading, multiprocessing, Celery).
- `skill://pr-review/dimensions/concurrency/rust.md` — read when diff has *.rs, Cargo.toml (std/tokio sync, unsafe Send/Sync).
- `skill://pr-review/dimensions/concurrency/sql.md` — read when diff has *.sql, migrations, or ORM/raw queries inside transactions or upserts.
