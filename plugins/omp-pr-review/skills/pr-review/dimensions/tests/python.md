# Tests — Python

## Flag
- `async def test_…` with no async plugin configured (`pytest-asyncio` with `asyncio_mode = auto`/`@pytest.mark.asyncio`, `anyio`, `pytest-trio`) — pytest does not await the coroutine; it is skipped/fails depending on version and never runs the body. Check `pyproject.toml`/`pytest.ini`/`conftest.py` first; in `strict` mode (default) bare `async def` tests need the marker.
- Un-awaited coroutine inside a test: `service.fetch()` without `await`, `asyncio.create_task` never awaited/gathered, `AsyncMock` result asserted via `.called` only — "coroutine was never awaited" warning. Check `-W error` isn't set; assertion after the missing await tests nothing.
- `mock.patch("pkg.module.func")` targeting the definition when the code under test did `from pkg.module import func` — the name in the consumer is unchanged, so the patch has no effect and the real function runs. Patch where it is used (`patch("consumer.func")`). Check the import style in the production file. Same for `monkeypatch.setattr`.
- `monkeypatch.setattr("a.b.c", …)` with `raising=False` hiding a typo in the target path — patch never applies.
- Mock without `autospec`/`spec` where the PR changes a signature or attribute — the mock accepts old-style calls, so the test passes after revert. Report only when that signature change is the PR's point.
- Mock-only assertions: `mock.assert_called_once()` as the only check, `Mock()` returns used as expected value, `assert mock.method.called`. Bare `mock.assert_called_once` (no parentheses) is a no-op expression; check for it. Misspelled `assert_*` names raise `AttributeError` on current Python; other misspellings (e.g. `called_once_with`) silently pass.
- `assert` on a non-empty tuple/string, `assert x, "msg"` misread, `assert func` (function object always truthy), `self.assertTrue(x == y, …)` where `x` is always the same — vacuous.
- `with pytest.raises(Exception):` (too broad) around multiple statements, or `pytest.raises(ValueError)` without `match=` where the change is about the message/which error. The body may fail at an unrelated line. Also assertions after the raising line inside the `with` block never run.
- `try/except` in the test that swallows `AssertionError`; `pytest.fail` placed inside the `try` it covers.
- Fixture scope leaks: `scope="module"/"session"` fixture returns a mutable object (list, dict, DB session, app, mock) that tests mutate — later tests see state; verify at least two tests use and mutate it. Session-scoped DB/connection without per-test rollback/truncate.
- Fixture with `yield` missing teardown for created files/rows/env vars; `os.environ[...] = …` or `sys.modules`/global edits instead of `monkeypatch`/`mock.patch.dict` — persists into other tests.
- Autouse fixture newly added in a root `conftest.py` that silently changes behavior for all tests (patching clock, DB, network).
- Time: real `datetime.now()`/`time.time()`/`date.today()` in the code or the test, `freezegun`/`time-machine` not used, tz-naive vs aware comparison, tests that fail near midnight/month end/DST/leap day. `freeze_time` applied to a module that imported `datetime` by `from datetime import datetime` is fine with freezegun; applied with `monkeypatch` of `time.time` only won't change `datetime.now` — check.
- `time.sleep(n)`/`asyncio.sleep(n)` waiting for background work instead of `asyncio.Event`/`wait_for`/polling helper; reliance on dict/set order of `set` of strings (hash randomization, `PYTHONHASHSEED`) when compared to a list.
- `random` without `seed`; `uuid4`/`tmp_path` names compared literally.
- Parametrize bugs: `@pytest.mark.parametrize` argnames not matching args (error), IDs duplicated, mutable default objects in params shared between cases (a list/dict param mutated by the code).
- `@pytest.mark.skip`/`skipif(True,…)`/`xfail` (esp. non-`strict` xfail hiding a now-passing/failing test), `pytest.importorskip` for a hard dependency, `unittest.skip` without reason; `collect_ignore`/`--ignore` added to config; test function renamed to a non-`test_` name or defined twice with the same name in a module (the first is shadowed and never runs).
- Snapshot libs (`syrupy`, `pytest-regressions`, `--snapshot-update`) updated with wrong values; golden files regenerated unrelated to the change.
- Production module gains `if os.environ.get("TESTING")`/`PYTEST_CURRENT_TEST` branch or `_set_for_test` helper.

## Safe (do not flag)
- `mock.patch` target at the definition module when the consumer calls `module.func(...)` via module attribute (`import pkg.module`).
- `MagicMock` for real I/O boundaries (HTTP, SMTP, subprocess) with behavior asserted.
- `monkeypatch` of env/attrs (auto-undone); `tmp_path`, `tmp_path_factory`, `capsys` fixtures.
- `scope="session"` fixtures that are immutable or read-only (config, compiled regex, seeded read-only DB).
- Broad `pytest.raises(SomeError)` when the function has a single raising statement and the change is only that the exception occurs.
- `pytest.approx` for floats; `assert a == b` plain asserts (pytest rewrites them).
- `asyncio_mode = auto` projects with no per-test marker; Python 3.12+ `unittest.mock` stricter attribute checks.
- `xfail(strict=True)` with a reason; `skipif` on platform/version with correct condition.
- Test dependence on `conftest.py` fixtures defined in the same directory tree; test-only fixtures in `tests/`.
