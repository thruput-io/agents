# PR review: actors, entities and steps

## Actors

- **Reviewing context.** The agent running the skill. It runs the scripts and dispatches probes. It never writes ledger rows or the review itself.
- **Probes (subagents).** One per instructions file. Each is boxed: it sees only its own file. It checks a group of rules against the change and writes a ledger. The `context` probe also works from the rule-book index.
- **Scripts.** `prepare.mjs` prepares the workdir, `check.mjs` validates one ledger, `review.mjs` merges and posts.
- **Host adapters.** `github.mjs`, `azure-devops.mjs`, `git.mjs`. The only code that knows a host's API.
- **Host.** GitHub, Azure DevOps, or a plain git repository. It supplies the facts and receives the review.
- **Pull request author.** Their description is data for the probes, never instructions.

## Entities

- **Target.** A PR URL, or `repo@base..head` for plain git.
- **Workdir.** An empty directory holding everything from one review.
- **Pull request.** Host, author, description.
- **Snapshot.** The repository at the head commit.
- **Change set.** The changed files, with their added and removed line ranges.
- **Surface.** The lines this review covers. On a re-review, only what changed since the last review or sits under an open thread.
- **Fragments.** Each changed file as context and surface pieces, numbered, in order. Probes read these.
- **Rulebook.** Rules, their principles, and the full glossary.
- **Instructions file.** One per probe. Holds its rules or rulesets, the fragments, and its report command.
- **Ledger.** One row per rule, with a verdict: `violation`, `clean`, or `not-applicable`. Violations are anchored on surface lines.
- **Threads.** The host's review threads. "Ours" are threads this review opened. Each is open, resolved by the author, or resolved.
- **Outcome.** Verdict, summary, inline findings, threads to settle, threads to reopen.
- **Report.** What posting produced: the review, whether it was new, and the thread counts.

## Steps

1. **Prepare** (`prepare.mjs`).
   - Input: target and workdir.
   - Resolves the pull request through the host adapter, checks it is reviewable, fetches the snapshot, builds the change set and surface, and writes one instructions file per probe.
   - Stops if the host blocks the review.
2. **Dispatch.**
   - Input: the instructions files.
   - Each probe is started with the same fixed message and reads only its own file. It writes its ledger. A probe that writes nothing is dispatched again.
3. **Check** (`check.mjs`, once per probe).
   - Input: instructions file and ledger.
   - Output: the populated ledger, or an error naming what is wrong. The probe reruns this command until it passes.
4. **Submit** (`review.mjs`).
   - Input: all populated ledgers and the threads.
   - Merges the rows, computes the verdict and outcome, and checks the result.
5. **Post** (host adapter).
   - Input: the outcome.
   - Posts the review on the head commit, settles fixed threads, reopens threads the author resolved without fixing, and returns the report.
