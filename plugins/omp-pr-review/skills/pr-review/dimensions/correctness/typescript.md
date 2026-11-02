# Correctness — TypeScript
## Flag
- `==`/`!=` between differently-typed values (`0 == ""`, `x == null` is the only idiomatic exception) — coercion gives wrong branch; report only if a non-null mismatched type can reach it.
- Floating promise: async call result unawaited/un-`.catch`ed in a function whose caller needs completion or error (`save(); return ok`) — rejection becomes unhandled (Node ≥15 crashes the process), ordering lost. Check it is not intentional fire-and-forget (`void`, documented).
- `async` callback passed where return value is ignored: `arr.forEach(async …)`, `array.filter(async …)` (Promise is always truthy), `.map(async …)` without `Promise.all` — check the consumer.
- `await` missing before a Promise in a condition/`try`: `try { return fetchX() } catch` does not catch rejection (needs `return await`); `if (isAllowed(user))` where `isAllowed` is async is always true.
- `Promise.all` where one failure must not abort others (needs `allSettled`), or `Promise.all` result destructuring order assumptions after refactor.
- In-place mutation: `sort()`, `reverse()`, `splice()`, `push` on a prop/state/shared array (use `toSorted`/`toReversed` on Node 20+); `sort()` without comparator on numbers sorts lexicographically.
- `Object.assign`/spread shallow copy then nested mutation of the original; `structuredClone` vs JSON roundtrip dropping `undefined`/Date/Map.
- Optional chaining hiding bugs: `a?.b.c` still throws if `b` undefined; `x?.y ?? default` silently masks a required value that should error; `if (obj?.length > 0)` with undefined; `await a?.save()` skipping a mandatory side effect.
- `||` for defaults where `0`, `""`, `false` are valid (use `??`); `??=` / `||=` semantic differences.
- Number: `0.1+0.2`, money in floats, ids/bigints above 2^53 (`JSON.parse` loses precision), `parseInt(x)` without radix on non-strings or `parseInt("12px")`, `Number("")===0`, `NaN !== NaN` (`indexOf` vs `includes`), bitwise ops truncating to 32 bits, `toFixed` returns string.
- Date: `new Date("2024-01-05")` is UTC but `new Date("2024-01-05T00:00")` local; `getMonth()` 0-based; `setMonth` overflow (Jan 31 + 1 month); adding `86400000` across DST; `getDay` vs `getUTCDay`; `Date` comparison with `==`; invalid date `NaN` propagating silently.
- `typeof null === "object"`; `Array.isArray` vs `instanceof` across realms; `in` operator on arrays/prototype keys; `for…in` over arrays; object keys as map with user keys like `__proto__`/`constructor` (use `Map`).
- String: `.length` counts UTF-16 units (emoji, combining marks); `split("")` breaks surrogate pairs; `replace(str, …)` replaces only first occurrence (`replaceAll`); regex with `g` flag reused via `.test` keeps `lastIndex`.
- `catch (e)` assumes `Error` (`e.message` on thrown string/unknown); error rethrown as new `Error` losing `cause`; `catch {}` empty on a path callers rely on.
- Type holes: `as X` / `!` non-null on reachable-undefined values; `any` leaking so a signature change compiles but callers pass wrong shape; exhaustive `switch` missing `default: assertNever` after adding a union member; `Array.prototype.find` result used without undefined check under `noUncheckedIndexedAccess` off.
- Node/Bun: `fs` sync vs async mix; missing stream `error` handler; `process.exit` before flush; `JSON.parse` of external text without try; `Buffer` vs string length.
- React: stale closure — handler/effect/timer reads state/props not in deps or uses `setX(x+1)` repeatedly instead of `setX(p=>p+1)`; `useEffect` missing cleanup (subscription, interval, abort) or deps wrong causing loop/skip; `useEffect` fetch without ignoring stale response; array `key={index}` on reorderable/stateful list; state mutated directly (`state.items.push`); derived state copied from props never updating; conditional hook call; `useMemo`/`useCallback` deps hiding stale values; setState after unmount assumed harmful (React 18+ no warning — not a bug).
- React 19: `ref` is a regular prop for function components (`forwardRef` still works, not required); `use()` may be called conditionally but not in try/catch; form `action` functions + `useActionState` replace manual state — do not flag as wrong unless behavior differs.
- Before reporting: confirm tsconfig strictness (`strict`, `noUncheckedIndexedAccess`) and that the type does not already exclude the case.

## Safe (do not flag)
- `x == null` / `x != null` to test null-or-undefined.
- `void promise` or explicit `.catch(() => {})` with a comment on fire-and-forget logging/metrics.
- `await` inside a loop where iterations must be sequential or order matters.
- Non-null `!` immediately after a guard or on DOM lookups in code where element is static markup.
- React effects with deps omitted where the `react-hooks/exhaustive-deps` rule is enabled and the value is a stable setter/ref/dispatch.
- `key={index}` on static, never-reordered, stateless lists.
- State setters, `dispatch`, `useRef` objects, and module-level constants omitted from deps.
- `JSON.parse(JSON.stringify(x))` on plain data with documented purpose.
- `catch (e: unknown)` with narrowing (`e instanceof Error`).
- Strict-mode double-invoked effects/render in dev only; React 18+ no unmounted-setState warning.
- Unawaited promise returned directly (`return fetchX()`) from async function outside try/catch.
