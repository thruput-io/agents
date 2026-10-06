---
name: pr-review
description: Reviews a GitHub or Azure DevOps Pull Request against the thruput-io rules in this repository's `rules/Rules.yaml`, published at https://thruput.se/agents/, and posts the review as inline comments on the correct lines. Distinct from the built-in `/review` skill in that it (a) probes every rule in its own subagent, one subagent per rule group, (b) cites each violation by the rule's id and published URL, and (c) groups all inline comments into one review where the host allows it, rather than posting N individual comments. Trigger when the user provides a PR URL or asks for a rules-driven PR review.
---

# PR Review Skill

Read [`CODE_REVIEW.md`](CODE_REVIEW.md) and follow it. It is the source of truth for both what to review and how to execute the review. Two scripts do the parts a model must not be trusted with: `scripts/prepare.mjs` resolves the pull request once, downloads the repository at the head commit, computes the change set and the surface, reads the changed files once, and writes one instructions file per probe; `scripts/review.mjs` refuses any probe's ledger that does not answer its instructions row for row, then builds and posts the review from the ledgers alone.

The rules it serves are the entries of [`rules/Rules.yaml`](rules/Rules.yaml); the `[[term]]`s they name are defined in [`rules/Definitions.yaml`](rules/Definitions.yaml), and their parents in [`rules/Principles.yaml`](rules/Principles.yaml). `prepare.mjs` reads them, once, from `${CLAUDE_SKILL_DIR}/rules/`: the rules this skill was installed with, linked into the skill from this repository's `rules/`. A violation is posted as breaking the principle its rule protects, linked to that principle's anchor on https://thruput.se/agents/.

It dispatches one subagent per instructions file, as [`CODE_REVIEW.md` step 2](CODE_REVIEW.md#2-probe) sets out. What a subagent does is fixed by constants in the schema of that file, `instructions` for every probe and `task` for each kind, which every file carries; `prepare.mjs` populates the rest, so there is no prompt to write and no schema to hand over. The subagents that probe our rules run on the cheapest model available; the escalation subagent runs on the most capable one. What crosses between the reviewing context, a probe, and the review is shaped by the schemas published under `https://thruput.se/agents/schemas/review/`: the change set, the surface, the instructions a probe receives, the ledger its rows go into, and each violation in it. Validate against them rather than reading a shape off this prose.

The escalation index is bundled under `references/`; `prepare.mjs` downloads every ruleset it names, once, and hands them to the escalation probe.

Exact commands and payload shapes are not in `CODE_REVIEW.md` — they are in the cheat sheet for the host the PR lives on: [`references/gh-cheat-sheet.md`](references/gh-cheat-sheet.md) for GitHub, [`references/az-cheat-sheet.md`](references/az-cheat-sheet.md) for Azure DevOps (`dev.azure.com`). Read the one that matches the PR URL.

For Azure DevOps PR reviews, note that Azure DevOps does not support atomic batch review posts. Agents MUST draft all comments locally first (in `review.json` / `comments.json`) and then use the submission script or shell loop provided in `references/az-cheat-sheet.md` to iterate through all comments, post each thread individually, attach/link `ledger.md`, post the PR summary thread, and cast the vote.

## Requirements

- For a GitHub PR: `gh` CLI, `node`, and `tar` available; the scripts fetch their other tools with `npx`.
- For an Azure DevOps PR: `az` CLI with the `azure-devops` extension available; the scripts do not apply there.
- The rules: `rules/` in the skill, links to this repository's rules and what they rest on, up to the axioms, which resolve on macOS and Linux.
- Network access to `raw.githubusercontent.com/ciembor/agent-rules-books`, from which `prepare.mjs` downloads the escalation rulesets.

## Files

- `CODE_REVIEW.md` — the review process.
- `scripts/prepare.mjs`, `scripts/review.mjs` — the two commands the process runs; `scripts/lib.mjs` holds their logic, tested by `scripts/lib.test.mjs`.
- `rules/`, `schemas/` — this repository's rules and schemas, linked into the skill.
- `https://thruput.se/agents/schemas/review/` — the shapes the process passes around, from this repository's `schemas/review/`: the change set, the surface, the review, the rulebook, the instructions for each kind of probe, the ledger, and the violation.
- `references/agent-rules-books-INDEX.md`, `references/agent-rules-books-search-index.json` — escalation index, byte-for-byte mirrors of the handbook's `references/`. Refresh with:

      for f in agent-rules-books-INDEX.md agent-rules-books-search-index.json; do
        gh api "repos/thruput-io/handbook/contents/references/$f" --jq '.content' | base64 -d > "references/$f"
      done

- `references/gh-cheat-sheet.md`, `references/az-cheat-sheet.md` — host cheat sheets for filing review comments and interacting with GitHub and Azure DevOps PRs.
