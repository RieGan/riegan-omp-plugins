# Structure review
Covers: maintainability defects with a named mechanism by which they cause bugs or block change — drifting duplication, layer violations, speculative abstraction, dead code added by the diff, misleading names/comments, god-function growth, deviation from an established repo pattern.
Not covered (other dimension owns it): wrong runtime behavior (correctness), public contract/compat breaks (api), missing tests (tests), hot-path cost (performance), races (concurrency), vulnerabilities (security).

Bar: approve when the change improves or maintains code health. Where options are equally valid, the author's choice wins; consistency with existing code is the only tiebreak. If you cannot state "X will go wrong / be hard to change because Y", do not report.

## Method
1. List what the diff adds: new functions, modules, types, abstractions, config knobs, and which layer each lives in (transport/view, domain/service, persistence, infra).
2. For each new helper/constant/rule, search the repo (`grep`, `lsp` references) for an existing equivalent. Record both locations before reporting duplication.
3. For each new abstraction (interface, generic, factory, option, hook, plugin point), count real callers in the diff and repo. One implementation + one caller = speculative.
4. Find the established pattern for the same task (error handling, data access, config loading, logging, naming of the same kind of thing) in sibling files; cite its path. Report only deviations from a pattern that is clearly dominant (≥3 sites or documented).
5. Check each added line for dead weight: unused params/exports/branches, commented-out code, debug prints, unreachable paths after the diff's own changes, leftovers of an approach the diff abandoned.
6. Read new names and comments against the code they describe; test whether a caller would misuse them.
7. For grown functions, identify the distinct responsibilities now mixed; report only if a concrete change to one would risk the other.
8. Rank by bug likelihood; drop everything you could only justify as "cleaner".

## Flag
### Duplication that will drift
- Business rule re-implemented (price/tax calc, permission check, validation, parsing, retry policy, status mapping) while a helper exists — cite both `path:line`; trigger = the rule changes in one place and not the other, or the copies already differ (show the difference).
- Same constant/magic value/enum-to-string mapping defined in 2+ places that must stay equal — name the consumers that break if they diverge.
- Copy-pasted block that already differs subtly between copies (one has a fix the other lacks) — quote the difference.

### Layer and boundary violations
- DB/ORM/query call, raw SQL, or filesystem access in a view/handler/component/CLI layer when the repo routes it through a repository/service — cite the existing path; report as Important only if it bypasses validation, authorization, transaction, or caching that the service layer provides.
- Domain/business decisions inside transport code (HTTP handler computes eligibility, serializer mutates state) when equivalent logic lives in the domain layer.
- Lower layer importing from higher (domain imports from handler/UI; library imports app config) creating a cycle or hidden global dependency.
- New module reaching into another module's internals (private fields, `_underscore`/`internal` paths) instead of its public surface that exists.

### Over-engineering
- Interface/abstract class/generic parameter/strategy/factory/config flag with exactly one implementation and no second caller in the diff or stated plan — "solve the problem needed now". Trigger = extra indirection every reader must traverse, and for flags, an untested branch.
- Wrapper that only forwards to one function with no added behavior, introduced by the diff.
- New parallel mechanism (own cache, own retry loop, own logger, own HTTP client, own config parser) where the repo has one — cite it.

### Dead and leftover code (added by the diff)
- Commented-out code, `console.log`/`print`/`dbg!`/`fmt.Println` debug output, `debugger`, focused/skipped tests committed by accident.
- Functions, params, exports, fields, imports with zero references after this change (verify with references/grep, including dynamic/reflective use and public API of a library).
- Branch that can never execute given types or earlier guards in the same function (cite the guard).
- Old code path left alive after the diff replaced all its callers.
- TODO/FIXME without owner or issue link — only when a quoted repo rule requires it (Nit).

### Names and comments that mislead
- Name states the opposite or a narrower/wider meaning than the behavior (`getUser` that creates, `isValid` that mutates, `ms` param taking seconds, `list` returning a map) — show the call site that would misuse it.
- Comment/docstring that contradicts the code it sits on (stale after this diff changed the behavior; wrong param units, wrong error contract) — quote both.
- Boolean param whose true/false meaning is invisible at call sites AND two adjacent same-typed params that can be swapped silently — only when the diff adds a call with a plausible swap.

### Function size and mixed responsibility
- Function the diff grows into several unrelated phases (parse + authorize + persist + notify) with shared mutable locals, so a change to one phase must reason about all — cite the coupling variable. Length alone is never enough.
- Deeply nested conditionals added where an early return would remove a state that must be tracked across branches and the diff already contains an error from it.

### Pattern inconsistency
- Diff handles errors, validates input, names routes/tables/events, or registers components differently from the dominant sibling pattern in a way that bypasses a shared mechanism (central error mapper, middleware, registry, codegen input) — cite the pattern file and what is skipped as a result.

## Do not flag
- Taste: naming preference, ordering, "more idiomatic", "could use pattern/library X", early-return vs nested, ternary vs if. Anything a formatter/linter enforces.
- Small duplication: <~5 lines, or only 2 copies with no shared business rule. Duplication across test cases, fixtures, or generated/mock code.
- File or function length per se; a long function that is flat and linear (switch tables, config, straight-line setup).
- Refactors outside the diff; "while you're here" cleanup of untouched code; pre-existing dead code or smells.
- Abstractions the PR description or an adjacent change justifies with a second user; extension points in public library APIs; interfaces used for test seams/mocking that the repo already uses.
- Author's choice among equally valid designs; different-but-consistent-with-sibling-file code.
- Missing comments/docs, missing types, "magic number" with an obvious local meaning.
- Code that looks unused but is referenced by reflection, templates, serialization tags, framework conventions, exports of a published package, or build/entry configs.
- Intentional temporary code marked with a tracking issue; feature-flag branches awaiting rollout.
- Naming in tests, scripts, migrations, one-off tools.
- "This should be split into smaller PRs/commits", "extract a function" without a drift or coupling mechanism.

## Severity anchors
- Critical: essentially never. Use only when structure defect is proven to produce a wrong result on a common path — then report in the correctness dimension.
- Important:
  - Second copy of a tax/permission/validation rule added in a handler while the service helper has since gained a fix; copies already return different results for the same input.
  - Handler writes via raw query, skipping the service's tenant check and audit hook that every other writer path uses.
  - New code imports a handler-layer module from the domain package, creating a cycle that breaks init order.
- Minor:
  - Helper `parseDuration(s)` returns seconds but is named/documented as ms; the diff's only caller passes the result to a ms API.
  - Unused `retryPolicy` strategy interface with one implementation, adding a registry callers must update.
  - Leftover `console.log(payload)` of a request body in a service function; commented-out previous implementation retained.
  - Docstring says "returns null when not found" but the function now throws.
- Nit (only with a quoted project rule): TODO without issue reference where REVIEW.md/AGENTS.md mandates one; file-placement rule violation.

## Language notes
None. Structural judgments are language-agnostic and rely on repo context; no `dimensions/structure/<lang>.md` files exist. For language-specific dead-code or visibility rules (exports, `pub`, build tags), defer to the repo's own conventions found in step 4.
