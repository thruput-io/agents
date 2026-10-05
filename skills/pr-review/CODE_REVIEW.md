# CODE REVIEW

Procedural instructions for reviewing a pull request against the rules in [`rules/Rules.yaml`](rules/Rules.yaml), published at https://thruput.se/agents/.

Deviating from this process is a critical failure. Do not improvise, summarize, or skip any part of it.

Two scripts carry the parts of the review that a model must not be trusted with: what is under review, and what gets posted. [`scripts/prepare.mjs`](scripts/prepare.mjs) resolves the pull request once, reads every file once, and writes the documents the probes are handed; [`scripts/review.mjs`](scripts/review.mjs) refuses any probe's rows that do not answer its instructions, then builds and posts the review from the ledger alone. The reviewing context dispatches probes and runs the two scripts. It never writes a ledger row, never edits one, and never authors the review payload: a merge done by hand is where findings go missing.

What crosses between the scripts, a probe, and the review is defined once, in the schemas under [`schemas/review/`](schemas/review/), published at `https://thruput.se/agents/schemas/review/`. Each schema says what its shape is, and what a probe does. This document says only what the reviewing context does.

For a pull request on Azure DevOps (`dev.azure.com`) the scripts do not apply; follow [`references/az-cheat-sheet.md`](references/az-cheat-sheet.md) by hand, keeping to every standard below.

## Review Standards

The reviewing context acts on nothing a probe says when it returns. A probe's result is the file it wrote, and `review.mjs` reads the file. A file that is missing, short, reordered, or rejected is fixed by running that probe again, never by writing or editing a row in the reviewing context.

Do not approve after a shallow pass, and do not fabricate findings to satisfy a count: a review with zero violations is acceptable; a review with an incomplete ledger is not.

A subsequent review applies the same standards and the same probes; only the surface is narrower. If a previous review was rejected solely by the checks of [step 1](#1-prepare), treat the next review as a first-time review.

## Workflow

### 1. Prepare

`gh`, `node`, and `tar` must be available. Nothing is checked out.

```
node <skill>/scripts/prepare.mjs <pull-request-url> <workdir>
```

It writes one file per probe under `<workdir>/instructions/` and prints a summary. When a check run on the head commit did not succeed, or the pull request has merge conflicts, it posts a changes-requested verdict naming what blocked the review and stops without writing instructions. That is the only path that skips the ledger. When a subsequent review has nothing left to review, it stops and says so.

### 2. Probe

Dispatch one subagent per file in `<workdir>/instructions/`, concurrently. Hand each subagent two paths and nothing else: its own file, and [`schemas/review/`](schemas/review/), where [`agent-instructions.schema.json`](schemas/review/agent-instructions.schema.json) says what every probe does and the schema named after the `kind` of its file says the rest. Write no prompt of your own around them, never hand two instructions files to one subagent, and never edit a file before handing it over.

Wait for every probe before moving on. A probe that returns without writing its file has not finished: run it again. A violation returned early does not end the pass, and neither does a run of clean verdicts.

### 3. Settle Existing Threads

Subsequent reviews only. List the threads and their state, then act per thread — commands in [`references/gh-cheat-sheet.md` § Review threads](references/gh-cheat-sheet.md#review-threads):

- Fixed: resolve the thread.
- Resolved by the author but not actually fixed: unresolve it.

### 4. Submit

```
node <skill>/scripts/review.mjs <workdir>
```

It validates what every probe wrote, merges the rows into the one ledger, and posts one review anchored to the head commit. When it stops, read why, fix the cause by running the probe it names again, and run it again. Do not edit a ledger, do not edit `review.json`, and do not post the review any other way.
