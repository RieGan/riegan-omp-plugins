# Performance — Go

## Flag
- DB/HTTP/RPC call per item inside a `for ... range` over a request- or user-scaled slice (`db.QueryRowContext`, gorm `First`/`Find`, `http.Client.Do`) -- N round trips; fix: `WHERE id = ANY($1)`/`IN`, batch endpoint, errgroup with `SetLimit`.
- `regexp.MustCompile`/`regexp.Compile` inside a function called per request/per item (not at package level) -- compile cost each call; check the pattern is constant. Package-level `var re = regexp.MustCompile(...)` is the fix.
- String building: `s += x` in a loop over scaled data (quadratic copy) -- fix: `strings.Builder`/`bytes.Buffer`, with `Grow` only when N is known and large. A one-off concat of 2-3 strings is fine.
- `append` growth in a hot loop with known final size and large N (>= ~1e4) with no `make([]T, 0, n)` -- flag only if the loop is per request and the slice is large; otherwise skip.
- `fmt.Sprintf` / `fmt.Sprint` per element for simple conversions in tight loops over large data (use `strconv`) -- need N >= 1e5 on a hot path; otherwise do not flag.
- Reading whole bodies/files: `io.ReadAll(r.Body)`/`os.ReadFile` on user-supplied streams with no `http.MaxBytesReader`/`io.LimitReader` -- memory per request; for large files prefer `bufio`/streaming/`json.NewDecoder`.
- `json.Marshal`/`Unmarshal` of large payloads repeated per item inside loops; `reflect`-heavy code on a hot path with N large.
- Missing timeouts: `http.Client{}` without `Timeout`, `http.Get`/`DefaultClient`, `http.Server` without `ReadHeaderTimeout`, DB calls without `context` deadline on a request path -- Go defaults are no timeout.
- Response body not closed / not drained (`resp.Body.Close()` missing) on a repeated path -- leaks connections, prevents keep-alive reuse; `rows.Close()` missing for `db.Query`; check `defer` placement.
- Goroutine fan-out per item (`go func(){...}()` in a loop over user-sized input) with no limiter (`errgroup.SetLimit`, semaphore channel, worker pool) -- unbounded goroutines/connections.
- Goroutine/ticker leaks: `time.NewTicker` without `Stop`, `time.After` in a `for-select` loop on a long-lived loop (each iteration allocates a timer until it fires; fixed in Go 1.23 where unreferenced timers are GC'd -- check `go` directive in go.mod before flagging), goroutine blocked forever on unbuffered channel send with abandoned receiver.
- `sync.Pool` misuse: pooling tiny/cheap objects, putting back objects still referenced (aliasing; correctness), storing pointers to large-capacity buffers that retain memory, or not resetting -- flag only with a concrete perf or retention consequence.
- Channels: unbuffered channel between producer and consumer on a throughput-critical pipeline where each handoff blocks the producer -- only with a measured/obvious hot loop (per-item at >= 1e5/s). Buffer size picked arbitrarily is not a finding.
- Large struct passed/copied by value in a hot loop (`for _, v := range bigStructs` copying hundreds of bytes per iteration at large N) -- only when N and size are both substantial.
- Unbounded in-memory maps/slices as caches keyed by request data with no eviction; `map` never deleted from in a long-lived service.
- `time.Sleep` polling loops on request path instead of channel/cond; `select` with `default` busy loop burning CPU.

## Safe (do not flag)
- `defer` in a loop body function or hot function: since Go 1.14 open-coded defers make the cost negligible. (A `defer` inside a `for` loop that accumulates until function return -- e.g. `defer f.Close()` per iteration -- is a resource-lifetime problem, not a speed one; report as a leak only with large N.)
- Loop variable capture: Go 1.22+ gives per-iteration `for` variables; do not claim a shared-variable bug or allocation cost based on pre-1.22 semantics. Check `go.mod`'s `go` line.
- `[]byte`<->`string` conversions, small `append` without prealloc, `fmt.Sprintf` in non-hot paths, logging formatting.
- Buffered vs unbuffered channel choice without a demonstrated throughput bottleneck; `sync.Mutex` vs `sync.RWMutex` choice.
- `strings.Builder`-less concatenation of a fixed number of operands (`a + b + c`).
- `regexp` compiled at package init or in `main`/`init`/constructor called once; `MustCompile` in tests.
- Ranging over a map/slice <= ~1e3 elements; `reflect` in startup/registration code.
- `http.DefaultTransport` connection pooling defaults; `errgroup` without `SetLimit` over a small fixed set.
- gorm/sqlx `Preload`/joins already present -- verify the per-item call is really a query before claiming N+1.
