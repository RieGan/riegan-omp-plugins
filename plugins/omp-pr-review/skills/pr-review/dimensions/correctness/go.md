# Correctness — Go
## Flag
- Nil interface vs typed nil pointer: function with return type `error`/interface returns a `*MyErr` variable that may be nil (`var e *MyErr; … return e`) — `err != nil` is true. Check declared return type and that the pointer var is returned directly.
- Err shadowing: `x, err := f()` inside an inner block/`if`/`for` redeclares `err`, outer `err` stays nil and is returned. Check scope of `:=` and what is returned after.
- Unchecked error: `_ = f()`, call statement dropping an error return, `defer f.Close()` on a *written* file (close error is the flush error), `rows.Err()` not checked after `rows.Next()` loop, `Scan` error ignored.
- `defer` in a loop: runs at function end, holding files/locks/conns across iterations — check iteration count is unbounded; move body to a func.
- `defer` evaluation: arguments evaluated at defer time; `defer mu.Unlock()` placed before a successful `Lock`; deferred closure over named result modifying returned `err` unintentionally; `defer` after early `return` on error (resource not yet opened is fine, opened-before-check is a leak).
- Loop variable capture: for `go.mod` `go` directive < 1.22, `for i, v := range` shares one variable — `go func(){ use(v) }()`, `&v`, appended closures see last value. With `go ≥ 1.22` each iteration has its own copy: do not flag. Check `go.mod` before reporting.
- Range copies: `for _, s := range structs { s.X = 1 }` mutates a copy; `range arr` (array, not slice) copies the array; taking `&v` of range var (pre-1.22) aliases.
- Nil map write panics (`var m map[K]V; m[k]=v`; struct field map never `make`d); reading nil map is fine. Nil slice append is fine.
- Slice aliasing: `append` may or may not reallocate — `b := a[:n]; b = append(b, x)` overwrites `a[n]`; two slices from same backing array both appended; returning internal slice exposes mutation; use full slice expr `a[:n:n]` or `slices.Clone`.
- `copy(dst, src)` copies min(len) — `dst` made with `make([]T, 0, n)` copies nothing.
- Integer: `len()` is int; conversions `int32(x)`/`uint(x)` of negative or large truncate silently; `uint` subtraction underflow (`len(a)-len(b)` on uint); `time.Duration` multiplied by int var needs conversion, `time.Sleep(n * time.Second)` where n float; division of ints truncation.
- `time`: `time.Now().Sub` vs wall clock compare; `==` on `time.Time` (use `Equal`); `Format` layout `2006-01-02` mistakes (`2006-01-02 15:04:05` vs `YYYY`), `AddDate` normalization (Jan 31 + 1 month), local vs UTC zone in `time.Date`.
- String/bytes: `len(s)` is bytes not runes; `s[i]` is a byte; `strings.TrimLeft(s, "abc")` treats cutset not prefix (use `TrimPrefix`); `for i := range s` yields byte offsets of runes.
- `switch` has no fallthrough — case lists needed (`case a, b:`); missing `break` out of `for` from inside `select`/`switch` (`break` exits only the switch); `goto`/labels.
- `errors.Is/As` vs `==`/type assertion on wrapped errors; `fmt.Errorf` with `%v` instead of `%w` loses chain callers use with `errors.Is`; comparing `err.Error()` strings.
- `http.Response.Body` not closed on non-2xx path; body used after `Close`; `io.ReadAll` of unbounded body is a perf/security concern (route elsewhere).
- `json`: unexported fields silently skipped; `omitempty` drops `0`/`false`; `json.Unmarshal` into `interface{}` makes numbers `float64` (ids > 2^53); decode error ignored; `nil` slice marshals `null` vs `[]` when API contract expects array.
- Context: `ctx` not passed to new blocking call; `context.WithCancel` without `defer cancel()` (leak) — leaks beyond correctness go to concurrency.
- `sort.Slice` less function not a strict weak order; `min`/`max`/`clear` builtins (1.21+) shadowed by local names.
- `init` order, package-level var initialization depending on another package's state.

## Safe (do not flag)
- Reading from nil map; `append` to nil slice; `len` of nil slice/map/chan.
- Loop variable capture in `go ≥ 1.22` modules; `for i := range 10` (int range, 1.22+).
- `defer f.Close()` on read-only files; `defer resp.Body.Close()` after the err check.
- `_ =` on `fmt.Fprint*`, `bytes.Buffer.Write`, `strings.Builder.Write`, `hash.Hash.Write` (never error).
- Shadowed `err` in an inner scope where the inner value is fully handled in that scope.
- `if err := f(); err != nil` scoped `err`.
- `panic` in `init`/`main`/`Must*` helpers for unrecoverable setup; `log.Fatal` in `main`.
- Unkeyed struct literals for same-package types; `interface{}` vs `any`.
- Returning typed nil only where the declared return type is the concrete pointer type.
- Zero-value usable types (`sync.Mutex`, `bytes.Buffer`, `strings.Builder`) not initialized.
