# Tests — Rust

## Flag
- `#[should_panic]` with no `expected = "…"` — passes on any panic, including an unrelated `unwrap` on setup, index error, or a failing assert elsewhere in the test. Report when the test body has more than the one call under test. Also: `expected` text that matches a substring present in many panics (`"called `Result::unwrap()`"`).
- Prefer-over check: `should_panic` used where the function returns `Result` and the change is about the error variant — test never checks the variant; look for `assert!(matches!(err, E::Variant))` or `assert_eq!`.
- `assert!(result.is_err())` / `.is_ok()` as the sole check when the change is about the specific error/value — passes on any error. Check whether the variant/message is the PR's point.
- `let _ = fallible()` / `.ok()` / `if let Ok(x) = …` in a test with no `else` assertion — failure ignored; test passes with an `Err`.
- Test returns `Result<(), E>` and uses `?` — fine — but a test whose assertions sit inside `if let Some(..)`/`for` over a possibly empty iterator, or inside a closure never invoked, is vacuous. Check the collection is non-empty.
- Dependence on `HashMap`/`HashSet` iteration order (randomized per process by `RandomState`) — comparing `.iter().collect::<Vec<_>>()`, joined strings, or serialized output to a literal. Check no `BTreeMap`/sort before compare.
- `#[tokio::test]` defaults to a single-threaded (`current_thread`) runtime: tests that use `spawn_blocking`/`block_in_place` (panics on current_thread) or rely on true parallelism/`std::thread::sleep` blocking the only thread will deadlock or time out. Check for `#[tokio::test(flavor = "multi_thread", worker_threads = N)]` where production code needs it. Conversely, a race/ordering bug in code with `Send` tasks is masked by `current_thread`; name the interleaving before reporting.
- `tokio::time::sleep` in a test without `start_paused = true`/`tokio::time::pause()` (needs the `test-util` feature) — real wall-clock waits and flakiness; with `pause()`, `std::thread::sleep` and real I/O do not advance the clock.
- `JoinHandle` of `tokio::spawn` dropped without `.await` in a test — assertions/panics in the task are lost; the test passes. Same for unjoined `std::thread::spawn` (panic in thread does not fail test unless `.join().unwrap()`).
- Missing `.await` on a future in async test: compiles with `#[must_use]` warning only — check `#![deny(warnings)]`/clippy in CI; the future never runs.
- Tests mutating process-global state (`std::env::set_var` — `unsafe` in the 2024 edition, working directory, `static` mutex/`OnceLock`/`lazy_static`, ports) while cargo runs tests in parallel threads — races between tests. Check for `serial_test`, `--test-threads=1` in config/CI, or per-test unique resources.
- Fixed temp paths (`/tmp/test.db`) or fixed ports instead of `tempfile`/`TcpListener::bind("127.0.0.1:0")`.
- `#[ignore]` newly added without a reason string (`#[ignore = "…"]`) or on a test that CI never runs with `--ignored`; `#[cfg(feature = "…")]` gating a test behind a feature CI doesn't enable; deleted `#[test]` fns; `#[cfg(test)]` module removed with behavior still present.
- `proptest`/`quickcheck` tests with `ProptestConfig { cases: 1 }`, fixed seed via `PROPTEST_` regression files deleted, or a `prop_assume!` that rejects nearly all inputs — property rarely executed.
- Snapshot tests (`insta` `.snap` updated, `cargo insta accept`) encoding wrong output; `expect_test` `expect![[…]]` rewritten with `UPDATE_EXPECT`.
- Doc tests marked `ignore`/`no_run`/`compile_fail` newly added on examples that changed — the example is no longer checked.
- Floating-point `assert_eq!` on computed values — flaky across targets/optimizations; only where a changed computation order is the PR's point.
- Production: `pub` items or `#[cfg(any(test, feature = "test-util"))]` hooks that change behavior in non-test builds, or `cfg!(test)` runtime branches. (`#[cfg(test)]` helpers are fine.)

## Safe (do not flag)
- `#[should_panic]` on a single-statement test with a descriptive `expected`.
- `unwrap()`/`expect()` in test code — panic is the failure signal.
- `#[tokio::test]` default flavor for pure async logic with no blocking calls/threads; `#[tokio::test(start_paused = true)]` with `sleep`.
- `HashMap` comparisons via `assert_eq!(map_a, map_b)` (map equality is order-independent) or after sorting/collecting into `BTreeMap`.
- `#[ignore = "reason"]` for slow/external-network tests that CI runs separately.
- `assert!(matches!(..))`, `assert_eq!` with `Result<_, _>` equality when `PartialEq` is derived.
- Integration tests in `tests/` using `tempfile::tempdir()`; `serial_test::serial` annotated tests.
- `#[cfg(test)] mod tests` private-access tests; `pub(crate)` visibility for test access.
- `dbg!`/`println!` in tests; `#[allow(dead_code)]` on test helpers.
