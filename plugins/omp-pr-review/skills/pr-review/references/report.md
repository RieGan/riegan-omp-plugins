# Report template

Order findings by severity, then file. Omit empty sections except Verdict, Checked, and Declined. One finding = one block; no prose between blocks.

```markdown
## PR review: <title or "working tree"> (<target>)
**Verdict: Request changes | Approve with comments | Approve** — <1–2 sentences: the deciding issues, or why it is safe>
<scope line: focus · depth · mode · finders N · verifiers M · models: finder <model>, verifier <model>>

### Findings
#### F1 · Critical · security — <title>
`path/to/file.ts:42-47` · confidence 92
<what is wrong, 1–2 sentences>
**Trigger:** <concrete input/state → consequence>
**Fix:** <concrete change>
```suggestion-or-lang
<only if it fully fixes the issue alone, ≤ 6 lines>
```

#### F2 · Important · correctness — …

### Intent
✅/❌/⚠️ per stated requirement, one line each (omit when no intent was given).

### Prior comments
- P3 `path:line` — RESOLVED by <commit/line> | STILL PRESENT | OUTDATED
- Already raised (not repeated): F-candidates matching P1, P4

### Checks
- `<command or CI check>` — pass | fail (<key line>) | skipped (<reason>)

### Checked
- <dimension>: <what was examined, ≤ 1 line each>

### Declined
- `<path:line>` — <considered issue> — <why set aside: below threshold (score), refuted by verifier (reason), pre-existing, out of scope>
```

Zero findings: Verdict `Approve`, then `No issues met the bar (confidence ≥ <threshold>).` followed by Checks/Checked/Declined, so the user sees what was examined.

Length discipline: Minor findings get 1-line description and fix; Nits are a single line `Nit: path:line — rule "<quoted>" — fix`.
