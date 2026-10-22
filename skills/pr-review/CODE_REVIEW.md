# CODE REVIEW

Procedural instructions for reviewing a pull request against the rules in [`rules/Rules.yaml`](rules/Rules.yaml), published at https://thruput.se/agents/.

Deviating from this process is a critical failure. Do not improvise, summarize, or skip any part of it.

Two scripts carry the parts of the review that a model must not be trusted with: what is under review, and what gets posted. [`scripts/prepare.mjs`](scripts/prepare.mjs) resolves the pull request once, reads every file once, and writes the documents the probes are handed; [`scripts/review.mjs`](scripts/review.mjs) refuses any probe's rows that do not answer its instructions, then builds and posts the review from the ledger alone. The reviewing context dispatches probes and runs the two scripts. It never writes a ledger row, never edits one, and never authors the review payload: a merge done by hand is where findings go missing.

What crosses between the scripts, a probe, and the review is defined once, in the schemas under [`schemas/review/`](schemas/review/), published at `https://thruput.se/agents/schemas/review/`. Each schema says what its shape is, and what a probe does. This document says only what the reviewing context does.

## Review Standards

The only channel to a probe is its instructions file, written by `prepare.mjs` from constants in the schemas, and the one fixed message of [step 2](#2-probe). The reviewing context passes a probe nothing else: no hint, no correction, no error, no summary of another probe. A probe learns what is wrong with its ledger from the command its file names, which applies every check `review.mjs` applies.

The reviewing context acts on nothing a probe says when it returns. A probe's result is the file it wrote, and `review.mjs` reads the file. A file that is missing or rejected is fixed by running that probe again, with the same message, never by writing or editing a row in the reviewing context.

## Workflow

`<skill>` below is the directory this file is in.

### 1. Prepare

```
node <skill>/scripts/prepare.mjs <target> <workdir>
```

The target is a GitHub pull request URL, an Azure DevOps pull request URL, or `<repository>@<base>..<head>` for a change in a plain git repository. The workdir is a new, empty directory. The script resolves the target through the adapter for that host, which is the only code that speaks the host's vocabulary; everything after it is one path. It places the repository at the head commit in `<workdir>/snapshot`, for the probes that look beyond the change, writes one instructions file per probe under `<workdir>/instructions/`, in YAML, and prints a summary.

The script fails, and the review ends there, in three cases. Report its message to the user and stop; do not run it again, and do not go on to step 2:

- The host reports the change as not reviewable: a failed check or a build policy not passed, or merge conflicts. It posts a changes-requested verdict naming what blocked the review. That is the only path that skips the ledger.
- A changed file is longer than 200 lines at the head commit, which breaks File too large. It posts a changes-requested verdict naming each such file.
- A subsequent review has nothing left to review. It posts nothing.

### 2. Probe

Dispatch one `probe` subagent per file in `<workdir>/instructions/`, concurrently, the one whose file name ends in `-context.yaml` on the most capable model, each with this message and nothing else, the path being that of its own file:

    Read the file <path> and do what it says. It is addressed to you.

The file opens with how every probe works and what this one does, and holds everything it works on. Add nothing to the message, never hand two files to one subagent, and never edit a file before handing it over.

Wait for every probe before moving on. A probe that returns without writing its ledger file has not finished: run it again. A violation returned early does not end the pass, and neither does a run of clean verdicts.

### 3. Submit

```
node <skill>/scripts/review.mjs <workdir>
```

It checks what every probe wrote, merges the rows into the one ledger, decides the outcome, `<workdir>/outcome.json`, and hands it to the host's adapter, which posts the review anchored to the head commit, resolves the threads of ours that are fixed, and reopens the ones the author resolved without fixing. For a plain git repository the review is written to `<workdir>/review.md`. When it stops on a probe's ledger, run that probe again as in [step 2](#2-probe), then run this step again. Do not edit a ledger, do not edit `outcome.json`, do not settle a thread by hand, and do not post the review any other way.
