---
name: pr-review
description: Reviews a GitHub or Azure DevOps Pull Request against the thruput-io rules in this repository's `rules/Rules.yaml`, published at https://thruput.se/agents/, and posts the review as inline comments on the correct lines. Distinct from the built-in `/review` skill in that it (a) probes the rules in subagents, one per rule group, (b) cites each violation by the rule's id and published URL, and (c) groups all inline comments into one review where the host allows it, rather than posting N individual comments. Trigger when the user provides a PR URL or asks for a rules-driven PR review.
---

# PR Review

You review a [`Pull request`](schemas/review/pull-request.schema.json) against [`rules/Rules.yaml`](rules/Rules.yaml) ([schema](schemas/governance/rules.schema.json)), with every `[[term]]` defined in [`rules/Definitions.yaml`](rules/Definitions.yaml) ([schema](schemas/governance/definitions.schema.json)) and every rule's parent in [`rules/Principles.yaml`](rules/Principles.yaml) ([schema](schemas/governance/principles.schema.json)), published at `https://thruput.se/agents/`, and post the resulting [`Outcome`](schemas/review/outcome.schema.json).

Deviating from this process is a critical failure. Do not improvise, summarize, or skip any part of it.

## Domain Contracts

Every shape that crosses between you, the scripts, and a probe subagent is defined by its schema under [`schemas/review/`](schemas/review/), published at `https://thruput.se/agents/schemas/review/`:

- [`Pull request`](schemas/review/pull-request.schema.json) — the pull request under review.
- [`Change set`](schemas/review/change-set.schema.json) — the added and removed [`Lines`](schemas/review/lines.schema.json) of the change at its head commit.
- [`Threads`](schemas/review/threads.schema.json) — the threads prior reviews of ours left on the pull request.
- [`Surface`](schemas/review/surface.schema.json) — one changed file that has lines under review, as ordered [`Fragment`](schemas/review/fragment.schema.json)s (`surface` and `context`).
- [`Checkout`](schemas/review/checkout.schema.json) — the repository at the head commit (`<workdir>/snapshot`).
- [`Review`](schemas/review/review.schema.json) — the [`Pull request`](schemas/review/pull-request.schema.json), `headCommit`, [`Surface`](schemas/review/surface.schema.json) files, [`Ledger`](schemas/review/ledger.schema.json) path, and check command handed to every probe.
- [`Rulebook`](schemas/review/rulebook.schema.json) — one rule group's rules, principles, and definitions.
- [`Agent instructions`](schemas/review/agent-instructions.schema.json) — the instructions file handed to a probe subagent, of one of four kinds: [`Rules instructions`](schemas/review/instructions/rules.schema.json), [`Reuse instructions`](schemas/review/instructions/reuse.schema.json), [`Dead-code instructions`](schemas/review/instructions/dead-code.schema.json), or [`Context instructions`](schemas/review/instructions/context.schema.json).
- [`Ledger`](schemas/review/ledger.schema.json) — the completeness record of the review: one row per rule probed, with what was examined, the verdict, [`Evidence`](rules/Definitions.yaml), and any [`Violation`](schemas/review/violation.schema.json)s.
- [`Outcome`](schemas/review/outcome.schema.json) — the verdict, summary, inline findings, threads to settle, and threads to reopen.

## Review Standards

- Your only channel to a probe is its [`Agent instructions`](schemas/review/agent-instructions.schema.json) file in `<workdir>/instructions/` and the one fixed message in [Step 2](#2-probe). Pass a probe nothing else: no hint, no correction, no error, no summary of another probe.
- Act on nothing a probe says when it returns. A probe's result is the [`Ledger`](schemas/review/ledger.schema.json) file it wrote and checked with `scripts/check.mjs`.
- Never write or edit a [`Ledger`](schemas/review/ledger.schema.json) row, never edit `<workdir>/outcome.json`, never settle a thread by hand, and never author or post the review payload outside the scripts.

## Workflow

`<skill>` below is the directory this file is in.

### 1. Prepare

```bash
npm --prefix <skill> ci
node <skill>/scripts/prepare.mjs <target> <workdir>
```

`<target>` is a GitHub pull request URL, an Azure DevOps pull request URL, or `<repository>@<base>..<head>` for a change in a plain git repository. `<workdir>` is a new, empty directory.

`prepare.mjs` places the [`Checkout`](schemas/review/checkout.schema.json) at `<workdir>/snapshot` and writes one [`Agent instructions`](schemas/review/agent-instructions.schema.json) YAML file per probe under `<workdir>/instructions/`: [`Rules instructions`](schemas/review/instructions/rules.schema.json), [`Reuse instructions`](schemas/review/instructions/reuse.schema.json), [`Dead-code instructions`](schemas/review/instructions/dead-code.schema.json), and [`Context instructions`](schemas/review/instructions/context.schema.json).

If `prepare.mjs` exits non-zero, the review ends there—report its message to the user and stop; do not run it again and do not proceed to Step 2:

- The host reports the [`Pull request`](schemas/review/pull-request.schema.json) as not reviewable (a failed check, a blocking build policy not passed, or merge conflicts). `prepare.mjs` posts a changes-requested verdict naming what blocked the review.
- Narrowing the [`Change set`](schemas/review/change-set.schema.json) against [`Threads`](schemas/review/threads.schema.json) leaves no [`Surface`](schemas/review/surface.schema.json) to review. `prepare.mjs` posts nothing.

### 2. Probe

Dispatch one [`probe`](../../agents/probe.md) subagent per [`Agent instructions`](schemas/review/agent-instructions.schema.json) file in `<workdir>/instructions/`, concurrently—the [`Context instructions`](schemas/review/instructions/context.schema.json) file (`*-context.yaml`) on the most capable model, and every other file on the cheapest model—each with this exact message and nothing else (`<path>` is the path of its file):

```
Read the file <path> and do what it says. It is addressed to you.
```

Never hand two files to one subagent, and never edit a file before handing it over.

Wait for every probe before moving on. A probe that returns without writing its [`Ledger`](schemas/review/ledger.schema.json) file has not finished: dispatch it again with the same message. A [`Violation`](schemas/review/violation.schema.json) returned early does not end the pass, and neither does a run of clean verdicts.

### 3. Submit

```bash
node <skill>/scripts/review.mjs <workdir>
```

`review.mjs` checks every probe's [`Ledger`](schemas/review/ledger.schema.json) against its [`Agent instructions`](schemas/review/agent-instructions.schema.json), merges the rows into the one [`Ledger`](schemas/review/ledger.schema.json), writes `<workdir>/outcome.json` ([`Outcome`](schemas/review/outcome.schema.json)), and posts the review (or writes `<workdir>/review.md` for a plain git repository).

When `review.mjs` stops on a probe's [`Ledger`](schemas/review/ledger.schema.json), dispatch that probe again as in [Step 2](#2-probe), then run Step 3 again.
