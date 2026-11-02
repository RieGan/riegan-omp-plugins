# Concurrency — Go

## Flag
- Map read/write (or write/write) from multiple goroutines without a mutex/`sync.Map` — runtime `fatal error: concurrent map writes` crashes the process (unrecoverable). Check the map is package-level/struct field reachable from handlers or spawned goroutines, and one access is a write. Concurrent reads only: safe.
- `wg.Add(1)` called inside the goroutine — `wg.Wait()` may run before Add; early return/panic on negative counter. Check Add is not before `go`. (Go 1.25 `wg.Go(func(){…})` handles this.)
- `go func() { … }()` with no join, no `ctx.Done()`, and a channel send/receive that can block forever — goroutine leak per call. Check who receives/sends and whether the channel is buffered for the abandoned case (buffer size 1 on a result channel fixes leak after timeout).
- Function accepts `ctx context.Context` but calls `http.Get`, `db.Query`, `exec.Command`, `http.NewRequest` without `…Context(ctx)` variants, or passes `context.Background()`/`context.TODO()` — cancellation and deadline dropped. Check ctx is in scope at that call and the work is request-scoped.
- `select { case v := <-ch: … }` or bare `ch <- v` in a long-running goroutine with no `case <-ctx.Done()` — cannot stop. Check there is no other stop path (close of `ch` by owner).
- Closing a channel from the receiver, or from multiple senders (`close` twice, send after close → panic). Rule: only the single sender/owner closes. Check every `close(ch)` site and every sender.
- Loop-var capture: Go ≥1.22 (go.mod `go 1.22`+) gives per-iteration `i`/`v`; do not flag. With `go 1.21` or older in go.mod, `go func(){ use(v) }()` in `for … range` races — check the go.mod directive first.
- `errgroup`: `g.Go` goroutines ignoring `gctx` (using outer ctx) so siblings are not cancelled on first error; `g.Wait()` not called or error discarded; unbounded `g.Go` over input without `g.SetLimit(n)`. Using `errgroup.WithContext` ctx after `Wait` returns (already cancelled).
- `context.WithCancel/WithTimeout` where `cancel` is not called/deferred — leaks timer/child context until parent ends (`go vet` lostcancel usually catches; flag when dropped via `_`).
- `mu.Lock()` without `defer mu.Unlock()` and an early return/panic path in between; `Lock` held across channel op, HTTP call, or `time.Sleep`; copying a struct containing `sync.Mutex`/`WaitGroup` by value (value receiver, assignment) — lock state copied.
- Inconsistent lock order between two mutexes (quote both sites); `RWMutex` read lock held while calling a function that takes the write lock (self-deadlock); recursive `RLock` with a pending writer deadlocks.
- Non-atomic access to a counter/flag also modified in another goroutine (`n++`, `if !done {…}`) — use `sync/atomic` types (`atomic.Int64`, Go 1.19+) or a mutex. Mixed atomic and plain access to the same variable.
- Check-then-act with `sync.Map`: `Load` then `Store` — not atomic; use `LoadOrStore`/`CompareAndSwap`.
- `time.After` in a loop `select` — each iteration allocates a timer; pre-Go 1.23 not collected until it fires (leak under load). Go 1.23+ collects unreferenced timers; do not flag there.
- `http.Client{}`/`http.Server{}` with zero Timeout / no `ReadHeaderTimeout` on a service path; `http.DefaultClient` for outbound calls without a ctx deadline.
- Unbuffered/unbounded work: `go handle(item)` per item from an external source with no semaphore (`chan struct{}` or `SetLimit`); channel of results never drained after early return.
- Worker started with `go` in `main`/constructor, with no stop on `Shutdown`; `os.Exit`/`log.Fatal` bypassing deferred cleanup and `srv.Shutdown(ctx)`; `signal.NotifyContext` ctx not used by workers.
- Panic in a spawned goroutine with no `recover` takes down the whole process; flag in request-spawned goroutines when siblings recover.
- Retry on `ctx.Err()`; `time.Sleep` backoff ignoring ctx (use `select` on `ctx.Done()` and `time.After`/timer).
- `sql.Tx` held while calling external services; `tx` not rolled back on error paths (`defer tx.Rollback()` after Begin is the idiom; no-op after Commit).

## Safe (do not flag)
- Loop variable capture in Go ≥1.22 modules.
- `defer mu.Unlock()` immediately after `Lock()`; holding a mutex across pure in-memory work.
- Map written only before goroutines start (or guarded by `sync.Once`) and read-only afterward.
- `sync.WaitGroup` with `Add` before `go`, or `wg.Go` (1.25+).
- Goroutines that end when a channel they range over is closed by its sole owner, or at process exit in `main`/tests.
- `context.Background()` in `main`, `init`, tests, and top-level workers with no parent ctx.
- `defer cancel()` right after `WithTimeout`; `defer tx.Rollback()` after `Commit`.
- Unbuffered channels used for rendezvous with matching receivers on all paths.
- `time.After` in loops on Go 1.23+ (go.mod `go 1.23`+).
- `sync/atomic` typed values and `atomic.Value` used for read-mostly config swap.
- `http.Client` default with per-request `context.WithTimeout` in the request.
