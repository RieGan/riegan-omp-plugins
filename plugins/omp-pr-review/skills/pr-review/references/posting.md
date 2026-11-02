# Posting review comments

Post only after the user confirmed which findings to post. Post once; on partial failure, report what was posted and do not retry blindly (re-read existing comments first to avoid duplicates).

## Comment body (both platforms)
```markdown
**<Severity>** · <dimension> — <title>

<what is wrong, 1–2 sentences>

**Trigger:** <input/state → consequence>
**Fix:** <concrete change>

```suggestion
<replacement for exactly the commented line range; only when it fully fixes the issue alone, ≤ 6 lines>
```
<!-- pr-review:fp=<dimension>:<path>:<slug-of-title> -->
```
- Suggestion blocks replace the commented lines verbatim (GitHub applies them; GitLab uses ```` ```suggestion:-0+0 ```` for single-line). Never include a suggestion that needs edits elsewhere.
- Findings whose line is not in the diff (e.g. a deletion that broke a caller elsewhere) go into the summary body, not inline.

## GitHub: one review with inline comments
Write `local://pr-review/<slug>/review.json`:
```json
{
  "commit_id": "<headRefOid>",
  "event": "COMMENT",
  "body": "<verdict line + findings not attachable inline + 'Reviewed by omp-pr-review'>",
  "comments": [
    { "path": "src/a.ts", "line": 47, "start_line": 42, "side": "RIGHT", "start_side": "RIGHT", "body": "<comment body>" }
  ]
}
```
```sh
gh api --method POST repos/{owner}/{repo}/pulls/<N>/reviews --input <review.json path>
```
- `line` = last line of the range in the new file; omit `start_line`/`start_side` for single lines. Lines must be inside a diff hunk on the RIGHT side, or the API returns 422 — move that finding to `body`.
- `event` stays `COMMENT` unless the user explicitly asked to approve or request changes.
- `commit_id` must equal the current head; if the PR moved since acquisition, stop and re-review the new commits first.

## GitLab: one discussion per finding + one summary note
Get the latest version SHAs: `glab api projects/:id/merge_requests/<IID>/versions` → first entry's `base_commit_sha`, `start_commit_sha`, `head_commit_sha`. Per finding write a JSON body and post:
```json
{
  "body": "<comment body>",
  "position": {
    "position_type": "text",
    "base_sha": "<base_commit_sha>", "start_sha": "<start_commit_sha>", "head_sha": "<head_commit_sha>",
    "old_path": "src/a.ts", "new_path": "src/a.ts",
    "new_line": 47
  }
}
```
```sh
glab api -X POST projects/:id/merge_requests/<IID>/discussions --input <finding.json path>
```
- Added/changed lines: `new_line`. Removed lines: `old_line` only. Unchanged context lines: both `old_line` and `new_line`.
- Verify each response: `notes[0].type == "DiffNote"` with a `position`. A `DiscussionNote` means the line was not in the diff: delete it (`glab api -X DELETE projects/:id/merge_requests/<IID>/notes/<note_id>`) and fold the finding into the summary.
- Summary (verdict + non-inline findings): `glab mr note <IID> -m "<summary>"`.
- Do not approve (`glab mr approve`) unless the user explicitly asked.

## Re-review
Prior findings judged RESOLVED by the verifier: reply on the existing thread ("Resolved in <sha>") only if the user approved posting; resolve the thread only if the user asked (GitHub: GraphQL `resolveReviewThread`; GitLab: `PUT …/discussions/<id>?resolved=true`).
