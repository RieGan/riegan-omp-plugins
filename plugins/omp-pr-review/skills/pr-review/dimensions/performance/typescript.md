# Performance — TypeScript / JavaScript

## Flag
- `await` inside `for`/`while`/`for...of`/`.forEach(async ...)` over a user-scaled collection where iterations are independent -- one RTT per item; check no ordering/rate-limit requirement; fix: `Promise.all` on chunks or a batch endpoint. `.forEach(async ...)` additionally is not awaited at all (correctness owns that).
- `Promise.all(items.map(...))` over unbounded/user-sized `items` hitting DB or a third party -- connection pool exhaustion / 429s; check for `p-limit`/chunking in the repo; fix: bounded concurrency.
- `await a(); await b();` with no data dependency on a request path -- sum instead of max latency; fix: `Promise.all([a(), b()])`.
- Event-loop blocking on a request path: `fs.readFileSync`/`writeFileSync`/`readdirSync`, `crypto.pbkdf2Sync`/`scryptSync`/`randomFillSync` of large sizes, `child_process.execSync`, `zlib.*Sync`, `JSON.parse`/`stringify` of multi-MB payloads, large regex over user input, sort/reduce over 1e5+ items. Check it is not startup/CLI code; fix: async API, worker thread, streaming.
- `fs.readFile`/`await response.text()`/`Buffer.concat` of whole user-sized file or body instead of a stream, with no size cap -- memory proportional to file size times concurrency.
- Array patterns in loops: `arr.includes`/`indexOf`/`find` per element of another array (O(n*m)), spread accumulators `acc = [...acc, x]` / `{...acc, [k]: v}` inside `reduce` (O(n^2)), `shift()` in a drain loop on large arrays -- need N >= ~1e4; fix: `Set`/`Map`, push.
- New regex built with `new RegExp(...)` inside a hot loop or per-request from a constant string.
- ORM calls in loops (Prisma `findUnique`, TypeORM `findOne`, Sequelize `findByPk`, Drizzle `select`) per item -- fix: `where: { id: { in } }`, `include`, DataLoader; GraphQL resolvers fetching per parent without DataLoader.
- Missing `AbortSignal.timeout`/client timeout on new `fetch`/axios/got call on a request path. `fetch` has no default timeout; axios default is none; Node `http` has none by default.
- Listener/timer leaks: `addEventListener`, `emitter.on`, `setInterval`, `subscribe` in a handler/effect/constructor without removal. React: effect without cleanup returning remover; Node `MaxListenersExceededWarning` shape (listener added per request on a shared emitter).
- Module-level `Map`/object used as cache keyed by request-derived values with no TTL/LRU/size cap.
- Bundle: `import _ from 'lodash'` / `import * as` of large libs, `moment` with locales, full icon sets, barrel imports (`from '@/components'`) that defeat tree-shaking in client code, new top-level import of a heavy dep in a route that could use `import()` / `React.lazy`/`next/dynamic`. Check `sideEffects` and bundler before claiming barrel cost; server-only code is not a bundle issue.
- React re-render causes (only when the cost is real: large list, expensive child, per-keystroke updates):
  - Inline object/array/function props passed to a child wrapped in `React.memo` -- defeats memo. If the repo enables React Compiler (check `babel-plugin-react-compiler`, `reactCompiler` config), do not flag.
  - Context provider `value={{...}}` rebuilt each render with many consumers; one context holding fast-changing state with unrelated consumers.
  - Missing/index `key` on a dynamic reorderable list (`key={index}`) -- remount/state churn on reorder, large lists.
  - State lifted too high so each keystroke re-renders a big subtree; derived data stored in state and synced via effect (extra render pass) at large N.
  - Expensive computation in render body with changing identity deps; list >= ~1e3 rows rendered without virtualization/pagination.
- Next.js/SSR: sequential data fetches in server components/loaders that could be parallel; `cache: 'no-store'`/`force-dynamic` added to a high-traffic page that was static -- check the page's traffic role.

## Safe (do not flag)
- `await` in loop when order matters, when each iteration depends on the prior result, in tests/scripts/CLI, or over a fixed handful of items.
- `Promise.all` over a small fixed array of distinct calls.
- `*Sync` fs/crypto calls at module load, startup, config read, CLI entry, build scripts, or in test setup.
- `JSON.parse(JSON.stringify(x))` on small objects; spreading in a reducer on <= ~100 items.
- Inline objects/functions passed to non-memoized DOM elements or non-memo children; `key={index}` on static lists that never reorder.
- Missing `useMemo`/`useCallback`/`React.memo` by themselves; with React 19 + Compiler these are handled automatically.
- `import { x } from 'lodash-es'` / named imports from tree-shakeable ESM packages; type-only imports (erased).
- Unbounded listeners on short-lived objects (a request/stream/element that is itself garbage-collected).
- `Array.prototype.sort` / `map` / `filter` chains over small data (multiple passes are not a regression).
