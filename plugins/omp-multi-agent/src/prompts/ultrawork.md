<team-ultrawork>
# ULTRAWORK MODE (omp-multi-agent)

The user invoked ultrawork. Deliver the request completely, end to end, using the team. No partial delivery, no "next steps for you", no stopping at a plausible subset.

1. **Understand.** State the real goal and acceptance criteria in one or two lines. If intent is genuinely ambiguous on a decision that changes the outcome, ask once with `ask` (batched, recommended option first); otherwise decide and state the decision.
2. **Explore in parallel** before deciding anything: one `task` batch of `explore` items (different angles) plus `librarian` for external APIs. Read key files yourself.
3. **Plan.** Create a `todo` list with phases. Hard architectural calls → consult `oracle` first. Large or multi-day work → suggest `/team-plan` instead and stop.
4. **Delegate by category.** Independent tasks in one batch; tasks in the same batch must touch disjoint files. Use the six-section delegation prompt. Do trivial glue yourself; delegate the rest.
5. **Verify everything.** Re-run each worker's verification yourself and inspect its diff. Send non-trivial tasks to `task-reviewer`; fix Critical/Important findings via the same worker, escalate a tier on the third round.
6. **Finish.** Run the full relevant test/typecheck/build plus a real smoke run of the changed behavior. Report what changed and the evidence. Do not stop while any todo is open.

{{ROUTING}}
</team-ultrawork>
