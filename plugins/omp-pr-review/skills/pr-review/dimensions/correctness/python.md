# Correctness — Python
## Flag
- Mutable default argument (`def f(x=[])`, `={}`, `=set()`, `=datetime.now()`, `=uuid4()`) — shared/evaluated once; report only if the default is mutated, returned, or time/random-dependent.
- Late-binding closure: `lambda: i` / nested `def` created in a loop or comprehension reads the final `i`; check it is called after the loop (callbacks, threads, `functools.partial` alternative). Same for loop var reused after loop.
- `is`/`is not` with literals/strings/ints (`x is 0`, `s is "a"`, `x is []`) — identity not equality; `== None` only a style issue, `is None` correct. Float `==`; `x == True` vs truthiness.
- Truthiness bugs: `if not x` where `0`, `""`, `[]` are valid values distinct from `None`; `if x:` on numpy array/DataFrame (ValueError); `or` defaults overriding valid falsy values.
- Integer vs float division: `/` always float, `//` floors toward -inf (`-7 // 2 == -4`), `%` takes divisor sign; `round()` banker's rounding (`round(2.5)==2`); `int(-1.5)` truncates; money via `float` instead of `Decimal` (and `Decimal(1.1)` from float).
- datetime: naive vs aware comparison/subtraction raises `TypeError`; `datetime.utcnow()`/`utcfromtimestamp` return naive and are deprecated since 3.12 (use `datetime.now(timezone.utc)`); `.replace(tzinfo=)` does not convert (use `astimezone`); `datetime.now()` local in persisted data; `timedelta(days=30)` for "a month"; `strftime("%Y")` vs ISO week year `%G`; DST with `pytz.localize` vs `zoneinfo`.
- Exception swallowing: bare `except:` / `except Exception: pass` / `contextlib.suppress(Exception)` on a path whose failure matters; `except` catching `BaseException`/`KeyboardInterrupt`/`asyncio.CancelledError` (3.8+ it is BaseException — `except Exception` does not catch it, good); `raise` inside `except` without `from` losing cause is minor; `return`/`break`/`continue` in `finally` swallows the exception.
- `except A, B:` is invalid before 3.14 (needs tuple); except order with parent class first makes later clauses unreachable.
- Generator/iterator exhaustion: `map`/`filter`/`zip`/generator/`dict.items()` consumed twice (second pass empty), `len(gen)`, `if gen:` always true, `return` a generator from inside `with`/`try` that closes the resource before consumption.
- Mutation while iterating: removing from list/dict/set in `for`; `dict` changed size during iteration RuntimeError; `list.sort()` returns `None` (`x = x.sort()`); `+=` on list mutates alias while `x = x + y` does not; `copy` shallow vs `deepcopy`; `[[0]*n]*m` aliases rows.
- String/bytes: `str` vs `bytes` mixing (`subprocess`, `socket`, `hashlib` need bytes); `open()` without `encoding=` uses locale; `len` counts code points not graphemes; `str.strip("abc")` cutset vs `removeprefix`/`removesuffix` (3.9+); `.format`/f-string with user-provided braces.
- `async`: coroutine called without `await` (RuntimeWarning, never runs); `asyncio.create_task` result not kept (GC can cancel it); blocking call (`time.sleep`, `requests`, file IO) in `async def`; `await` inside sync function; `gather` without `return_exceptions` cancelling semantics.
- Resource cleanup: `open`/connection/lock/tempfile without `with` and an exception path between acquire and close; `__exit__` returning truthy swallows exceptions; `__del__` relied on.
- Dict/set: unhashable key; `dict.get(k, default)` evaluating default eagerly; `setdefault` same; `dict.update` order; `set` iteration order assumed; `sorted` on mixed types / `key=` returning None.
- Types: `Optional` return used unchecked; `dataclass` field `default=[]` (ValueError) vs `field(default_factory=…)`; `@property` without setter assigned; `__eq__` defined without `__hash__` (3.x makes unhashable); `isinstance(True, int)` is True; `typing` annotations are not enforced at runtime (dataclass/pydantic differ — check which).
- `3.12+`: f-string nesting/quotes now valid; `typing.override`, `type X = …` statements; `datetime.utcnow` deprecated; `3.13` removed `locale.resetlocale`, free-threaded build optional; `3.14` annotations lazily evaluated — do not flag valid new syntax as errors without checking `requires-python`.
- Scripts: `if __name__` guard missing in module imported elsewhere with side effects; `argparse` `type=bool` (any non-empty string true); `os.path.join` with absolute second arg discards first; `subprocess.run(check=False)` result ignored.

## Safe (do not flag)
- `except Exception:` with logging at a top-level worker/request boundary; `except ImportError` for optional deps.
- `x == None`-style comparisons are style, not correctness; `is None` is right.
- Mutable default intentionally used as a cache with a comment, or never mutated.
- `del`/`remove` during iteration over a copy (`list(d)`, `d.copy()`, `[:]`).
- Naive `datetime` consistently used within one local-only module with no comparison to aware values.
- `assert` in tests and internal invariants; `typing.cast`, `# type: ignore` with reason.
- `round()` on display-only values; float equality with `math.isclose` already applied.
- Unawaited coroutine passed to `asyncio.run`, `gather`, `create_task`, `TaskGroup.create_task`.
- `defaultdict`/`Counter` missing-key reads inserting keys when that is the intended use.
