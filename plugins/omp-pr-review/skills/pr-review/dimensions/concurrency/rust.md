# Concurrency — Rust

## Flag
- `std::sync::Mutex`/`RwLock` guard held across `.await` in an async fn — guard is `!Send` so a spawned future usually fails to compile; but with `block_on`/`spawn_local`/single-thread runtimes it compiles and can deadlock (another task on the same thread locks the same mutex). Check the guard's scope actually spans an await (drop it or scope it in a block). `tokio::sync::Mutex` across `.await` is correct; flag only if the held span includes slow IO on a hot lock.
- `tokio::sync::Mutex` used where the critical section has no await — unnecessary cost (performance), not a bug; do not flag as concurrency.
- Blocking calls in async code: `std::thread::sleep`, `std::fs`, `std::net`, `reqwest::blocking`, `mutex.lock()` on contended std mutex, heavy CPU — stalls a runtime worker; with `current_thread` runtime stalls everything. Check it runs inside an async task and not in `spawn_blocking`/`block_in_place`.
- `tokio::select!` cancellation safety: a branch future dropped when another wins loses its in-progress state. Unsafe futures: `read_exact`, `read_to_end`, `AsyncWriteExt::write_all`, custom state-machine futures. Check the unsafe future is polled in a loop/`select!` where another branch can win and data would be lost/duplicated. Cancel-safe (documented per-method in tokio docs): `mpsc::Receiver::recv`, bounded `mpsc::Sender::send` (guaranteed not sent if the branch is dropped; `reserve`/`send` adds a capacity guarantee), tokio `Mutex::lock`, `oneshot`, `sleep`, `accept`, `read`.
- `tokio::spawn(fut)` with `JoinHandle` dropped and the task returning `Result` — error silently lost; panic only logged. Check no `JoinSet`/handle retained. Tasks needing a stop: no `CancellationToken`/shutdown channel/abort.
- `JoinHandle::abort()` or dropped future in the middle of a multi-step write — not cleanup-safe (no async Drop); partial state. Check the state is non-transactional.
- Unbounded `mpsc::unbounded_channel`/`Vec` queue fed by external input — memory growth with no backpressure; prefer bounded `channel(n)`. `broadcast` lagging receivers get `RecvError::Lagged` ignored.
- Nested locks in inconsistent order (quote both sites); re-locking a `std::sync::Mutex` already held by the same thread (deadlock/panic — it is not reentrant); `RwLock` read→write upgrade attempt; holding a guard while calling user callbacks/trait objects.
- `unsafe impl Send/Sync for T` — must prove every field is thread-safe; check raw pointers, `Cell`/`RefCell`/`Rc` inside, and that the access is actually synchronized. Wrapping a `*mut T` in a Send wrapper to cross threads is the classic bypass. Report with the concrete aliasing interleaving.
- `static mut` or `UnsafeCell` mutated from several threads without atomics/lock; `Ordering::Relaxed` used for a flag that publishes other data (needs Acquire/Release); lock-free check-then-act with separate `load` and `store` instead of `compare_exchange`/`fetch_*`.
- `Arc<Mutex<T>>` clone-per-task where `lock().unwrap()` panics on poison (`PoisonError`) propagate to all users after one panic — flag only when a panic path in the guard is realistic and poisoning handling is inconsistent with siblings; `parking_lot`/tokio mutexes do not poison.
- `std::thread::spawn` handle dropped with errors/panics unobserved; `thread::scope` misuse is compile-checked; threads per request unbounded.
- `Drop` that blocks (`block_on`, `join`) inside an async context or while a lock is held — deadlock on runtime shutdown.
- `futures::join!`/`try_join!` partial failure: `try_join!` drops the remaining futures on first Err — cancellation of non-cancel-safe siblings.
- Missing timeout: `reqwest::Client::new()` has no overall timeout by default; `tokio::time::timeout` absent on external IO in request paths. `timeout` only drops the future — same cancel-safety caveat.
- Graceful shutdown: `axum::serve(...).with_graceful_shutdown` absent where siblings use it; `std::process::exit` skipping drains; workers not awaiting the `JoinSet` on shutdown.

## Safe (do not flag)
- `std::sync::Mutex` held across non-await work in async fns, including short critical sections in tokio code (tokio docs recommend std mutex when no await is held).
- Guard held across `.await` where the future is not required to be `Send` and the lock is `tokio::sync::Mutex`.
- Data races in safe Rust: the compiler rejects them; do not report data-race speculation on `Arc<T>`/`&T`/`&mut T` code without `unsafe`.
- `Rc`/`RefCell` on a single thread / `LocalSet`.
- `Ordering::SeqCst` or Acquire/Release on simple counters/flags; `Relaxed` on pure statistics counters.
- `lock().unwrap()` on std mutex, the common idiom; panicking on poison is intentional.
- `tokio::spawn` for fire-and-forget logging/metrics with documented best-effort.
- `select!` over cancel-safe futures (`recv`, `sleep`, `accept`, `CancellationToken::cancelled`).
- `spawn_blocking` for CPU/blocking work; `block_in_place` in multi-thread runtime.
- Edition 2024 changes (tail-expression temporaries dropped earlier, `if let` scope) — they reduce, not add, guard-lifetime hazards; verify before claiming a guard lives across an await.
