# GH CHEAT SHEET

Exact `gh` invocations and payload shapes. Referenced by [`CODE_REVIEW.md`](./CODE_REVIEW.md) and [`PROBE_SUBAGENT_TEMPLATE.md`](./PROBE_SUBAGENT_TEMPLATE.md), which own the *rules*; this file owns only the *syntax*. When a command here conflicts with a rule there, the rule wins.

Placeholders: `{owner}`, `{repo}`, `{n}` (PR number), `{path}`, `<URL>` (PR URL), `<headRefOid>` (PR head SHA).

## Availability

`gh` must be available.

## Read a pull request

| Purpose | Command |
|---|---|
| Overview (includes the head SHA) | `gh pr view <URL> --json title,body,state,author,headRefName,baseRefName,headRefOid` |
| Diff | `gh pr diff <URL>` |
| Existing review comments | `gh api repos/{owner}/{repo}/pulls/{n}/comments` |
| Check status | `gh pr checks <URL>` |
| Mergeability | `gh pr view <URL> --json mergeable,mergeStateStatus` |

`headRefOid` from the overview is the `commit_id` for inline comments. Never guess it and never substitute local `HEAD`.

## Read files at the head commit

Whole checkout:

```bash
gh pr checkout <URL>
```

Single file, without a checkout:

```bash
gh api "repos/{owner}/{repo}/contents/{path}?ref=<headRefOid>" --jq '.content' | base64 -d
```

List the changed paths:

```bash
gh api repos/{owner}/{repo}/pulls/{n}/files --paginate --jq '.[].filename'
```

## Review comment object

One object per violation. These fields and **no others** — the API rejects unknown keys.

```json
{
  "path": "src/foo.ts",
  "line": 42,
  "side": "RIGHT",
  "body": "[No suppressed exit status](https://github.com/thruput-io/handbook/blob/main/RULES.md#no-suppressed-exit-status): what is wrong, briefly."
}
```

- `path` — repo-relative.
- `line` — bare integer, no quotes; the line in the file at the head commit, not a diff hunk offset.
- `side` — `RIGHT` for added/modified lines, `LEFT` for removed. Default `RIGHT`.
- `body` — see [`CODE_REVIEW.md` step 5](./CODE_REVIEW.md#5-draft-comments-locally) for what it must say.

Multi-line variant adds `start_line` and `start_side`:

```json
{
  "path": "src/foo.ts",
  "start_line": 40,
  "start_side": "RIGHT",
  "line": 42,
  "side": "RIGHT",
  "body": "..."
}
```

## Review threads

List threads and their state:

```bash
gh api graphql -f query='
  query($owner:String!, $repo:String!, $n:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$n) {
        reviewThreads(first:100) {
          nodes { id isResolved isOutdated path line comments(first:1){nodes{body}} }
        }
      }
    }
  }' -F owner={owner} -F repo={repo} -F n={n}
```

Resolve one:

```bash
gh api graphql -f query='mutation($t:ID!){ resolveReviewThread(input:{threadId:$t}){ thread{ id } } }' -F t=<id>
```

Unresolve one — same shape:

```bash
gh api graphql -f query='mutation($t:ID!){ unresolveReviewThread(input:{threadId:$t}){ thread{ id } } }' -F t=<id>
```

## Submit one atomic review

Payload — `review.json`:

```json
{
  "commit_id": "<headRefOid>",
  "body": "<overall review body>",
  "event": "APPROVE | REQUEST_CHANGES | COMMENT",
  "comments": [ /* the comment objects above */ ]
}
```

```bash
gh api -X POST repos/{owner}/{repo}/pulls/{n}/reviews --input review.json
```

One review, one notification, comments grouped. Do **not** loop `POST /pulls/{n}/comments` — that is N standalone comments, N notifications, and not atomic.

General (non-inline) PR comment:

```bash
gh pr comment <URL> --body '...'
```

## Attach the ledger

GitHub has no API for file attachments on pull requests or reviews — the REST API accepts only Markdown text bodies, and the web UI's drag-and-drop upload runs through a browser-session pipeline that rejects token auth. The ledger therefore travels **in the review body**, as a collapsed block appended to `review.json` before the single POST in [§ Submit one atomic review](#submit-one-atomic-review):

```bash
jq --rawfile ledger ledger.md \
  '.body += "\n\n<details>\n<summary>Review ledger</summary>\n\n" + $ledger + "\n\n</details>"' \
  review.json > review-with-ledger.json
```

- The blank lines around the ledger inside `<details>` are required — without them GitHub renders the table as literal text.
- The verdict stays on top; the ledger unfolds on demand.
- Do **not** post the ledger as a separate PR comment — it belongs to the review submission, and a separate comment is a second notification.
