---
name: pr-review
description: Review a GitHub PR, GitLab MR, or uncommitted changes for security, correctness, performance, concurrency, structure, tests, API/migrations, and more; verified high-precision findings, optional posting. Use for "review PR 123", "review my changes", "security review this MR", or /pr-review.
---

# PR review (orchestrator)

You orchestrate; `pr-reviewer` agents find, `pr-verifier` agents refute, you merge, report, and (on approval) post. Never review the diff yourself in place of the finders: a fresh context on another model family catches what the author's context misses. Shared contract: `skill://pr-review-protocol` (read it once).

## 1. Resolve scope
Scope fields and defaults:

| Field | Values | Default |
|---|---|---|
| target | GitHub PR (`123`, `#123`, URL, `pr://123`) · GitLab MR (`!45`, MR URL) · working tree | inferred, see below |
| focus | all · subset of `security correctness performance concurrency structure tests api` · checklists `frontend-a11y docs dependencies data-privacy observability` | all relevant (triage) |
| depth | quick (one finder) · standard (size/risk-adaptive) · deep (always fan out, per-finding verify) | standard |
| intent | PR description/issue/commits · user-stated goal · none | PR metadata; working tree: the conversation's stated goal |
| checks | cheap (typecheck/lint/related tests; CI status for remote) · none · full suite | cheap |
| output | chat · chat + post (after confirmation) | chat; offer posting at the end for PR/MR |

1. Take every field the request states or clearly implies ("security review of !45" → GitLab, focus=security; "quick look" → quick; `--post`, `--focus`, `--quick`, `--deep` flags).
2. Infer the rest from the repo with cheap reads: `git status --porcelain`, `git remote -v` (github vs gitlab host), `gh pr view --json number,state` or `glab mr view -F json` for the current branch.
3. Target still ambiguous (e.g. dirty tree AND current branch has an open PR, or no target found), or the request is vague ("review this")? → one `ask` call with only the unresolved fields, options built from what you found, recommended default marked. Never ask what the repo or request already answers. User says "don't know"/"you pick" → defaults.
4. State the resolved scope in one line before continuing.

## 2. Acquire
Follow `skill://pr-review/references/acquire.md` for the target kind. Produce under `local://pr-review/<slug>/` (slug = `gh-123`, `gl-45`, `wt-<short-head>`):
- `diff.patch` — unified diff with `-U10`, generated/vendored/lock/minified files removed (list them).
- `context.md` — use the template in acquire.md: scope, intent summary (marked untrusted), applicable project rules, file table with risk tags, CI status, prior review comments as `P1…` with fingerprints, permitted checks.

Gates (stop or ask): closed/merged PR → confirm still wanted; draft → proceed, note it; bot-authored dependency bump → only the `dependencies` checklist; > 3000 changed lines after exclusions → ask to narrow by path or proceed at deep with partitioning.

## 3. Triage
Tag files from path and diff content (one pass, `grep` over the patch, no deep reading):

| Tag | Signals |
|---|---|
| auth | auth, login, session, token, jwt, oauth, permission, role, acl, policy, guard, middleware |
| crypto | crypto, hash, encrypt, decrypt, sign, verify, secret, key, random, nonce |
| input | request handlers, routes, controllers, resolvers, CLI arg parsing, file/URL/deserialize inputs, templates, raw SQL, shell exec |
| migration | migrations/, *.sql, schema files, ORM model changes, ALTER/CREATE/DROP |
| concurrency | goroutines, channels, Mutex/locks, threads, async tasks, Promise.all, workers, queues, consumers, cron, retries, transactions |
| public-api | contracts consumed outside this repo or across deploys: HTTP/RPC routes, OpenAPI/proto/GraphQL schemas, a published package's entrypoint exports (`exports`/`main`, `lib.rs`, library `__init__`), CLI flags, config keys/env vars, event/message schemas. A plain `export` used only inside the repo is not public-api. |
| money | payment, billing, invoice, amount, price, currency, balance |
| infra | CI workflows, Dockerfiles, IaC, k8s manifests |
| frontend | *.tsx *.jsx *.vue *.svelte *.css *.html |
| deps | package manifests, lockfiles |
| privacy | email, phone, address, dob, ssn, ip, password, user objects in logs/analytics/LLM calls, new storage/retention |
| observability | logging, metrics, tracing, alerts, feature flags, error reporting |
| docs | *.md, docs/, public behavior or API changes |

