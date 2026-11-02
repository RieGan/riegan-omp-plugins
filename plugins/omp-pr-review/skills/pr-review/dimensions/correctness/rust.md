# Correctness — Rust
## Flag
- `unwrap()`/`expect()`/`[]` indexing/`slice[a..b]`/`/` and `%` by variable on a path where input is external or the `None`/`Err`/OOB/zero case is reachable (parsed input, env, IO, empty collection, `.first().unwrap()`, `.parse().unwrap()`, `Mutex::lock().unwrap()` after poisoning is a known choice). Name the input that triggers it and that no earlier check excludes it.
- Integer overflow: arithmetic panics in debug but wraps silently in release unless `overflow-checks = true` in the profile (check `Cargo.toml`). Flag where overflow is reachable for sizes, offsets, counters, timestamps, `usize - usize` (underflow when b > a), `abs()` of `MIN`, `-x` of `MIN`; fix with `checked_*`/`saturating_*`/`wrapping_*` chosen deliberately.
- `as` casts truncate/saturate silently: `u64 as u32`, `i64 as usize` (negative → huge), `usize as i32`, `f64 as u8` (saturating, NaN→0), `u8 as char` vs `char::from`. Prefer `try_from`; report where the value can exceed the target range.
- Panic in `Drop` (or code Drop calls) during unwinding aborts; `Drop` with fallible cleanup whose error is dropped (`File`/`BufWriter` drop ignores flush error — need explicit `flush()`/`sync_all()` before returning success).
- Iterator laziness: `iter.map(f)` with side effects never consumed (no `collect`/`for`/`for_each`; `#[must_use]` warning); `.inspect`; `filter_map` + `?` ignoring errors; `.collect::<Result<_,_>>()` short-circuit semantics; `take_while` vs `filter`; `skip`/`step_by(0)` panics; `chunks(0)` panics; `windows` on short slice yields nothing; `sum()` overflow in release; `zip` truncating to shorter silently.
- Swallowed errors: `let _ = f();` on a `Result` whose failure matters; `.ok()`/`.unwrap_or_default()` converting error to a plausible value; `if let Ok(x) = …` with no else; `?` converting error type via blanket `From` losing context callers match on; `Box<dyn Error>` downcast assumptions.
- `Option`/`Result` misuse: `unwrap_or(expensive())` eager (use `_else`) — only correctness if side effects; `map_or` argument order; `ok_or` vs `ok_or_else`; `matches!` on partial pattern; `==` on `f64`; `partial_cmp().unwrap()` panics on NaN (use `total_cmp`); sorting floats.
- Strings: `&s[a..b]` panics on non-char boundary (UTF-8); `s.len()` is bytes; `chars().rev()` breaks graphemes; `to_lowercase` locale-free; `from_utf8_lossy` hides corruption; `String::from_utf8(...).unwrap()` on external bytes; `Path` → `to_str().unwrap()`.
- Shadowing/moves: `let x = x.clone()` modifications discarded; value moved into closure/thread then reused (compile error, high signal); `mem::replace/take` leaving default; `Vec::drain`/`retain` closure side effects; `Rc<RefCell>` double `borrow_mut` → runtime panic on reentrancy.
- Match arms: wildcard `_ =>` added to an enum match hides new variants the PR adds elsewhere (flag only when the new variant needs distinct handling); `#[non_exhaustive]` assumptions; match guard ordering making later arms unreachable.
- `unsafe`: `get_unchecked`, `from_raw_parts`, `transmute`, `set_len`, `MaybeUninit::assume_init`, FFI pointers/lifetimes without a stated SAFETY invariant that the code actually upholds — trace the invariant; report violated ones as Critical.
- Time/ids: `Instant` vs `SystemTime` (non-monotonic; `duration_since` errors if clock went back); `Duration` subtraction panics on underflow (use `checked_sub`/`saturating_duration_since`).
- Async: `.await` holding a `std::sync::MutexGuard` (compile error for Send, or deadlock) — detail to concurrency; dropped future cancels mid-operation leaving partial state (cancel-safety of `select!` branches with non-cancel-safe `read_exact`, `recv` buffers).
- Edition 2024 (Rust 1.85+, check `edition` in Cargo.toml): `if let` scrutinee temporaries drop before `else`; tail-expression temporaries drop before locals; `impl Trait` captures all in-scope lifetimes; `unsafe extern` blocks and `unsafe_op_in_unsafe_fn` warn; `gen` reserved keyword; `Box<[T]>` `IntoIterator` by value; `std::env::set_var` is unsafe. Do not flag valid 2024 behavior as a bug; do flag code written for 2021 drop order after a migration if it relied on it (lock guard in `if let`).
- Features/cfg: `#[cfg(debug_assertions)]` logic diverging between debug and release changing results; `debug_assert!` guarding something release needs.

## Safe (do not flag)
- `unwrap`/`expect` on proven invariants (regex literal compiled once, static parse of constant, `Mutex` poison policy chosen, after explicit `is_some()` check or `let Some … else`), and in tests, examples, `main` of CLIs, `build.rs`.
- `expect("…")` messages documenting an invariant; `unreachable!` on exhaustively-handled states.
- `as` casts between same-width or provably in-range values (`u8 as usize`, `usize as u64` on 64-bit targets, `i32 as i64`, enum discriminant casts).
- `let _ = tx.send(..)` where a closed receiver means shutdown; `let _ = writeln!(string, …)` (cannot fail).
- Wrapping arithmetic using explicit `wrapping_*`/`Wrapping`; hash/PRNG math.
- Indexing after a length check in the same scope; `slice::get` handled.
- Wildcard arm on foreign `#[non_exhaustive]` enums; `#[allow(…)]` with a reason.
- Memory-safety fears in safe code (borrow checker already enforces); leaks via `mem::forget`/`Box::leak` that are intentional and documented.
