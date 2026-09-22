# AZ CHEAT SHEET

Exact `az` invocations for reviewing an **Azure DevOps** pull request. Counterpart to [`gh-cheat-sheet.md`](./gh-cheat-sheet.md): syntax only, no rules. Referenced by [`CODE_REVIEW.md`](./CODE_REVIEW.md) and [`PROBE_SUBAGENT_TEMPLATE.md`](./PROBE_SUBAGENT_TEMPLATE.md), which own the rules; where a command here would contradict them, the rule wins.

Requires the `azure-devops` extension (`az extension add --name azure-devops`).

Placeholders, all readable off the PR URL
`https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`:

| Placeholder | Meaning                                                                       |
|-------------|-------------------------------------------------------------------------------|
| `{org}`     | `https://dev.azure.com/NavistarCollection` — the full URL, not the bare name  |
| `{project}` | e.g. `NavistarProduction`                                                     |
| `{repoId}`  | repository **GUID**, from the PR overview; the name also works in most routes |
| `{id}`      | PR number, e.g. `51964`                                                       |
| `{sha}`     | `lastMergeSourceCommit.commitId` — the head commit, GitHub's `headRefOid`     |

Pass `--org {org} --detect false` on every command. Without `--detect false` the CLI tries to infer org and project from the git remote of the current directory, which is wrong whenever the review runs outside a checkout of that repo.

## Availability

`az` must be available, with the `azure-devops` extension installed. `az version` reports both.

Auth is either `az login` or a PAT in `AZURE_DEVOPS_EXT_PAT`.

## Read a pull request

Overview, reduced to the fields a review needs:

```bash
az repos pr show --id {id} --org {org} --detect false \
  --query '{id:pullRequestId, title:title, description:description, status:status,
            isDraft:isDraft, author:createdBy.uniqueName,
            source:sourceRefName, target:targetRefName, mergeStatus:mergeStatus,
            headCommit:lastMergeSourceCommit.commitId,
            baseCommit:lastMergeTargetCommit.commitId,
            repoId:repository.id, project:repository.project.name}'
```

`headCommit` is the head SHA every subsequent command anchors to. `mergeStatus` is `succeeded` when the PR has no conflicts — `conflicts` is the merge-conflict signal.

| Purpose                               | Command                                                                                                                                                                        |
|---------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| List active PRs                       | `az repos pr list --status active --org {org} --detect false -o table`                                                                                                         |
| Branch policies (the checks analogue) | `az repos pr policy list --id {id} --org {org} --detect false --query '[].{policy:configuration.type.displayName, status:status, blocking:configuration.isBlocking}' -o table` |
| Reviewers and their votes             | `az repos pr reviewer list --id {id} --org {org} --detect false --query '[].{name:displayName, vote:vote}' -o table`                                                           |

Policy `status` is `approved`, `queued`, `running`, or `rejected`. A blocking policy that is not `approved` is the Azure DevOps equivalent of a failing check.

Votes are integers: `10` approved, `5` approved with suggestions, `0` no vote, `-5` waiting for author, `-10` rejected.

## Changed files

Azure DevOps scopes changes to an **iteration** (one per push). Take the last iteration:

```bash
az devops invoke --area git --resource pullRequestIterations \
  --route-parameters project={project} repositoryId={repoId} pullRequestId={id} \
  --org {org} --api-version 7.1 --query 'value[-1].id' -o tsv
```

Then it changed paths:

```bash
az devops invoke --area git --resource pullRequestIterationChanges \
  --route-parameters project={project} repositoryId={repoId} pullRequestId={id} iterationId={iteration} \
  --org {org} --api-version 7.1 \
  --query 'changeEntries[].{path:item.path, change:changeType}' -o table
```

Paths are repository-absolute and begin with `/`.

## Read files at the head commit