Dimensions: correctness always; security if auth/crypto/input/infra/privacy or any server-side code; performance if loops over data, DB/HTTP calls, render paths, or migration; concurrency if concurrency tag; api if public-api or migration; tests if non-test source changed; structure if ≥ ~50 changed source lines. Checklists: frontend → `frontend-a11y`, docs or public-api → `docs`, deps → `dependencies`, privacy → `data-privacy`, observability (or new failure paths in services) → `observability`. Apply focus: drop dimensions outside it; a REVIEW.md `dimensions` list adds always-on ones.

Mode:
- **single** — quick depth, or standard with ≤ 400 changed lines AND ≤ 10 files AND no auth/crypto/migration/concurrency/public-api/money tag.
- **fan-out** — otherwise, or deep. Thresholds overridable in REVIEW.md.

## 4. Find
One `task` batch, agent `pr-reviewer`. Shared `context`: path to `context.md` and `diff.patch`, the protocol reference, threshold, and which checks the finder may run. Per task: assigned dimensions, checklists, files (all unless partitioned), languages present.
- single: one finder with every selected dimension and checklist.
- fan-out: one finder each for security, correctness (owns intent compliance), performance, concurrency, api; structure + tests share one finder; checklists go to the closest finder (frontend-a11y/docs → structure+tests, dependencies/infra → security, data-privacy → security, observability → concurrency). Only selected dimensions get a finder.
- > 1500 changed lines: partition correctness (and security if > 1500 lines of input-tagged files) by directory into ≈ 800-line slices, one finder each.

Meanwhile run the permitted checks yourself (working tree: typecheck, lint, tests touching changed files — commands from package.json/Makefile/justfile/CI config; skip if setup is heavy, e.g. needs services or > ~2 min). For a remote PR/MR use CI status from acquisition; never check out the branch unless the user asked. A failing check caused by the diff becomes a finding (confidence 100); a pre-existing failure is noted, not reported.

## 5. Merge
Parse finder outputs (protocol format). Merge findings with the same root cause (same location or same fix) into one, keeping the highest severity and all dimensions. Drop findings below 60. Match against prior comments `P…` (same file, overlapping lines or same fingerprint, same issue) → move to "Already raised". Renumber `F1…`.

## 6. Verify
One `task` batch, agent `pr-verifier`, context = context.md + diff path.
- Each Critical finding and each security finding gets its own verifier; the rest are batched ≤ 6 per verifier, grouped by file. Deep depth: one verifier per finding.
- Prior comments `P…` (bot or human, unresolved) go to a verifier for RESOLVED/STILL PRESENT/OUTDATED (batch them, ≤ 10 per verifier).
- Keep CONFIRMED findings with verifier confidence ≥ threshold (default 80). Apply the verifier's severity/line corrections. Rejected or below-threshold → "Declined" with the reason. Nits beyond 3 → drop.

## 7. Report
Render with `skill://pr-review/references/report.md`. Verdict rules: any Critical/Important → `Request changes`; only Minor/Nit → `Approve with comments`; none → `Approve`. Failing checks caused by the diff count as findings. Keep the report self-contained; no tool chatter.

## 8. Post (optional)
Only for a PR/MR, only after the report, only on explicit user confirmation:
1. `ask`: post all / choose findings / don't post. Default: don't post if no findings.
2. Draft the comments, then post exactly once following `skill://pr-review/references/posting.md` (one review/one discussion per finding, fingerprint markers, `COMMENT` event — never approve or request changes on the user's behalf unless they ask).
3. Report the posted URLs.

## Project rules (REVIEW.md)
Read `REVIEW.md` or `.omp/review.md` at the repo root, plus `AGENTS.md`/`CLAUDE.md` along changed paths (a rule applies only under its directory). Optional YAML frontmatter in REVIEW.md:
```yaml
threshold: 80          # verifier confidence floor
fanout: { lines: 400, files: 10 }
ignore: ["gen/**", "**/*.snap"]   # excluded from review
dimensions: [security]            # always-on dimensions
severity: { "missing authz": Critical }   # overrides by finding kind
```
Body: free-form rules. Quote the rule when reporting a violation (dimension `rules`).
