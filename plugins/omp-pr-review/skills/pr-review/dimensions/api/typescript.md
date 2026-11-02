# API — TypeScript
## Flag
- `package.json` `exports` added or tightened on a package that previously had none — once `exports` exists, deep imports (`pkg/lib/foo`) not listed fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Check in-repo and documented deep-import users before reporting.
- `main`/`module`/`types`/`exports` path changed, or build output renamed (`dist/index.js` → `dist/esm/index.js`) — verify the new path exists in `files`/build config and that the `types` condition is listed first within each `exports` condition block (TS resolves conditions in order).
- `"type": "module"` added/removed, or `.cjs`/`.mjs` extension flips — consumers using `require()` or ESM `import` of the package may break. Node 22.12+ can `require()` synchronous ESM (no top-level await); do not report if that is the only break and `engines` requires >= 22.12.
- ESM-only conversion of a published package (CJS `exports.require` removed) — report only if the package has stated CJS support or in-repo CJS consumers.
- Named export removed/renamed (`export { foo }` gone, `export * from` dropped, barrel `index.ts` edit) — grep consumers via `lsp` references and the package's public entry; report only if it is reachable from a published entry or in-repo importer.
- Type-level breaks on exported types: adding a required property to an interface consumers implement or construct; removing/narrowing a property; narrowing a parameter type; widening a return type (e.g. `T` → `T | undefined`); changing a generic's constraint or removing a default; converting `interface` ↔ `type` where declaration merging was used; `enum` member removed/renumbered; `const enum` change (inlined into consumers).
- Union widening on a type consumers `switch` over with `never` exhaustiveness — new member breaks their build; report only when an in-repo consumer exists or the type is a public output type.
- `peerDependencies` range narrowed or major raised, `engines.node` raised, `dependencies` ↔ `peerDependencies` moved — breaks installs for consumers on the old range; check `CHANGELOG`/major bump.
- `sideEffects: false` added while modules register globals/polyfills/CSS imports — consumers' bundlers drop the import.
- Runtime schema (zod/io-ts/TypeBox/OpenAPI) tightened: `.optional()` removed, `.strict()` added, `z.enum` member dropped, `.int()` added — old clients' payloads now 400. Check for in-repo client or fixture sending the old form.
- Next.js/Express/Fastify route changes: path param renamed, route handler method removed, `NextResponse` shape or cache semantics changed, `app/` ↔ `pages/` move changing the URL.
- React component public props (in a published/shared UI package): prop removed/renamed/required, `ref` forwarding behavior changed, default export → named. React 19: `propTypes`/`defaultProps` on function components are ignored (do not treat their removal as breaking); `forwardRef` no longer needed (ref is a prop) — removal is not a break by itself.
- `JSON.stringify`-visible changes in classes/DTOs (field rename, `toJSON` change, `Date` → string, `bigint` handling) on serialized responses/cache/localStorage values.

## Safe (do not flag)
- Changes to non-exported symbols, files under `internal/`, `__tests__`, or modules not reachable from any `exports`/`main` entry and all importers updated.
- Adding optional properties, new exports, new overloads (placed after existing ones), widening a parameter type, narrowing a return type.
- `export type` ↔ `export interface` for types never merged/extended.
- Removing deprecated `defaultProps`/`propTypes` usage in React 19 code.
- TS-only changes to application (non-library) packages with no `exports`/`types` consumer, e.g. a Next.js app's internal types.
- Version-range tweaks in `devDependencies`; lockfile churn.
- Dual-package hazard speculation without a concrete state-sharing module (singletons, `instanceof`) in the diff.
