# GH CHEAT SHEET

Exact `gh` invocations and payload shapes. Referenced by [`CODE_REVIEW.md`](../CODE_REVIEW.md) and [`PROBE_SUBAGENT_TEMPLATE.md`](../PROBE_SUBAGENT_TEMPLATE.md), which own the *rules*; this file owns only the *syntax*. When a command here conflicts with a rule there, the rule wins.

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

Nothing is checked out and no probe fetches. `scripts/prepare.mjs` downloads one snapshot of the head commit, `gh api repos/{owner}/{repo}/tarball/<headRefOid>`, takes the changed files, their call sites, the diff, and the tree listing out of it into the workdir, and discards it. Everything a probe reads is under the workdir.

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

`scripts/review.mjs` does this: it builds `review.json` from the probes' ledgers and posts it with one call, `gh api -X POST repos/{owner}/{repo}/pulls/{n}/reviews --input review.json`, with the ledger table appended to the body as a collapsed block. One review, one notification, comments grouped. Do **not** post comments one at a time, and do not post the ledger as a separate comment.

No review is posted by hand. The changes-requested verdict of [`CODE_REVIEW.md` step 2](../CODE_REVIEW.md#2-pre-review-content-checks) is posted by `scripts/prepare.mjs` when a check run failed or the pull request has conflicts.
