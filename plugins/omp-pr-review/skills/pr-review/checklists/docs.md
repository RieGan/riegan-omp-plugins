# Docs checklist

Load when: diff changes `*.md`/`docs/`/`CHANGELOG*`/README/doc comments/OpenAPI specs, or changes public behavior: exported API, CLI flags/commands, config keys, env vars, error messages users see, defaults, file formats, wire protocol.

## Flag
- Public behavior change with no doc update — a CLI flag, config key, env var, exported function signature, default, or endpoint was added/renamed/removed/changed, the repo keeps docs for that surface (grep `docs/`, README, man pages, OpenAPI) and the doc still states the old behavior or omits the new one. Quote the doc line or name the missing section.
- Changelog missing — repo maintains `CHANGELOG.md`/`.changeset/`/release-notes convention (prior commits touch it) and this user-visible change adds no entry. Skip if the changelog is generated from commits.
- Doc contradicts the new code — README/docs/doc comment states a default, parameter, return value, error, or step that the changed code no longer matches. Show both lines.
- Example no longer works — code snippet or command in docs/README/doc comment calls a renamed/removed symbol, wrong signature, removed flag, or old import path. Name the exact line that fails to compile/run.
- Removed or renamed docs anchor/file still linked from elsewhere in the repo (grep the old path/anchor).
- Doc comment contradicts its function after the diff changed it — `@param`/`@returns`/docstring names a removed parameter, wrong type, or wrong unit.
- Migration needed but undocumented — breaking change (removed option, changed default, schema/format change) with no upgrade note where the repo documents upgrades.
- New config/env var read in code but absent from the repo's config reference or `.env.example` when those files list the others.

## Do not flag
- Prose style, grammar, tone, wording preference, heading capitalization, line wrapping (linters own this).
- Missing docs for internal/private/unexported code, test helpers, or refactors with no behavior change.
- Missing docs when the repo has no docs for that surface; one undocumented sibling does not set a convention.
- Docs-only PRs for "not thorough enough"; report only wrong statements.
- Missing doc comments on every function ("add JSDoc/godoc"), unless a quoted project rule requires them.
- Generated docs (API reference, typedoc, swagger output) not regenerated, when CI regenerates them.
- TODO/FIXME comments, or version numbers in docs that a release process bumps.
- Link rot to external sites you did not verify.

## Severity
- Critical: documented command/example now destroys data or misconfigures security (e.g. docs say a flag is safe-by-default and the code flipped it).
- Important: breaking change or removed/renamed public option with no doc/changelog/migration note; docs state behavior that is now wrong on a main path; README quick-start no longer runs.
- Minor: stale doc comment or secondary example, missing env var in the reference list, broken internal link.
