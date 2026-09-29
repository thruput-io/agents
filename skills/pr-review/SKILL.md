---
name: pr-review
description: Reviews a GitHub or Azure DevOps Pull Request against the thruput-io handbook rules and posts the review as inline comments on the correct lines. Distinct from the built-in `/review` skill in that it (a) follows the handbook at `github.com/thruput-io/handbook` (specifically `CODE_REVIEW.md`), (b) probes every rule in its own subagent, and (c) groups all inline comments into one review where the host allows it, rather than posting N individual comments. Trigger when the user provides a PR URL or asks for a handbook-driven PR review.
---

# PR Review Skill

Read [`CODE_REVIEW.md`](https://raw.githubusercontent.com/thruput-io/handbook/main/CODE_REVIEW.md) and follow it. It is the source of truth for both what to review
and how to execute the review via the `gh` CLI. Read the current version rather than a cached copy.

It dispatches one subagent per probe using [`PROBE_SUBAGENT_TEMPLATE.md`](https://raw.githubusercontent.com/thruput-io/handbook/main/PROBE_SUBAGENT_TEMPLATE.md); read that when you
reach [`CODE_REVIEW.md` step 3](https://github.com/thruput-io/handbook/blob/main/CODE_REVIEW.md#3-library-search-and-rule-evaluation-run-in-parallel).

The escalation index named by [`CODE_REVIEW.md` step 4](https://github.com/thruput-io/handbook/blob/main/CODE_REVIEW.md#4-escalate-when-the-ledger-comes-back-clean) is bundled under `references/` so it is available
without the handbook checkout. Use the bundled copy; the step's own instructions for reading
through it to the source repository still apply.

Exact commands and payload shapes are not in `CODE_REVIEW.md` — they are in the cheat sheet for the
host the PR lives on: [`references/gh-cheat-sheet.md`](references/gh-cheat-sheet.md) for GitHub, [`references/az-cheat-sheet.md`](references/az-cheat-sheet.md) for Azure DevOps
(`dev.azure.com`). Read the one that matches the PR URL.

For Azure DevOps PR reviews, note that Azure DevOps does not support atomic batch review posts. Agents MUST draft all comments locally first (in `review.json` / `comments.json`) and then use the submission script or shell loop provided in `references/az-cheat-sheet.md` to iterate through all comments, post each thread individually, attach/link `ledger.md`, post the PR summary thread, and cast the vote.

## Requirements

- For a GitHub PR: `gh` CLI available.
- For an Azure DevOps PR: `az` CLI with the `azure-devops` extension available.
- Access to `github.com/thruput-io/handbook`.
- Network access to `github.com/ciembor/agent-rules-books` for the step 4 escalation pass.

## Files

- `references/agent-rules-books-INDEX.md`, `references/agent-rules-books-search-index.json` —
  escalation index, byte-for-byte mirrors of the handbook's `references/`. Refresh with:

      for f in agent-rules-books-INDEX.md agent-rules-books-search-index.json; do
        gh api "repos/thruput-io/handbook/contents/references/$f" --jq '.content' | base64 -d > "references/$f"
      done

- `references/gh-cheat-sheet.md`, `references/az-cheat-sheet.md` —
  bundled host cheat sheets for filing review comments and interacting with GitHub and Azure DevOps PRs.

