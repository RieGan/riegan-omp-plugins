# Concurrency — Python

## Flag
- Blocking call inside `async def`: `time.sleep`, `requests.*`, `urllib`, sync DB driver (`psycopg2`, `sqlite3`, sync SQLAlchemy session), `open().read()` on large/slow files, `subprocess.run`, CPU-heavy loops, `socket` without async — stalls the whole event loop and every other request. Check the function runs on the loop (not via `asyncio.to_thread`/`run_in_executor`/sync `def` FastAPI endpoint, which FastAPI runs in a threadpool).
- `asyncio.create_task(coro())` / `ensure_future` result not stored — the loop keeps only a weak reference; the task can be garbage-collected mid-run, and its exception is never retrieved. Check the return value is dropped and no set/`TaskGroup` holds it. Fix: keep a reference with a done-callback discard, or `asyncio.TaskGroup` (3.11+).
- Coroutine called without `await` (`do_thing()` as statement) — never runs; "coroutine was never awaited". Check the callee is `async def`.
- `asyncio.gather(*coros)` without `return_exceptions=True` — first exception propagates, siblings keep running unobserved. Prefer `TaskGroup` (3.11+), which cancels siblings; check the code relies on all-or-nothing.
- `asyncio.TaskGroup`/`gather` over caller-sized input with no `Semaphore` hitting a bounded API/pool.
- `except Exception`/bare `except:` around an `await` swallowing `asyncio.CancelledError` — it derives from `BaseException` since 3.8, so `except Exception` is fine; flag only bare `except:`/`except BaseException` that does not re-raise, and `asyncio.timeout()`/`wait_for` bodies that swallow it (breaks timeouts/shutdown).
- Check-then-act across an `await` on shared state (`if k not in cache: cache[k] = await load(k)`) — duplicate loads/lost update. No await between check and write: atomic on the loop; do not flag.
- `threading` + shared `dict`/`list`/counter: single ops (`d[k]=v`, `list.append`) are atomic under the GIL, but compound ops (`d[k] += 1`, `if k in d: d[k]…`, `x = d.get(k); d[k] = x+1`) are not. The GIL is not a lock. Check two threads reach the same object and a compound op. On free-threaded builds (3.13t/3.14t) even more is exposed.
- `threading.Lock` acquired without `with`/`try/finally`; lock held across blocking IO; `Lock` re-acquired on the same thread (use `RLock`); inconsistent order of two locks.
- `threading.Lock` used inside `async def` (blocks loop) or `asyncio.Lock` shared between threads/loops (not thread-safe; bound to one loop). `asyncio.Lock` held across a long await on a hot path.
- Non-daemon threads/`ThreadPoolExecutor` never shut down (`with` block or `.shutdown`), or `future.result()` never called so worker exceptions vanish. `Thread(target=…).start()` per request with no bound.
- `multiprocessing`: sharing a mutable object assuming it is shared (each process gets a copy; with `fork` after threads started risks deadlock — default start method changes to `forkserver` in 3.14); unpicklable args; `Pool` not closed/joined.
- `loop.run_until_complete`/`asyncio.run` called from inside a running loop (RuntimeError), or `asyncio.run` per call in a hot path.
- Missing timeouts: `requests.get(url)` (no default timeout — hangs forever), `httpx` default 5s ok, `aiohttp` default 5 min total, `asyncio.open_connection`, `queue.get()`/`future.result()`/`lock.acquire()` with no timeout on a request path.
- Retry decorator (`tenacity`, `backoff`, Celery `autoretry_for`) on non-idempotent task, without `wait_exponential`/jitter, or retrying `CancelledError`/`KeyboardInterrupt`.
- Celery/RQ/Dramatiq task: `acks_late` or at-least-once delivery with non-idempotent body (no key/dedupe); passing ORM objects instead of ids; `task.delay()` inside a DB transaction before commit (task may run before row visible) — use `transaction.on_commit` (Django).
- Django/SQLAlchemy: read-modify-write on model field (`obj.count += 1; obj.save()`) — use `F()` expression/`UPDATE … SET n=n+1`/`select_for_update()` inside `atomic()`. `get_or_create` without a DB unique constraint races.
- `signal` handler doing non-trivial work or locks; no SIGTERM handling in a long-running worker where siblings drain; `daemon=True` thread doing writes that must complete.
- Global mutable singletons (module dict used as cache) mutated from request threads under gunicorn `--threads`/uvicorn workers: per-process only; a cross-worker invariant needs external store.

## Safe (do not flag)
- Single dict/list operations (`d[k]=v`, `lst.append`, `dict.setdefault`, `queue.Queue` methods) from threads — atomic and thread-safe.
- Read-modify-write on shared state with no `await` between the read and write inside one coroutine.
- `except Exception` around `await` (does not catch `CancelledError` on 3.8+).
- Blocking calls inside plain `def` FastAPI/Starlette endpoints or code dispatched via `asyncio.to_thread`/`run_in_executor`.
- `create_task` whose result is kept in a set/list, awaited, or run in a `TaskGroup`.
- `asyncio.run(main())` at program entry; `loop.run_until_complete` in scripts/tests.
- `time.sleep`/`requests` in CLI scripts, migrations, and tests with no event loop.
- `gather` of idempotent/read-only coroutines on small fixed input.
- `threading.local`, `contextvars`, per-request objects.
- `select_for_update` inside `transaction.atomic()` or `F()` updates — these are the fixes.
