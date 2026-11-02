# Performance — Rust

## Flag
- Blocking in async context on a runtime worker: `std::fs::*`, `std::thread::sleep`, `std::net` blocking IO, `reqwest::blocking`, sync DB drivers (`diesel`, `rusqlite`), `Mutex::lock` held while doing slow work, large CPU loops (hashing, compression, serde on multi-MB), inside `async fn`/`tokio::spawn` -- stalls other tasks on that worker; fix: `tokio::fs`, `tokio::time::sleep`, `tokio::task::spawn_blocking`, `block_in_place`. Confirm the fn is actually async/called from a runtime thread.
- `std::sync::Mutex`/`RwLock` guard held across `.await` -- blocks the worker thread and risks deadlock (also not `Send`; the compiler rejects it in `tokio::spawn`, so only flag in `block_on`/local-set code or when it compiles); `tokio::sync::Mutex` for short non-await critical sections is unnecessary overhead only on hot paths with high contention.
- `Arc<Mutex<_>>` / `Arc<RwLock<_>>` as a global map/counter on a hot path with many threads/tasks, where the critical section is large or the lock is taken per item -- contention serializes work; fix: shard (`dashmap`), atomics for counters, message passing, or narrower critical section. Must name the hot path and concurrency level.
- Needless `.clone()` / `.to_vec()` / `.to_string()` / `.to_owned()` of large `Vec`/`String`/`HashMap` in a hot loop or per request when a borrow, `&str`, `Cow`, `Arc::clone`, or `mem::take` works -- show the size of the cloned data and the frequency; cloning small `Copy`-like or `Arc` is not a finding.
- Intermediate `collect::<Vec<_>>()` immediately re-iterated (`.collect::<Vec<_>>().iter()...`) or `.collect()` just to call `.len()`/`.is_empty()`/`.contains` on large iterators in a hot path -- extra allocation per call.
- `Vec::remove(0)`/`insert(0, _)`, `contains` on `Vec` inside a loop, `String` `+`/`format!` accumulation in a loop -- quadratic at N >= ~1e4 (use `VecDeque`, `HashSet`, `push_str`/`write!`).
- Allocation in the hot loop: `Vec::new()`/`String::new()`/`format!`/`Box` per iteration where a buffer can be reused (`clear()`) -- loop is per-packet/per-row at high rate; cite the rate.
- `Regex::new` inside a function called per item/request (compile is expensive) -- use `std::sync::LazyLock`/`OnceLock`/`once_cell`.
- N+1: `sqlx`/`diesel`/`sea-orm` query or `reqwest` call per item in a loop / per element in `for` with `.await` -- batch (`= ANY($1)`, `IN`), or `futures::stream::iter(...).buffer_unordered(n)`.
- Sequential `.await`s of independent futures on a request path -- `tokio::join!`/`try_join!`/`futures::future::join_all`.
- Unbounded spawn: `tokio::spawn` per item of user-sized input with no `Semaphore`/`buffer_unordered`/`JoinSet` bound; unbounded `mpsc::unbounded_channel` between a fast producer and slow consumer -- memory growth under load; prefer bounded `mpsc::channel`.
- Unbounded body/file reads: `read_to_string`, `to_bytes(body)` / `hyper::body::to_bytes` / `axum::body::to_bytes` without limit (axum `DefaultBodyLimit`/`Limited`) on user input.
- Missing timeouts on `reqwest::Client` (no default total timeout), `tokio::net::TcpStream::connect`, sqlx acquire on request path -- `tokio::time::timeout`/`Client::builder().timeout()`.
- Unbounded caches (`static` `HashMap` behind `Mutex`/`LazyLock`) keyed by request data without eviction; `Box::leak`/`mem::forget` per request; `Rc`/`Arc` cycles (leaks) with named structure.
- `#[derive(Clone)]` large struct then cloned per request in `axum` state extraction instead of `Arc` -- state `Clone` runs per request; check size.

## Safe (do not flag)
- `.clone()` on `Arc`, `Rc`, small `Copy`-ish structs, `String`s in error/cold paths, config/startup, or to satisfy the borrow checker in non-hot code.
- `collect::<Vec<_>>()` for results that are returned or indexed more than once; `.collect::<Result<Vec<_>, _>>()`.
- `Vec::with_capacity` omission; `format!` in logging/error paths; `to_string()` in cold code.
- `std::sync::Mutex` for short, non-await critical sections inside async code -- the recommended pattern (tokio docs); `Arc<Mutex<T>>` on non-contended or low-rate paths.
- `std::fs`/`std::thread::sleep` in `main` before runtime start, in `#[test]`, in `build.rs`, CLI tools, or inside `spawn_blocking`.
- `unbounded_channel` where producer volume is inherently bounded (single-shot results, shutdown signals).
- Bounds checks, `unwrap`, iterator vs index loops, `Box<dyn Trait>` vs generics (dispatch cost) without a measured hot loop.
- Edition changes (2021 -> 2024) alone; `async fn` in traits boxing costs.
