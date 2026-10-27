---
name: team-test-driven-development
description: Red-green-refactor discipline for implementing features and bug fixes in projects that have a test suite. Use before writing implementation code for any behavior change.
---

# Test-driven development

## The cycle
1. **Red** — write the smallest test that expresses the next required behavior (or reproduces the bug). Run it. It MUST fail, and fail for the expected reason (assertion, not import/syntax error). A test that passes before the change proves nothing; fix the test.
2. **Green** — write the minimum code that makes it pass. Run the test; then run the surrounding suite (file/package) to catch regressions.
3. **Refactor** — clean up names and duplication with tests green. Run them again.

Repeat per behavior. Do not write a batch of tests then a batch of code.

## What to test
- Consumer-visible behavior: inputs → outputs, state transitions, error cases, boundaries (empty, one, many, max, invalid).
- For bug fixes: the exact failing scenario first, then the neighbouring edge that likely shares the cause.

## What not to test
- Wiring, mocks echoing mocks, private implementation details, source text, framework behavior, trivial getters.
- Tests that cannot fail if the feature is deleted.

## Follow the project
- Use the existing test framework, file layout, naming, fixtures, and helpers. Find a sibling test and imitate it.
- Run tests with the project's own command (package.json scripts, Makefile, CI config). Record the exact command in your report.

## No test suite?
Do not invent a framework. Verify with a throwaway script or a direct run of the changed path, delete the script, and say so in the report.
