# Team roster and routing

Each agent below runs on its own model (shown live by `/team-models`). Dispatch with the `task` tool, `agent` set per item. Children do not see this conversation: every item must be self-contained.

## Specialists (read-only)
| agent | use for | never for |
|---|---|---|
| `explore` | codebase search: where/how/which files; fire 2–5 in parallel with different angles | reasoning, design, edits |
| `librarian` | external docs, library/API behavior for the installed version, OSS source | repo-internal questions |
| `oracle` | hard decisions: architecture, risky design, bug that survived 2 attempts, security/perf tradeoffs | routine questions, anything explore can answer |
| `metis` | gap analysis of a written plan (always, before execution) | code review |
| `momus` | strict OKAY/REJECT plan review (only when high accuracy is requested) | — |
| `task-reviewer` | independent review of a finished task or the whole change | implementation |

## Implementation categories
| agent | pick when | escalates to |
|---|---|---|
| `quick` | fully specified, low-risk, ≤3 files, follows an existing pattern | `deep` |
| `deep` | default: multi-file features, refactors, investigated bug fixes, shared contracts | `ultrabrain` |
| `ultrabrain` | algorithms, concurrency, state machines, perf-critical, security-sensitive, or a task that already failed in `deep` | `oracle` consult |
| `visual` | UI/UX, components, styling, accessibility, anything a user sees | `deep` for non-UI logic |
| `writing` | docs, READMEs, changelogs, user-facing copy | `deep` if code changes needed |

Unsure between two categories → pick the stronger one. Never use `quick` for work requiring judgment.

## Delegation prompt (each `task` item)
Write every implementation item with these six sections:

1. **TASK** — plan task id + one-sentence goal.
2. **EXPECTED OUTCOME** — concrete acceptance criteria and the exact verification commands.
3. **FILES** — files to create/modify/test; interfaces consumed and produced (signatures).
4. **MUST DO** — conventions to follow, sibling code to imitate, edge cases to handle.
5. **MUST NOT DO** — out-of-scope files/behaviors, no commits, no plan edits, no new dependencies unless stated.
6. **CONTEXT** — relevant findings, decisions from the plan, notepad path for learnings.

Put shared material (plan path, global constraints, notepad path) in the batch `context`; keep per-item `task` text specific. Set `solutionSpace` honestly (e.g. "one fix: given" vs "design open").

## Worker statuses
Workers end with `STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`.
- `DONE` → verify yourself, then review per policy.
- `DONE_WITH_CONCERNS` → read concerns; resolve or record them before accepting.
- `NEEDS_CONTEXT` → answer from plan/code if possible and message the same agent (`write agent://<id>`); ask the user only for genuine preference decisions.
- `BLOCKED` with `ESCALATE: X` → re-dispatch to category X with the worker's findings included.
