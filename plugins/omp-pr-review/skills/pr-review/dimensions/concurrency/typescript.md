# Concurrency — TypeScript

## Flag
- `const v = shared.x; await f(); shared.x = v + 1` — each `await` yields to other handlers; lost update. Check: shared is module/instance state reachable by a second request/event, and no mutex/queue/atomic wraps the span. Also `if (!cache.has(k)) { cache.set(k, await load(k)) }` — duplicate loads; fix by caching the promise.
- `Promise.all([...])` over writes/side effects — first rejection rejects the aggregate while siblings keep running and their effects persist; no rollback. Check: effects are non-idempotent or the caller assumes all-or-nothing. Remaining rejections after the first are swallowed (not unhandled).
- `Promise.all(items.map(async …))` on caller-sized input — unbounded concurrency vs. rate limit/pool/fd limits. Check: size is user- or DB-controlled and the callee hits a bounded resource; no `p-limit`/chunking.
- `arr.forEach(async x => await …)` or `.map(async …)` result unused — not awaited; errors become unhandled rejections and caller proceeds early. Check the caller depends on completion.
- Floating promise: `doWork();` / `void doWork()` without `.catch` in a handler or on a path with no process-level handler — unhandled rejection crashes Node ≥15 and Bun by default. Check no `.catch`, no wrapping try/await, and whether `unhandledRejection` is handled in the repo.
- `async` event-listener/`setInterval`/`setTimeout`/`EventEmitter.on` callback that throws — rejection is not routed to the emitter's `error` event; unhandled. Overlapping `setInterval(async …)` runs stack up when the body outlasts the interval.
- `fetch`/`axios`/DB call on a request path with no `AbortSignal.timeout(...)`/timeout option — hangs indefinitely (Node `fetch` has no overall default timeout; headersTimeout ~300s). Check the repo's shared client doesn't set one.
- Abort not propagated: handler receives `req.signal`/`AbortSignal` but passes none to `fetch`/DB/child work; or `controller.abort()` result never checked (`signal.throwIfAborted()`, `signal.aborted` after await). Check a signal is actually available in scope.
- `new AbortController()` listener added with `addEventListener('abort', …)` in a loop without `{ once: true }`/removal — listener accumulation on a long-lived signal.
- Retry loop around `await` with `catch {}` catching `AbortError`/`TimeoutError` and retrying — cancellation swallowed.
- `Promise.race([work, timeout])` — loser keeps running and holding resources; timer not cleared leaks and keeps process alive. Check no abort of `work`.
- `worker_threads`/`Worker` created per request or per item with no pool/terminate; no `'error'`/`'exit'` handler; `postMessage` of large objects in a hot loop; `SharedArrayBuffer` plain read-modify-write instead of `Atomics.*` — races are real here.
- In-process mutex/queue/`Map` lock used to guard a resource across multiple processes/pods/cluster workers (PM2, k8s replicas, serverless) — does not exclude other instances; needs DB/Redis/advisory lock.
- Transaction callback (`prisma.$transaction(async tx => …)`, knex/Drizzle `transaction`) containing `fetch`/external IO, or using the outer client instead of `tx` inside — holds connection/locks during IO (Prisma interactive default timeout 5s) or escapes the transaction.
- Queue/webhook handler (`bull`/`bullmq`/SQS/Stripe) that inserts or charges without checking event/job id — redelivery duplicates. Check for a unique constraint or processed-ids table.
- `process.on('SIGTERM')` absent or calls `process.exit()` before `server.close()`/queue drain on a service where siblings drain; `server.close()` without closing keep-alive connections (`closeIdleConnections`, Node 18.2+).
- React: effect starting async work without cleanup/abort (`useEffect(() => { fetch().then(setState) }, [id])`) — stale response overwrites newer one when `id` changes quickly. Check no `ignore`/abort flag. Not an issue for `use()`, Suspense data libraries, or React Query/SWR which handle it.
- React: `setState(count + 1)` repeated in async callbacks using a stale closure — use the functional updater; check the value is read after an await.

## Safe (do not flag)
- Read-then-write with no `await`/yield between them: single-threaded JS makes the block atomic.
- `await` inside a `for…of` loop for deliberate sequencing; sequential awaits instead of `Promise.all` (performance, not concurrency).
- `Promise.allSettled`/`Promise.all` where effects are idempotent or read-only and input size is small/fixed.
- `void promise` with an explicit `.catch(log)` or inside a function that itself try/catches.
- Caching the in-flight promise (`cache.set(k, load(k))`) — this is the fix, not the bug.
- Per-request objects, closures created per call, and `const` frozen config.
- React 18+/19 StrictMode double-invoked effects in dev; effects with an `ignore` flag/AbortController cleanup.
- Unhandled-rejection concerns in test files, scripts, and CLI entrypoints where a crash is the desired behavior.
- Node 22+ `fetch` without timeout in one-shot scripts.
