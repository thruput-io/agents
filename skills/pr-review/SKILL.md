---
name: pr-review
description: Reviews a GitHub or Azure DevOps Pull Request against the thruput-io rules in this repository's `rules/Rules.yaml`, published at https://thruput.se/agents/, and posts the review as inline comments on the correct lines. Distinct from the built-in `/review` skill in that it (a) probes every rule in its own subagent, one subagent per rule group, (b) cites each violation by the rule's id and published URL, and (c) groups all inline comments into one review where the host allows it, rather than posting N individual comments. Trigger when the user provides a PR URL or asks for a rules-driven PR review.
---

# PR Review Skill

Read [`CODE_REVIEW.md`](CODE_REVIEW.md) and follow it. It is the source of truth for both what to review and how to execute the review with the host's CLI.

The rules it serves are the entries of [`rules/Rules.yaml`](../../rules/Rules.yaml); the `[[term]]`s they name are defined in [`rules/Definitions.yaml`](../../rules/Definitions.yaml), and their parents in [`rules/Principles.yaml`](../../rules/Principles.yaml). Read them from the checkout of this repository when the review runs inside it, otherwise from the raw files on `main` at `https://raw.githubusercontent.com/thruput-io/agents/main/rules/`. Read the current version rather than a cached copy. A violation is cited by the rule's id, linked to its anchor on https://thruput.se/agents/ as [`CODE_REVIEW.md` § Definitions](CODE_REVIEW.md#definitions) derives it.

It dispatches one subagent per rule group using [`PROBE_SUBAGENT_TEMPLATE.md`](PROBE_SUBAGENT_TEMPLATE.md); read that when you reach [`CODE_REVIEW.md` step 3](CODE_REVIEW.md#3-rule-evaluation).

The escalation index named by [`CODE_REVIEW.md` step 4](CODE_REVIEW.md#4-context-probing) is bundled under `references/`. The step's own instructions for reading through it to the source repository still apply.

Exact commands and payload shapes are not in `CODE_REVIEW.md` — they are in the cheat sheet for the host the PR lives on: [`references/gh-cheat-sheet.md`](references/gh-cheat-sheet.md) for GitHub, [`references/az-cheat-sheet.md`](references/az-cheat-sheet.md) for Azure DevOps (`dev.azure.com`). Read the one that matches the PR URL.

For Azure DevOps PR reviews, note that Azure DevOps does not support atomic batch review posts. Agents MUST draft all comments locally first (in `review.json` / `comments.json`) and then use the submission script or shell loop provided in `references/az-cheat-sheet.md` to iterate through all comments, post each thread individually, attach/link `ledger.md`, post the PR summary thread, and cast the vote.

## Requirements

- For a GitHub PR: `gh` CLI available.
- For an Azure DevOps PR: `az` CLI with the `azure-devops` extension available.
- The rules: a checkout of `github.com/thruput-io/agents`, or network access to its raw files on `main`.
- Network access to `github.com/ciembor/agent-rules-books` for the step 4 escalation pass.

## Files

- `CODE_REVIEW.md` — the review process.
- `PROBE_SUBAGENT_TEMPLATE.md` — the prompt one probe subagent receives, filled in per rule group.
- `references/agent-rules-books-INDEX.md`, `references/agent-rules-books-search-index.json` — escalation index, byte-for-byte mirrors of the handbook's `references/`. Refresh with:

      for f in agent-rules-books-INDEX.md agent-rules-books-search-index.json; do
        gh api "repos/thruput-io/handbook/contents/references/$f" --jq '.content' | base64 -d > "references/$f"
      done

- `references/gh-cheat-sheet.md`, `references/az-cheat-sheet.md` — host cheat sheets for filing review comments and interacting with GitHub and Azure DevOps PRs.
