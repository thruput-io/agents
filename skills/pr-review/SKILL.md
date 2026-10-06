---
name: pr-review
description: Reviews a GitHub or Azure DevOps Pull Request against the thruput-io rules in this repository's `rules/Rules.yaml`, published at https://thruput.se/agents/, and posts the review as inline comments on the correct lines. Distinct from the built-in `/review` skill in that it (a) probes every rule in its own subagent, one subagent per rule group, (b) cites each violation by the rule's id and published URL, and (c) groups all inline comments into one review where the host allows it, rather than posting N individual comments. Trigger when the user provides a PR URL or asks for a rules-driven PR review.
---

# PR Review Skill

Read [`CODE_REVIEW.md`](CODE_REVIEW.md) and follow it. It is the source of truth for both what to review and how to execute the review. Two scripts do the parts a model must not be trusted with: `scripts/prepare.mjs` resolves the pull request once, downloads the repository at the head commit, computes the change set and the lines under review, reads the changed files once and hands each as fragments, and writes one instructions file per probe; `scripts/review.mjs` refuses any probe's ledger that does not answer its instructions row for row, then builds and posts the review from the ledgers alone.

The rules it serves are the entries of [`rules/Rules.yaml`](rules/Rules.yaml); the `[[term]]`s they name are defined in [`rules/Definitions.yaml`](rules/Definitions.yaml), and their parents in [`rules/Principles.yaml`](rules/Principles.yaml). `prepare.mjs` reads them, once, from `${CLAUDE_SKILL_DIR}/rules/`: the rules this skill was installed with, linked into the skill from this repository's `rules/`. A violation is posted as breaking the principle its rule protects, linked to that principle's anchor on https://thruput.se/agents/.

It dispatches one subagent per instructions file, as [`CODE_REVIEW.md` step 2](CODE_REVIEW.md#2-probe) sets out. What a subagent does is fixed by constants in the schema of that file, `instructions` for every probe and `task` for each kind, which every file carries; `prepare.mjs` populates the rest, so there is no prompt to write and no schema to hand over. Every subagent is the plugin's `probe` agent, defined in [`agents/probe.md`](../../agents/probe.md): it loads no CLAUDE.md, so nothing but its file tells it what to do. It runs on the cheapest model available; the context subagent is dispatched on the most capable one. What crosses between the reviewing context, a probe, and the review is shaped by the schemas published under `https://thruput.se/agents/schemas/review/`: the change set, the fragments a changed file is handed as, the instructions a probe receives, the ledger its rows go into, and each violation in it. Validate against them rather than reading a shape off this prose.

The escalation index is bundled under `references/`; `prepare.mjs` downloads every ruleset it names, once, and hands them to the escalation probe.

The host is folded at the perimeter: one adapter per host beside the scripts, `scripts/github.mjs`, `scripts/azure-devops.mjs`, and `scripts/git.mjs`, each written against the host's published API description under [`references/hosts/`](references/hosts/). Nothing else in the skill names a host. The cheat sheets under `references/` describe the hosts for a reader; the scripts do not read them.

## Requirements

- `node` and `tar`; the scripts fetch their other tools with `npx`.
- For a GitHub pull request, `gh`; for an Azure DevOps pull request, `az` with the `azure-devops` extension and `git`; for a change in a plain repository, `git`. Each is used as it stands in the environment.
- The rules: `rules/` in the skill, links to this repository's rules and what they rest on, up to the axioms, which resolve on macOS and Linux.
- Network access to `raw.githubusercontent.com/ciembor/agent-rules-books`, from which `prepare.mjs` downloads the escalation rulesets.

## Files

- `CODE_REVIEW.md` — the review process.
- `scripts/prepare.mjs`, `scripts/review.mjs` — the two commands the process runs; `scripts/lib.mjs` holds their host-neutral logic and `scripts/github.mjs`, `scripts/azure-devops.mjs`, `scripts/git.mjs` the adapters, each tested beside it.
- `references/hosts/` — the hosts' published API descriptions the adapters are written against: GitHub's REST OpenAPI description and GraphQL schema, Azure DevOps' Git and Policy specifications. Refresh with:

      curl -sSL -o references/hosts/github.openapi.json https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json
      curl -sSL -o references/hosts/github.graphql https://docs.github.com/public/fpt/schema.docs.graphql
      curl -sSL -o references/hosts/azure-devops-git.json https://raw.githubusercontent.com/MicrosoftDocs/vsts-rest-api-specs/master/specification/git/7.1/git.json
      curl -sSL -o references/hosts/azure-devops-policy.json https://raw.githubusercontent.com/MicrosoftDocs/vsts-rest-api-specs/master/specification/policy/7.1/policy.json

- `rules/`, `schemas/` — this repository's rules and schemas, linked into the skill.
- `https://thruput.se/agents/schemas/review/` — the shapes the process passes around, from this repository's `schemas/review/`: the change set, the fragments, the review, the rulebook, the instructions for each kind of probe, the threads, the outcome, the ledger, and the violation.
- `references/agent-rules-books-INDEX.md`, `references/agent-rules-books-search-index.json` — escalation index, byte-for-byte mirrors of the handbook's `references/`. Refresh with:

      for f in agent-rules-books-INDEX.md agent-rules-books-search-index.json; do
        gh api "repos/thruput-io/handbook/contents/references/$f" --jq '.content' | base64 -d > "references/$f"
      done

- `references/gh-cheat-sheet.md`, `references/az-cheat-sheet.md` — host cheat sheets for filing review comments and interacting with GitHub and Azure DevOps PRs.
