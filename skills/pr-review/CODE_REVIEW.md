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

```
node <skill>/scripts/prepare.mjs <target> <workdir>
```

The target is a GitHub pull request URL, an Azure DevOps pull request URL, or `<repository>@<base>..<head>` for a change in a plain git repository. The script resolves it through the adapter for that host, which is the only code that speaks the host's vocabulary; everything after it is one path. It places the repository at the head commit in `<workdir>/snapshot`, for the probes that look beyond the change, writes one instructions file per probe under `<workdir>/instructions/`, in YAML, and prints a summary. A changed file longer than 200 lines at the head commit breaks File too large and blocks the review the same way: the verdict names each such file, and nothing is prepared. When the host reports the change as not reviewable, a failed check or a build policy not passed, or merge conflicts, it posts a changes-requested verdict naming what blocked the review and stops without writing instructions. That is the only path that skips the ledger. When a subsequent review has nothing left to review, it stops and says so.

### 2. Probe

Dispatch one `probe` subagent per file in `<workdir>/instructions/`, concurrently, the context one on the most capable model, each with this message and nothing else, the path being that of its own file:

    Read the file <path> and do what it says. It is addressed to you.

The file opens with how every probe works and what this one does, and holds everything it works on. Add nothing to the message, never hand two files to one subagent, and never edit a file before handing it over. A probe needs no tool that writes to the host: where the dispatcher can withhold tools, withhold `gh` and `az`.

Wait for every probe before moving on. A probe that returns without writing its ledger file has not finished: run it again. A violation returned early does not end the pass, and neither does a run of clean verdicts.

### 3. Settle Existing Threads

Subsequent reviews only. List the threads and their state, then act per thread — commands in [`references/gh-cheat-sheet.md` § Review threads](references/gh-cheat-sheet.md#review-threads):

- Fixed: resolve the thread.
- Resolved by the author but not actually fixed: unresolve it.

### 4. Submit

```
node <skill>/scripts/review.mjs <workdir>
```

It validates what every probe wrote, merges the rows into the one ledger, decides the outcome, `<workdir>/outcome.json`, and hands it to the host's adapter, which posts the review anchored to the head commit, settles the threads that are fixed, and reopens the ones the author resolved without fixing. For a plain git repository the review is written to `<workdir>/review.md`. When it stops, read why, fix the cause by running the probe it names again, and run it again. Do not edit a ledger, do not edit `outcome.json`, and do not post the review any other way.
