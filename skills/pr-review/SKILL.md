---
name: pr-review
description: Reviews a GitHub or Azure DevOps pull request, or a change in a plain git repository, against the thruput-io rules bundled with this skill (published at https://thruput.se/agents/), and posts one review with inline comments on the correct lines. Probes every rule in boxed subagents, so the reviewing agent never decides a verdict, cites each violation by rule and published URL, and groups comments into one review where the host allows. Use when the user gives a PR URL or asks for a rules-driven PR review.
compatibility: Requires node and tar. GitHub needs gh; Azure DevOps needs az with the azure-devops extension and git; a plain repository needs git. Network access to raw.githubusercontent.com/ciembor/agent-rules-books.
---

# PR Review

Procedural instructions for reviewing a pull request against the rules in [`rules/Rules.yaml`](rules/Rules.yaml), published at https://thruput.se/agents/. The `[[term]]`s the rules name are defined in [`rules/Definitions.yaml`](rules/Definitions.yaml), and their parents in [`rules/Principles.yaml`](rules/Principles.yaml).

Deviating from this process is a critical failure. Do not improvise, summarize, or skip any part of it.

## Who decides

The reviewing context decides nothing. Two scripts carry what a model must not be trusted with, and the subagents carry the verdicts:

- [`scripts/prepare.mjs`](scripts/prepare.mjs) resolves the pull request once, downloads the repository at the head commit, computes the change set and the lines under review, reads each changed file once and hands it over as fragments, and writes one instructions file per subagent.
- Each subagent writes one ledger file. [`scripts/check.mjs`](scripts/check.mjs) is the command it runs on that ledger, and applies every check the review will.
- [`scripts/review.mjs`](scripts/review.mjs) runs the same checks on every ledger, refuses any that does not answer its instructions row for row, then builds and posts the review from the ledgers alone.

The reviewing context dispatches subagents and runs the two scripts. It never writes a ledger row, never edits one, and never authors the review payload: a merge done by hand is where findings go missing.

## Boxing the subagents

- The only channel to a subagent is its instructions file and the one fixed message of [step 2](#2-dispatch). Nothing else: no hint, no correction, no error, no summary of another subagent, no word on what the review has found so far.
- A subagent learns what is wrong with its ledger from the command its file names.
- The reviewing context acts on nothing a subagent says when it returns. Its result is the file it wrote, and `review.mjs` reads the file. A missing or rejected file is fixed by dispatching that subagent again with the same message, never by writing or editing a row in the reviewing context.
- Subagents are plain subagents of whatever host runs this skill. No named agent definition is shipped, so the skill works on Claude, Gemini and Copilot alike. Run them on the cheapest model the host offers; run the one for `*-context.yaml` on the most capable.

What crosses between the scripts, a subagent, and the review is defined once, in the schemas under [`schemas/review/`](schemas/review/), published at `https://thruput.se/agents/schemas/review/`: the change set, the fragments, the review, the rulebook, the instructions for each kind of subagent, the threads, the outcome, the ledger, and the violation. Each schema says what its shape is and what a subagent does. Validate against them rather than reading a shape off prose.

## Workflow

Paths below are relative to this skill's directory.

### 1. Prepare

```
node scripts/prepare.mjs <target> <workdir>
```

The target is a GitHub pull request URL, an Azure DevOps pull request URL, or `<repository>@<base>..<head>` for a change in a plain git repository. The workdir is a new, empty directory. The script resolves the target through the adapter for that host, the only code that speaks the host's vocabulary. It places the repository at the head commit in `<workdir>/snapshot`, writes one instructions file per subagent under `<workdir>/instructions/`, in YAML, and prints a summary.

If the script fails, the review ends there. Report its message to the user and stop; do not run it again, and do not go on to step 2. It fails in three cases:

- The host reports the change as not reviewable: a failed check or a build policy not passed, or merge conflicts. It posts a changes-requested verdict naming what blocked the review. That is the only path that skips the ledger.
- A changed file is longer than 200 lines at the head commit, which breaks File too large. It posts a changes-requested verdict naming each such file.
- A subsequent review has nothing left to review. It posts nothing.

### 2. Dispatch

Dispatch one subagent per file in `<workdir>/instructions/`, concurrently, each with this message and nothing else, the path being that of its own file:

    Read the file <path> and do what it says. It is addressed to you.

The file opens with how every subagent works and what this one does, and holds everything it works on. Add nothing to the message, never hand two files to one subagent, and never edit a file before handing it over.

Wait for every subagent before moving on. One that returns without writing its ledger file has not finished: dispatch it again. A violation returned early does not end the pass, and neither does a run of clean verdicts.

### 3. Submit

```
node scripts/review.mjs <workdir>
```

It checks what every subagent wrote, merges the rows into the one ledger, decides the outcome, `<workdir>/outcome.json`, and hands it to the host's adapter, which posts the review anchored to the head commit, resolves the threads of ours that are fixed, and reopens the ones the author resolved without fixing. For a plain git repository the review is written to `<workdir>/review.md`. When it stops on a ledger, dispatch that subagent again as in [step 2](#2-dispatch), then run this step again. Do not edit a ledger, do not edit `outcome.json`, do not settle a thread by hand, and do not post the review any other way.

## Files

- `scripts/prepare.mjs`, `scripts/check.mjs`, `scripts/review.mjs` — the three commands above. `scripts/lib.mjs` holds their host-neutral logic; `scripts/github.mjs`, `scripts/azure-devops.mjs` and `scripts/git.mjs` are the host adapters, each tested beside it. Nothing else names a host.
- `rules/`, `schemas/` — this repository's rules and schemas, linked into the skill.
- `references/hosts/` — the hosts' published API descriptions the adapters are written against: GitHub's REST OpenAPI description and GraphQL schema, Azure DevOps' Git and Policy specifications. Refresh with:

      curl -sSL -o references/hosts/github.openapi.json https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json
      curl -sSL -o references/hosts/github.graphql https://docs.github.com/public/fpt/schema.docs.graphql
      curl -sSL -o references/hosts/azure-devops-git.json https://raw.githubusercontent.com/MicrosoftDocs/vsts-rest-api-specs/master/specification/git/7.1/git.json
      curl -sSL -o references/hosts/azure-devops-policy.json https://raw.githubusercontent.com/MicrosoftDocs/vsts-rest-api-specs/master/specification/policy/7.1/policy.json

- `references/agent-rules-books-INDEX.md`, `references/agent-rules-books-search-index.json` — escalation index, byte-for-byte mirrors of the handbook's `references/`; `prepare.mjs` downloads every ruleset it names, once, for the escalation subagent. Refresh with:

      for f in agent-rules-books-INDEX.md agent-rules-books-search-index.json; do
        gh api "repos/thruput-io/handbook/contents/references/$f" --jq '.content' | base64 -d > "references/$f"
      done

- `references/gh-cheat-sheet.md`, `references/az-cheat-sheet.md` — host cheat sheets for a reader; the scripts do not read them.
