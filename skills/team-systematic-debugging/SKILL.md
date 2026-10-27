---
name: team-systematic-debugging
description: Root-cause-first debugging. Use for any bug, test failure, crash, or unexpected behavior before proposing a fix, and whenever a previous fix attempt failed.
---

# Systematic debugging

**No fix without a root cause.** Symptom patches create new bugs.

## Phase 1 — Investigate
1. Read the full error: message, stack trace, exit code, logs. Note file:line.
2. Reproduce reliably. Write down the exact steps/command. If you cannot reproduce, gather more data; do not guess.
3. Check what changed: `git log -p`, `git diff`, dependency/config changes.
4. In multi-component flows, instrument each boundary (input/output of each layer) to find the layer where good data turns bad.
5. Trace the bad value backwards to where it originates. Fix at the source, not where it surfaces.

## Phase 2 — Compare
Find working code that does something similar in this codebase. List every difference between working and broken, however small.

## Phase 3 — Hypothesize and test
State one hypothesis: "X is the root cause because Y." Make the smallest change that tests it. One variable at a time. If it fails, form a new hypothesis; do not stack fixes.

## Phase 4 — Fix
1. Write a failing test that reproduces the bug.
2. Fix the root cause.
3. Verify the test passes and the surrounding suite is green.

## Escalate
After 3 failed fix attempts, stop. The problem is likely architectural or your model of the system is wrong. Report what you tried, what you observed, and what you now suspect (or ask `oracle` if you can spawn it).