There is no `az` command that returns a textual diff. Fetch whole files and compare, which is what [`CODE_REVIEW.md` § Read beyond the diff](./CODE_REVIEW.md#1-setup) requires anyway:

```bash
az devops invoke --area git --resource items \
  --route-parameters project={project} repositoryId={repoId} \
  --query-parameters path={path} versionDescriptor.version={sha} \
                    versionDescriptor.versionType=commit includeContent=true \
  --org {org} --api-version 7.1 --query content -o tsv
```

Or clone and read locally — often cheaper for a multi-file review:

```bash
git clone --branch {sourceBranch} https://dev.azure.com/{org-name}/{project}/_git/{repo}
```

## Existing comment threads

```bash
az devops invoke --area git --resource pullRequestThreads \
  --route-parameters project={project} repositoryId={repoId} pullRequestId={id} \
  --org {org} --api-version 7.1 \
  --query 'value[?comments[0].commentType==`text`].{id:id, status:status,
            path:threadContext.filePath, line:threadContext.rightFileStart.line,
            body:comments[0].content}'
```

The `commentType==text` filter matters: Azure DevOps stores its own activity as threads too ("Policy status has been updated", "set auto-complete", reference-updated notices). Those come back with `commentType: system` and a null `threadContext`, and counting them as review comments will corrupt a duplicate check.

Thread `status` values: `active`, `fixed`, `wontFix`, `closed`, `pending`, `byDesign`.

## Post an inline comment thread

One POST per thread. Body in a file, e.g. `thread.json`:

```json
{
  "comments": [
    {
      "parentCommentId": 0,
      "commentType": "text",
      "content": "[No suppressed exit status](https://github.com/thruput-io/handbook/blob/main/RULES.md#no-suppressed-exit-status): what is wrong, briefly."
    }
  ],
  "status": "active",
  "threadContext": {
    "filePath": "/terraform/main.tf",
    "rightFileStart": { "line": 42, "offset": 1 },
    "rightFileEnd": { "line": 42, "offset": 1 }
  }
}
```

```bash
az devops invoke --area git --resource pullRequestThreads \
  --route-parameters project={project} repositoryId={repoId} pullRequestId={id} \
  --org {org} --api-version 7.1 --http-method POST --in-file thread.json
```

- `filePath` is repository-absolute, leading `/`, as returned by the iteration changes.
- `rightFileStart`/`rightFileEnd` anchor to the head-commit side. Use `leftFileStart`/`leftFileEnd` for a removed line — the equivalent of GitHub's `side: LEFT`.
- `offset` is a 1-based **column**. Azure DevOps requires it; GitHub has no equivalent.
- Omit `threadContext` entirely for a PR-level (non-inline) comment.

Update a thread's status — the resolve/unresolve equivalent — with `--http-method PATCH`, route parameter `threadId={threadId}`, and body `{"status": "fixed"}` or `{"status": "active"}`.

## Attach the ledger

Azure DevOps attaches files to a pull request as a first-class resource — [Pull Request Attachments § Create, api-version 7.1](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-attachments/create?view=azure-devops-rest-7.1). The request body is the raw file as `application/octet-stream`.

> [!IMPORTANT]
> Azure DevOps rejects `.md` file extensions on pull request attachments with HTTP 400 Bad Request (`Allowed extensions are PNG, GIF, JPG, JPEG, DOCX, PPTX, XLSX, TXT, PDF, ZIP, GZ, LYR, MOV, MP4, CSV`). Upload `ledger.md` using the filename **`ledger.txt`**:

```bash
curl -sS --fail -X POST \
  -u ":$AZURE_DEVOPS_EXT_PAT" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @ledger.md \
  "{org}/{project}/_apis/git/repositories/{repoId}/pullRequests/{id}/attachments/ledger.txt?api-version=7.1"
```

The response is the attachment metadata; its `url` field is the download link. An attachment is not visible in the PR timeline on its own — link it from the PR-level summary thread (a thread without `threadContext`, [§ Post an inline comment thread](#post-an-inline-comment-thread)):

```
[Review ledger]({url from the response})
```

Upload the attachment and post its linking thread with the other pre-vote posts — see [§ No atomic review](#no-atomic-review).

## Vote

```bash
az repos pr set-vote --id {id} --vote approve --org {org} --detect false
```

`--vote` takes `approve`, `approve-with-suggestions`, `wait-for-author`, `reject`, or `reset`.

## No atomic review

This is the one place the Azure DevOps model does not fit [`CODE_REVIEW.md` step 7](./CODE_REVIEW.md#7-submit). GitHub accepts one payload carrying every inline comment plus the verdict, producing one review and one notification. Azure DevOps has no such endpoint: each thread is its own POST and the vote is a separate call. N comments therefore mean N requests and N notifications, and there is no way to make them atomic.

Consequences for a review run against Azure DevOps:

- Draft all comments locally first, exactly as step 5 says, and post only after the ledger is complete. The local draft is what replaces atomicity.
- Post every thread **before** casting the vote, so the verdict never lands ahead of its evidence.
- A failure partway through leaves the PR with some threads posted. Re running must not duplicate them — reconcile against existing threads first.

## Submit All Draft Comments (Azure DevOps Batch Submission)

When a review produces multiple comments in `review.json` / `comments.json`, **do NOT send the array directly to `az devops invoke`**. Azure DevOps rejects review arrays with HTTP 400 Bad Request because `pullRequestThreads` expects a single thread object per POST request.

To file all comments together, loop over your local draft comments, post each thread individually, attach/link `ledger.md`, post the PR summary thread, and cast the vote.

### Python Batch Submission Script

Save and execute this script (e.g. as `submit_az_comments.py`) to post all draft comments, upload `ledger.md` as `ledger.txt`, check existing threads to avoid duplicate comments on retries, post the summary comment with the ledger link, and cast the vote:

```python
#!/usr/bin/env python3
import json
import os
import subprocess
import sys

# Requirements: az CLI with azure-devops extension logged in or AZURE_DEVOPS_EXT_PAT set.
# Input: review.json containing {"comments": [{"path": "...", "line": 42, "side": "RIGHT", "body": "..."}], "body": "Summary..."}

org = os.environ.get("AZ_ORG")  # e.g. https://dev.azure.com/NavistarCollection
project = os.environ.get("AZ_PROJECT")  # e.g. NavistarProduction
repo_id = os.environ.get("AZ_REPO_ID")  # GUID or repo name
pr_id = os.environ.get("AZ_PR_ID")  # e.g. 51964
comments_file = sys.argv[1] if len(sys.argv) > 1 else "review.json"
vote = os.environ.get("AZ_VOTE")  # approve | approve-with-suggestions | wait-for-author | reject

def run_cmd(cmd):
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error running command: {cmd}\n{res.stderr}", file=sys.stderr)
    return res

# 1. Fetch existing threads to prevent duplicate posts on retries
get_threads_cmd = f"az devops invoke --area git --resource pullRequestThreads --route-parameters project={project} repositoryId={repo_id} pullRequestId={pr_id} --org {org} --api-version 7.1 --query \"value[?comments[0].commentType=='text'].{{path:threadContext.filePath, line:threadContext.rightFileStart.line, body:comments[0].content}}\""
res = run_cmd(get_threads_cmd)
existing_threads = json.loads(res.stdout) if res.returncode == 0 and res.stdout.strip() else []

def is_duplicate(file_path, line, body):
    for et in existing_threads:
        if et.get("path") == file_path and et.get("line") == line and et.get("body") == body:
            return True
    return False

# 2. Iterate and post each inline comment thread
with open(comments_file) as f:
    draft = json.load(f)

comments = draft.get("comments", draft if isinstance(draft, list) else [])

for i, comment in enumerate(comments, 1):
    raw_path = comment["path"]
    file_path = f"/{raw_path.lstrip('/')}"
    line = int(comment["line"])
    side = comment.get("side", "RIGHT").upper()
    body = comment["body"]

    if is_duplicate(file_path, line, body):
        print(f"[{i}/{len(comments)}] Skipping duplicate: {file_path}:{line}")
        continue

    line_key = "leftFileStart" if side == "LEFT" else "rightFileStart"
    end_key = "leftFileEnd" if side == "LEFT" else "rightFileEnd"

    payload = {
        "comments": [{"parentCommentId": 0, "commentType": "text", "content": body}],
        "status": "active",
        "threadContext": {
            "filePath": file_path,
            line_key: {"line": line, "offset": 1},
            end_key: {"line": line, "offset": 1}
        }
    }

    tmp_path = f"/tmp/az_thread_{i}.json"
    with open(tmp_path, "w") as tf:
        json.dump(payload, tf)

    print(f"[{i}/{len(comments)}] Posting comment to {file_path}:{line}...")
    post_cmd = f"az devops invoke --area git --resource pullRequestThreads --route-parameters project={project} repositoryId={repo_id} pullRequestId={pr_id} --org {org} --api-version 7.1 --http-method POST --in-file {tmp_path}"
    run_cmd(post_cmd)
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

# 3. Upload ledger if ledger.md exists on disk and append download link
summary_text = draft.get("body", "")
ledger_path = "ledger.md"

if os.path.exists(ledger_path):
    print("Uploading ledger.md as ledger.txt attachment...")
    pat = os.environ.get("AZURE_DEVOPS_EXT_PAT", "")
    if not pat:
        pat_res = subprocess.run("/usr/local/bin/get-ado-pat.sh --raw", shell=True, capture_output=True, text=True)
        pat = pat_res.stdout.strip() if pat_res.returncode == 0 else ""

    upload_cmd = f"curl -sS --fail -X POST -u ':{pat}' -H 'Content-Type: application/octet-stream' --data-binary @{ledger_path} '{org}/{project}/_apis/git/repositories/{repo_id}/pullRequests/{pr_id}/attachments/ledger.txt?api-version=7.1'"
    att_res = run_cmd(upload_cmd)
    if att_res.returncode == 0 and att_res.stdout.strip():
        try:
            att_data = json.loads(att_res.stdout)
            att_url = att_data.get("url") or att_data.get("_links", {}).get("self", {}).get("href")
            if att_url:
                summary_text += f"\n\n[Review ledger]({att_url})"
        except Exception as e:
            print(f"Warning: Failed to parse attachment response: {e}", file=sys.stderr)

# 4. Post summary PR-level comment (including ledger link)
if summary_text:
    summary_payload = {
        "comments": [{"parentCommentId": 0, "commentType": "text", "content": summary_text}],
        "status": "active"
    }
    with open("/tmp/az_summary.json", "w") as sf:
        json.dump(summary_payload, sf)
    print("Posting PR summary comment...")
    summary_cmd = f"az devops invoke --area git --resource pullRequestThreads --route-parameters project={project} repositoryId={repo_id} pullRequestId={pr_id} --org {org} --api-version 7.1 --http-method POST --in-file /tmp/az_summary.json"
    run_cmd(summary_cmd)
    if os.path.exists("/tmp/az_summary.json"):
        os.remove("/tmp/az_summary.json")

# 5. Set PR vote (cast ONLY after all comments are posted)
if vote:
    print(f"Setting PR vote to {vote}...")
    vote_cmd = f"az repos pr set-vote --id {pr_id} --vote {vote} --org {org} --detect false"
    run_cmd(vote_cmd)
```

### Shell Loop Equivalent

```bash
# Loop through comments array in review.json using jq
jq -c '.comments[]' review.json | while read -r comment; do
  path=$(echo "$comment" | jq -r '.path')
  line=$(echo "$comment" | jq -r '.line')
  body=$(echo "$comment" | jq -r '.body')

  # Ensure path is repository-absolute with a leading slash
  [[ "$path" != /* ]] && path="/$path"

  cat <<EOF > /tmp/az_thread.json
{
  "comments": [
    {
      "parentCommentId": 0,
      "commentType": "text",
      "content": $(echo "$body" | jq -R .)
    }
  ],
  "status": "active",
  "threadContext": {
    "filePath": "$path",
    "rightFileStart": { "line": $line, "offset": 1 },
    "rightFileEnd": { "line": $line, "offset": 1 }
  }
}
EOF

  az devops invoke --area git --resource pullRequestThreads \
    --route-parameters project={project} repositoryId={repoId} pullRequestId={id} \
    --org {org} --api-version 7.1 --http-method POST --in-file /tmp/az_thread.json
done
```

## Verification status

Every read command above was executed against a live PR (`NavistarCollection/NavistarProduction`, PR 51964) and returned the documented shape.

The writing paths — thread POST, thread PATCH, `set-vote`, and the attachment upload — are documented from the REST API and were **not** executed, to avoid posting to a real pull request. Confirm the payload against a scratch PR before trusting it.
