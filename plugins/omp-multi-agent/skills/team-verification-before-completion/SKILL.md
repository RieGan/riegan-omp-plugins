---
name: team-verification-before-completion
description: Evidence-before-claims gate. Use before reporting any task as done, fixed, passing, or complete.
---

# Verification before completion

**No completion claim without fresh evidence from this session.**

## The gate
Before writing "done", "fixed", "passes", or "works":
1. **Identify** the command or scenario that proves the claim (test, typecheck, build, lint, a real run of the changed path).
2. **Run** it now, after your last edit. Earlier runs do not count.
3. **Read** the output: exit code, failure count, warnings. Do not skim.
4. **Claim** only what the output shows, quoting the key line.

## Red flags — stop and verify
- "Should work", "probably fixed", "looks correct".
- Reporting success based on a subagent's or tool's report without checking.
- Only running a narrower check than the claim covers (unit test passes ≠ build passes).
- Changing code after the last verification run.

## Proportionality
- Typecheck/compile for any code change.
- Tests covering the changed behavior, plus the surrounding suite.
- For UI/CLI changes: actually run the program and exercise the path.
- If a check is impossible (no runtime, missing credentials), say exactly what you could not verify and why.
