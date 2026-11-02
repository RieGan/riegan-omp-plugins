# Tests review
Covers: whether changed behavior is exercised by tests that would actually fail if the behavior broke; correctness and determinism of added/modified/deleted tests; test-only code leaking into production.
Not covered (other dimension owns it): bugs in production logic itself (correctness), race conditions in production code (concurrency), documentation gaps (docs), test style/naming/structure taste (never).

## Method
1. List every behavioral change in the diff: new branches, new error paths, changed conditions/constants/defaults, changed return values, new public API, changed SQL/migrations, removed guards. Ignore pure moves/renames/formatting.
2. For each, find the test that reaches it: grep test files for the symbol, then read the test body (not just its name). Check tests outside the diff too — existing coverage counts.
3. Rank untested changes by risk: security/auth checks, data writes/deletes, money/time math, parsing of external input, error/rollback paths, concurrency, boundary conditions. Only risky ones are reportable.
4. For each added or modified test, run the revert thought-experiment: revert the production change mentally; does an assertion flip? Trace the concrete input through the old code. If the test passes on both versions, it proves nothing.
5. Read assertions: they must check observable output/state/side effects, not that a mock was called or a fixture was built.
6. Scan the test diff for flake constructs, skips, deleted tests, and snapshot/golden updates; compare changed expected values against the PR's stated intent.
7. Scan the production diff for test-only hooks (exports, env/flag checks, `if testing`, public-for-test fields).
8. Run only the specific changed test file if your assignment permits project checks; you cannot check out the base, so otherwise reason. Confidence 100 only for an observed failure.

## Flag
### Missing coverage
- Risky changed path with no test — name the path and the exact input that would break it (e.g. "`parseRange('5-')` open-ended branch added at `range.ts:31`; no test passes a trailing dash"). Generic "needs tests" is not reportable.
- New error/exception/rollback branch where only the happy path is tested — the failing input or injected failure must be nameable.
- Bug-fix PR with no regression test reproducing the reported input — only when the issue/PR states a reproducible input.
- Boundary change (`<` to `<=`, new limit, off-by-one fix) where no test sits on the boundary value.
- New migration/data transform with no test on rows that hit the edge (NULLs, empty, duplicates) when the code branches on them.

### Tests that cannot fail
- Test passes with the change reverted — quote the assertion and state why old code satisfies it (asserts a value unchanged by the fix, input never reaches the new branch).
- Assertion on the mock/stub itself: expected value is the stub's configured return, or only `toHaveBeenCalled`/`assert_called`/`Times(1)` on an internal collaborator while real behavior (output, state, persisted data) goes unchecked.
- Mocking the unit under test, or its same-module internals, so the real code never runs.
- Assertion is vacuous: inside a callback/loop/`catch` that never executes, `assert True`, `expect(x).toBeDefined()` on something always defined, empty iteration, try/except that swallows the failure.
- Async assertion never awaited/driven, so the test finishes before it runs (language files).
- Test computes expected value with the same logic as the code (copied formula/function call), so bug and test agree.

### Tests that encode wrong behavior
- Expected value contradicts the PR description, linked issue, spec, or docs — the test asserts the bug. Quote both.
- Changed expected value/snapshot/golden file whose new content is wrong, or changed only to make the suite green with no matching intent in the production diff.
- Loosened assertion (exact -> contains/any/approx, removed field check, widened tolerance/timeout) in a PR that changes that behavior, hiding a regression.

### Removed or disabled coverage
- Deleted test or assertion while the behavior it covered still exists — name the behavior.
- Newly added skip/disable (`.skip`, `xit`, `t.Skip`, `@pytest.mark.skip`/`xfail`, `#[ignore]`) with no reason, or a reason that is not about an external constraint. Skip with a stated reason + tracking link is fine.
- Conditional skip whose condition is always true in CI (missing env var/binary that CI lacks) so the test silently never runs.

### Flaky constructs
- Fixed `sleep`/timeout used to wait for async work instead of polling a condition, awaiting a promise/channel, or fake clock.
- Depends on wall-clock now, local timezone, locale, DST, or current year/date (e.g. fixture "tomorrow", month-end).
- Real network, real third-party service, or fixed port instead of ephemeral.
- Order dependence: tests share mutable global/module/DB/file state, rely on prior test's side effects, or on map/set/dir-listing iteration order.
- Unseeded randomness, UUIDs or timestamps compared literally.
- Cleanup missing for resources a later test reuses (temp dir, env var, global mock, singleton, DB rows).

### Test code in production
- Production code gains a hook, exported/public symbol, parameter, env/flag branch, or weakened visibility existing only for tests — and it changes production behavior or exposes state (a pure `export` for testing with no behavior change is Minor at most).

## Do not flag
- Missing tests in a repo with no test suite or test runner configured: note it once under `## Checked`, never as a finding.
- Coverage percentages or "coverage dropped"; the absence of tests for trivial getters, constants, config, docs, generated code, types-only changes, logging text.
- Pure refactors/moves/renames where existing tests still exercise the code. Check before claiming untested.
- Test style: naming, `describe` structure, table vs separate tests, AAA layout, helper extraction, duplicated setup, magic numbers in fixtures, missing `t.Helper`.
- Using mocks/fakes for true external boundaries (HTTP, clock, filesystem, DB driver) when behavior is also asserted.
- A single test covering several paths if each is asserted; one assertion per test is not a rule.
- Missing tests for code the PR does not touch.
- Integration-only coverage when the behavior is genuinely exercised end to end.
- Snapshot/golden updates that match the production change and PR intent; do not review generated snapshot content line by line.
- Skipped tests with a stated reason and issue link, or platform guards that are correct (`windows`-only skip).
- Suggesting property/fuzz/mutation testing, benchmarks, or more cases "for robustness" without a named failing input.
- Test-only helper files/dirs, `_test`/`conftest`/`testutil` modules; `#[cfg(test)]`/build-tagged code is not test leakage.

## Severity anchors
- Critical: PR deletes the only test of an auth/permission check while keeping the check, and the same PR modifies that check; test suite change makes CI pass by skipping a failing test that exposes a regression introduced in this PR.
- Important: new data-deleting/migration branch with no test on the input that triggers it; regression test for the fix passes on the pre-fix code; test asserts the buggy output the issue complains about; expected value loosened to hide a changed result.
- Minor: `sleep(100ms)` wait in a new test with a nameable race on slow CI; new test depends on local timezone; added `.skip` without a reason on an unrelated test; assertion only on `toHaveBeenCalled` where output is also trivially checkable.

## Language notes
- `skill://pr-review/dimensions/tests/typescript.md` — read when the diff has *.ts, *.tsx, *.js, *.jsx test files (bun:test, vitest, jest, React Testing Library).
- `skill://pr-review/dimensions/tests/go.md` — read when the diff has *_test.go.
- `skill://pr-review/dimensions/tests/python.md` — read when the diff has test_*.py, *_test.py, conftest.py.
- `skill://pr-review/dimensions/tests/rust.md` — read when the diff has `#[test]`/`#[tokio::test]` code in *.rs or tests/*.rs.
