# Tests — Go

## Flag
- `t.Parallel()` inside a `for _, tc := range cases` subtest closure using `tc` directly — with `go` directive < 1.22 in `go.mod` every parallel subtest sees the last case, so only the last case is tested. Check `go.mod` (`go 1.22`+ gives per-iteration variables; then do not flag).
- Goroutines in a test that call `t.Fatal`/`t.FailNow`/`t.Skip` — they only stop the calling goroutine and may run after the test ends (panic: "Log in goroutine after Test… has completed"). Use `t.Error` + return or send errors on a channel.
- Assertions inside a goroutine/callback that the test does not wait for (`sync.WaitGroup`, channel) — test returns green before they run.
- Table tests sharing state: pointer/slice/map/struct in the table reused or mutated across cases, or a package-level var/`os.Setenv` changed without `t.Setenv`/`t.Cleanup` — later cases see earlier mutation; breaks under `-shuffle`/`-count=N`. Name the shared field.
- `httptest.NewServer`/`NewTLSServer`, listeners, temp files/`os.MkdirTemp`, `time.NewTicker`, started goroutines with no `defer srv.Close()`/`t.Cleanup` — leaks across tests and flakes under `-count`. Prefer `t.TempDir()`. Report when a later test reuses the resource or the leaked goroutine touches test state.
- `time.Sleep` to wait for goroutines/ready state instead of channel, `sync.WaitGroup`, polling with deadline (`require.Eventually`), or `testing/synctest` (experimental in 1.24 behind `GOEXPERIMENT=synctest`, GA in 1.25).
- Real `time.Now()`, `time.Local`, `rand` without seed (`math/rand` unseeded is random since 1.20), map-iteration order (Go randomizes it) compared to an expected slice/string without sorting.
- Assertion compares error with `err != nil` only where the change is about *which* error/message/type — passes on any error. Prefer `errors.Is`/`errors.As` on the sentinel/type under change.
- `if err == nil { t.Fatal }` missing for expected-failure cases: table has `wantErr bool` but the check only runs when `err != nil`, so a returned nil error passes.
- Comparing with `reflect.DeepEqual`/`cmp.Diff` against the value the function mutated in place, or against the input itself — vacuous.
- Mock-only assertion: gomock `EXPECT().Times(1)`/testify mock `AssertCalled` as the only check while returned value/state is unasserted; `mock.Anything` matchers over the argument the change is about; `gomock.Any()` hiding the changed argument.
- Subtests with `t.Run` where a case's `name` is duplicated or empty — Go suffixes `#01`, filtered runs (`-run`) can't target it; report only if it causes missed execution.
- `t.Skip`/`testing.Short()` guard added around a test that CI runs with `-short`, or `t.Skip()` with no reason; `//go:build integration` tag newly added to existing tests — they stop running in default `go test ./...`. Check CI/Makefile for the tag.
- `TestMain` that calls `os.Exit` without `m.Run()` result or skips cleanup; global setup that every package test now depends on.
- `-race` relevance: new concurrent production code (goroutines, shared maps, mutex-protected fields) whose tests run only one goroutine — races can't be detected by the race detector. Name the shared variable and the two accessors; confirm CI doesn't use `-race` only if visible in the Makefile/workflow.
- Golden-file updates (`testdata/*.golden`, `-update` flag) in the diff with wrong or unrelated content; test that rewrites its own golden file on every run.
- Test helper exposed in production file (`export_test.go` is fine; a non-`_test` file with `func SetXForTest`) altering package state.

## Safe (do not flag)
- Missing `t.Helper()` in helpers — a nit, never report.
- `tc := tc` copies in Go ≥ 1.22 modules (redundant, harmless) and their absence in ≥ 1.22 modules.
- `t.Parallel()` on subtests that do not share mutable state; `t.Parallel()` absent entirely.
- `t.Fatal` in the test goroutine (the one running the Test function), including subtests' own goroutines.
- `httptest.NewRecorder`/`httptest.NewRequest` (no server to close); `httptest.NewServer` with `t.Cleanup(srv.Close)` or `defer srv.Close()`.
- `t.Setenv`, `t.TempDir`, `t.Chdir` (1.24), `t.Context()` (1.24) — auto-cleaned (note `t.Setenv` panics with `t.Parallel`; that is a failure to flag only if a test combines them).
- Reusing one expensive fixture read-only across cases; `sort.Strings` before comparing map-derived output.
- `reflect.DeepEqual`/`cmp.Diff` on values with unexported fields via `cmpopts` options; `cmpopts.IgnoreFields` for timestamps/IDs.
- Using `time.Sleep(0)`/tiny sleeps in test fakes that implement a clock; `time.After` with large safety timeouts in a select that expects an event.
- Fuzz seeds (`f.Add`) and `testdata/fuzz` corpus files added by the toolchain.
