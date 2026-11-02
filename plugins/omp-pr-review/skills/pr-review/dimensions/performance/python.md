# Performance — Python

## Flag
- ORM N+1 in Django: attribute access to a ForeignKey/OneToOne/reverse relation or M2M (`obj.author.name`, `obj.items.all()`) inside a loop/template/serializer over a queryset without `select_related` (FK/O2O) or `prefetch_related` (M2M/reverse) -- one query per row. Check the queryset's definition; DRF serializers with nested/`SerializerMethodField` fields trigger it too. `.count()`/`.exists()`/`.filter()` on a related manager in a loop always queries even with prefetch (filter bypasses prefetch cache unless `Prefetch(queryset=...)`).
- SQLAlchemy lazy loading: relationship default `lazy="select"`; loop touching `parent.children` without `selectinload`/`joinedload`/`subqueryload` -- N+1. In `AsyncSession`, lazy load raises `MissingGreenlet` (correctness), not a perf finding.
- Per-row `.save()`, `session.add`+`commit()`, `INSERT`/`UPDATE` in a loop over scaled data -- fix: `bulk_create`/`bulk_update`/`executemany`/`insert().values([...])`; commit per row also fsyncs per row.
- `list(queryset)`, `.all()` then Python-side filter/len, `len(qs)` instead of `.count()`, iterating huge queryset without `.iterator()` / `yield_per()` -- memory is proportional to table size.
- Quadratic list ops over scaled data: `x in some_list` inside a loop, `list.remove`/`list.index`/`list.insert(0, x)`/`pop(0)` in loops (use `set`/`dict`/`collections.deque`), `result = result + [x]`, `sum(list_of_lists, [])`, `s += x` inside a loop building a large string (CPython's in-place concat optimization is not guaranteed; use `''.join`). Need N >= ~1e4.
- pandas: `df.iterrows()`/`itertuples()`/`df.apply(axis=1)`/Python loop with `df.loc[i]` over large frames where a vectorized op exists; `pd.concat` or `df.append`-style growth inside a loop (quadratic); `df[col].apply(python_fn)` on 1e5+ rows where `.str`/`.map`/vector ops exist; chained-copy patterns over wide frames. Only for production/ETL paths with large frames, not notebooks/tests.
- CPU-bound work in threads: `ThreadPoolExecutor`/`threading` for pure-Python CPU loops gains nothing under the GIL (default builds, including 3.13; free-threaded builds are opt-in) -- fix: `ProcessPoolExecutor`/native/vectorized. Not for IO-bound threads.
- Blocking calls in `async def`: `requests.*`, `time.sleep`, sync DB driver, `open().read()` of large files, `subprocess.run`, CPU loops -- stalls the event loop for all requests; fix: async client, `asyncio.to_thread`, `run_in_executor`. Sequential `await` of independent coroutines on a request path (`asyncio.gather`/`TaskGroup` instead). Unbounded `gather` over user-sized lists -- use a `Semaphore`.
- `re.compile` in function per call is cached by `re` (up to 512 patterns), so only flag dynamic patterns generated per item; `re.match(var_pattern, ...)` with thousands of distinct patterns thrashes the cache.
- Reading whole file/response into memory (`.read()`, `.json()`, `response.content`) for user-sized inputs; fix: iterate lines/chunks, `stream=True`, `iter_content`.
- `requests`/`httpx`/`urllib` call without `timeout=` on a request path (requests has no default timeout; httpx default is 5 s so do not flag httpx unless `timeout=None`).
- Unbounded module-level dict cache keyed by request data; `functools.lru_cache(maxsize=None)` on a function whose args are request-derived (unbounded growth; also retains `self` on methods).
- `json.loads`/`dumps`, `pickle`, regex over multi-MB payloads in the request path sync code.
- Celery/RQ tasks: fan-out of one task per row of a large table with no batching/chunking, or serialized large objects as task args.

## Safe (do not flag)
- List comprehension vs generator, `for` vs `map`, f-string vs `join` on small data; `x in list` over lists <= ~100.
- `iterrows()`/loops in one-off scripts, notebooks, tests, and tiny frames.
- `.all()` followed by iteration when the queryset is already bounded (`[:100]`, paginator, small lookup table).
- `select_related`/`prefetch_related` already applied on the queryset -- verify with the definition before flagging N+1; DRF `many=True` with annotated/prefetched queryset.
- `threading` for IO-bound work; `multiprocessing` overhead on small inputs.
- `lru_cache(maxsize=None)` on pure functions of a bounded argument domain.
- `+=` on `str` for a handful of pieces; `sorted(..., key=...)` repeated on small lists; `copy.deepcopy` of small config.
- `asyncio.gather` over a small fixed set of calls; `time.sleep` in sync workers/CLIs.
