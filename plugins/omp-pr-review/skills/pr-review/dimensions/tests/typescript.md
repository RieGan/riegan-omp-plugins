# Tests — TypeScript

## Flag
- `expect(promise).resolves.…` / `.rejects.…` not awaited or returned — the matcher returns a promise; the test ends first and a failure surfaces as an unhandled rejection or nothing. Check the line has `await`/`return` (also in bun:test, vitest, jest).
- `expect(() => asyncFn()).toThrow()` — sync matcher on an async function never throws; use `await expect(asyncFn()).rejects.toThrow()`. Check that the function is async.
- `try { await f(); } catch (e) { expect(...) }` with no `expect.assertions(n)`/`expect.hasAssertions()`/fail after the call — passes when `f` does not throw. Check there is no assertion after the `await` that fails.
- `.forEach(async …)`/`.map(async …)` with assertions inside, not awaited via `Promise.all` — assertions run after test end. Check for `for…of` or `await Promise.all`.
- Missing `await` on `findBy*`/`waitFor`/`user.click` (userEvent v14 is async), or `done` callback never called — test passes or times out wrongly.
- Fake timers (`jest.useFakeTimers`, `vi.useFakeTimers`, `setSystemTime`, bun:test `jest.useFakeTimers`) enabled without `useRealTimers` in `afterEach` and no config reset — leaks into later tests/files. Check config (`restoreMocks`, `fakeTimers`) and afterEach before reporting.
- `await vi.advanceTimersByTimeAsync` omitted where code awaits promises between timers (sync `advanceTimersByTime` leaves continuations unrun) — assertion before callback effect.
- `jest.mock`/`vi.mock`/`mock.module` of the module under test, or of a sibling the test is meant to cover — real logic never runs. Check the import in the test file vs the mocked specifier.
- Mock setup leaks: `spyOn`/`mockImplementation`/`mock.module`/`process.env`/`globalThis` assignments with no `restoreAllMocks`/`mock.restore`/afterEach and no `restoreMocks: true` in config — order-dependent failures. Report only when a later test in the same file/process reads that state.
- Assertion on mock only: `expect(fetchMock).toHaveBeenCalledWith(url)` as the sole check for a function that returns/renders a result.
- Retargeted `toEqual` -> `toMatchObject`/`expect.any(...)`/`toBeTruthy` in a PR changing that shape — hides regressions. `toEqual` ignores `undefined` props; `toStrictEqual` does not — relevant only if the change is about presence of keys.
- `toMatchSnapshot`/`toMatchInlineSnapshot` updated for a behavior change: read the new snapshot text; flag if it shows the wrong value, `undefined`, error text, or loading state where final UI was expected. `-u`-style bulk rewrites with unrelated diffs deserve a Declined note.
- React Testing Library: `getByTestId`/class/DOM-structure queries where the change is about accessible behavior; asserting on component state/instance or `container.firstChild`; `fireEvent` where behavior depends on real event sequence. Report only when this makes the test pass despite a broken user-visible behavior (e.g. disabled button still clickable via testid).
- RTL `expect(queryBy…).toBeNull()` before the async element could appear — passes before the UI settles; need `waitFor`/`findBy` or `waitForElementToBeRemoved`.
- `test.only`/`describe.only`/`fit`/`fdescribe` committed — rest of the suite silently skipped. Always Important or higher.
- `it.skip`/`xit`/`test.todo`/`it.failing` newly added or converted with no reason; `test.each` data rows removed.
- `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()` compared literally in expectations without fake timers/seed; `toLocaleString`/`Intl` output asserted — depends on ICU/locale/timezone of the runner (set `TZ`?).
- `setTimeout(r, N)` sleeps to wait on async work; fixed ports (`listen(3000)`) instead of `0`.
- Jest/vitest module state: tests mutate a module-level singleton/cache imported by several tests without `vi.resetModules`/`jest.isolateModules` — order dependence in a shared worker.
- Type-only test passes: `// @ts-expect-error` or `as any` hiding the very type under change, so `tsc` still passes after revert (`expectTypeOf` tests never run in plain runtime test).

## Safe (do not flag)
- `expect(await p)` / `await expect(p).resolves…` — properly awaited forms.
- Returning the promise from `it(async () => …)` or `() => expect(p).resolves…`.
- `mock.module`/`vi.mock` of external packages, network clients, or Node built-ins (`fs`, `child_process`) when output behavior is still asserted; `vi.mock` hoisting is expected.
- Bun/vitest/jest automatically restoring when config sets `restoreMocks`/`mockReset`/`clearMocks`/`unstubAllEnvs`; vitest `vi.useFakeTimers()` auto-restored when `afterEach(vi.useRealTimers)` exists.
- `getByRole`/`getByLabelText`/`getByText` queries; `data-testid` for elements with no accessible role.
- `toBeTruthy()` on boolean-returning functions where the revert would flip the value.
- Snapshot of a small, human-readable value matching the change; `.skip` with a link-backed reason.
- bun:test top-level `await` and `test.concurrent` when tests do not share state.
- React 19 `act` warnings from `@testing-library/react` v16 — handled by RTL; not a missing-await bug.
