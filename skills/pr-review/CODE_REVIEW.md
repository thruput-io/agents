# CODE REVIEW

Procedural instructions for reviewing a pull request against the rules in [`rules/Rules.yaml`](rules/Rules.yaml), published at https://thruput.se/agents/.

Deviating from this process is a critical failure. Do not improvise, summarize, or skip any part of it.

The shapes this process passes between the reviewing context, the probes, and the review are defined once, in the schemas published under `https://thruput.se/agents/schemas/`, and this document derives from them: what a term below *is* lives in its schema's `description`; this document says only what is done with it.

## Definitions

- **Rule** — one entry in `rules/Rules.yaml`, shaped by [`rules.schema.json`](https://thruput.se/agents/schemas/rules.schema.json): an `id`, a `marker` (`MUST` or `MUST NOT`), a `group`, a `parent` principle, and a `body`. A `[[term]]` in a body is defined in `rules/Definitions.yaml`, and the rule is applied as the glossary defines the term. When a rule's application is in doubt, its `parent` in `rules/Principles.yaml` answers, one level up at a time.
- **Group** — the `group` field of a rule. Rules sharing a group are probed by one subagent. Groups partition the work; they are not the unit of coverage.
- **Rule source** — where rule text is read: `${CLAUDE_SKILL_DIR}/rules/`, the rules this skill was installed with: `Rules.yaml`, `Definitions.yaml`, and `Principles.yaml`.
- **Rule URL** — the rule's anchor on the published site: `https://thruput.se/agents/#` followed by the id lowercased, with apostrophes removed and every run of other non-alphanumeric characters replaced by one hyphen. `Demonstrable, not recalled` becomes `https://thruput.se/agents/#demonstrable-not-recalled`. The same derivation gives the URL of a principle or a glossary term.
- **Review probe** — a focused attempt to find issues from exactly one rule. Its result is one ledger row.
- **git-tool** — the CLI for the host the PR lives on: `gh` for GitHub, or `az` with the `azure-devops` extension for Azure DevOps (`dev.azure.com`). Pick it from the PR URL. Every command and payload this workflow needs is in the matching [`references/gh-cheat-sheet.md`](references/gh-cheat-sheet.md) or [`references/az-cheat-sheet.md`](references/az-cheat-sheet.md), referred to below as `{git-tool}-cheat-sheet.md`.
- **head commit** — the commit the review is anchored to: `headRefOid` on GitHub, `lastMergeSourceCommit.commitId` on Azure DevOps. Every file read and every inline comment resolves against it.
- **change set** — [`change-set.schema.json`](https://thruput.se/agents/schemas/change-set.schema.json): the lines this PR adds or removes at the head commit.
- **checkout** — the head commit checked out with a clean working tree: in the working directory if it is the repository under review and already at the head commit, otherwise a fresh worktree or clone at the head commit. A checkout at any other commit is not a checkout of this PR.
- **surface** — [`surface.schema.json`](https://thruput.se/agents/schemas/surface.schema.json): the lines a violation may be reported against. On a first-time review it is the change set. On a subsequent review it is narrowed as [Subsequent Reviews](#subsequent-reviews) sets out.
- **full context** — the surface plus the reading in [step 1](#1-setup): every changed file in full, the call sites of changed public symbols, and the covering test files. Context is what a verdict is *reached from*, never what a verdict is reported *against*.
- **violation** — [`violation.schema.json`](https://thruput.se/agents/schemas/violation.schema.json): one finding of one rule, with its anchor inside the surface or at the pull request as a whole.
- **ledger** — [`ledger.schema.json`](https://thruput.se/agents/schemas/ledger.schema.json): one row per probe, carrying the verdict and, for a violation row, its violations. The completeness record of the review.
- **instructions** — [`agent-instructions.schema.json`](https://thruput.se/agents/schemas/agent-instructions.schema.json): everything one probe subagent is handed, resolved once by the reviewing context.

## Review Standards

### Probes

A probe is complete only when it has produced one ledger row that validates against [`ledger.schema.json`](https://thruput.se/agents/schemas/ledger.schema.json): the rule by id, what was examined, the verdict, the evidence, and for a `violation` row every violation it carries. The schema says what each field holds.

A statement that a rule was considered is not a probe. A row the schema rejects is not a row.

The minimum bar is **one probe per rule** in `rules/Rules.yaml`.

`not-applicable` requires a reason tied to full context. "No findings" is not a reason.

Do not fabricate findings to satisfy a count. A review with zero violations is acceptable; a review with an incomplete ledger is not.

### First-Time Reviews

Do not approve after a shallow pass. A first-time review is complete only when all the following hold:

- The ledger has a row for every rule.
- Every row's `evidence` field is filled and refers to something in this full context.
- Every `violation` row has a corresponding review comment.
- Any shortage of findings is explained by completed rows, not by absent ones.

If a previous review was rejected solely by the [Pre-Review Content Checks](#2-pre-review-content-checks), treat the next review as a first-time review.

### Subsequent Reviews

Apply the same standards and the same minimum bar. Do not reduce the number of probes and do not narrow scrutiny to topics already commented on. Limit only the **surface** under review to:

- Changes carrying an unresolved comment.
- Changes carrying a comment the **author** has resolved since the prior review.
- Changes new since the prior review.

Rebuild the ledger against that surface. A rule that was `clean` last time is probed again if the surface touches it.

As commented changes are reviewed, resolve or unresolve the threads directly in the PR — see [step 6](#6-settle-existing-threads).

## Workflow

### 1. Setup

The git-tool must be available.

Fetch the PR overview, the changed files, and the existing review comments — the last so this review does not duplicate a comment already on the PR. On Azure DevOps, filter the system-generated threads out of that comparison; counting them as review comments corrupts the check.

Extract the head commit and the PR description from the overview response — inline comments are posted against the head commit, and the description is handed to every probe in [step 3](#3-rule-evaluation), so it is fetched once here rather than once per subagent. Do **not** guess the head commit; do **not** use `HEAD` of the local checkout.

**Verify the checkout before anything reads from it.** Fetching the head commit and reading the working directory are two different things, and only the first has happened so far. Before step 3, compare the local checkout's `HEAD` with the head commit extracted above and confirm the tree is clean. If either check fails, do not read from that directory: check the head commit out into a fresh worktree — see `{git-tool}-cheat-sheet.md § Read files at the head commit` — or fall back to fetching per file at the head commit and pass no checkout to the probes. Record the verified commit in the ledger. This verification is done once, here; probes receive the checkout path and the head commit and trust them — they do not re-verify.

**Read the rules once.** Fetch `rules/Rules.yaml` from the rule source and enumerate every rule. That enumeration is the probe list, and its length is the expected ledger row count. The rules travel to the probes in [step 3](#3-rule-evaluation) as the `rules` of their instructions; the probes read the glossary and the principles themselves.

**Resolve the change set and the surface once.** Write the change set as [`change-set.schema.json`](https://thruput.se/agents/schemas/change-set.schema.json) shapes it, and the surface as [`surface.schema.json`](https://thruput.se/agents/schemas/surface.schema.json) shapes it. Both are handed to every probe in its instructions.

**Read beyond the change set.** Hunks are not enough to evaluate most rules — dead code, layering, primitive leakage, missing tests, and unrepresentable illegal states are all invisible in isolated hunks. Before probing, obtain at the head commit:

- Every changed file, in full.
- The call sites of every changed public symbol, limited to the repository holding the PR.
- The test files covering the change set, including the case where none exist.

The full context widens what is read; it does not widen what is reported. A `violation` MUST anchor inside the surface. A problem that already existed in the full context, on a line the surface does not touch, is not a finding of this review.

One thing outside the surface is reportable: code the surface makes dead — a symbol whose last caller this PR removes, a branch this PR makes unreachable. Anchor it at the dead code, and name in `evidence` the surface line that killed it. Dead code the surface merely failed to clean up is not this.

Either check the PR out and read locally, or fetch per file — see `{git-tool}-cheat-sheet.md § Read files at the head commit`. Azure DevOps returns no textual diff at all, so there the full-file read is the only option.

A probe that could not obtain the context it needed is recorded with that fact in `examined` — never silently downgraded to `clean`.

### 2. Pre-Review Content Checks

If any of the following is true, stop probing and submit a changes-requested verdict whose body names the failing check, with no inline comments — `REQUEST_CHANGES` on GitHub, a `wait-for-author` or `reject` vote on Azure DevOps:

- Tests are failing.
- The PR has merge conflicts.
- The PR description restates the change set without stating its [[Purpose]]: the benefit the change delivers to its users.
- The PR description does not match what the change set actually does.

This is the only path that skips the ledger.

### 3. Rule Evaluation

Probe every rule in `rules/Rules.yaml`, partitioned by group. The pass runs to completion whatever it finds: a violation early does not end it, and neither does a run of `clean` verdicts.

**Fan out one subagent per group.** Each group MUST run in its own subagent, dispatched with [`PROBE_SUBAGENT_TEMPLATE.md`](PROBE_SUBAGENT_TEMPLATE.md) and one instructions document that validates against [`agent-instructions.schema.json`](https://thruput.se/agents/schemas/agent-instructions.schema.json): the group, its rules, the rule source, the published site, the pull request with its description, the change set, the surface, and how files are read. The subagent runs one probe per rule in its instructions and returns one ledger row per probe — batching the dispatch does not merge the rows. Do not merge groups into one subagent, do not drop a rule from a group's list, and do not probe rules in the reviewing context itself.

**Some rules cannot be probed by reading the full context.** The `Development Stack` group asks whether the code needed to be written at all, and answering that takes a search rather than an inspection — a different search per rule. Each rule applies only where the change meets a need on the level the rule forbids; where it does, the search is the probe:

| rule                                                                                                      | applies where the change meets a need by | what the probe searches                                                                                                               |
|-----------------------------------------------------------------------------------------------------------|------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| [No platform feature where reuse serves](https://thruput.se/agents/#no-platform-feature-where-reuse-serves) | the platform or framework                | this repository, for an existing component or for code that should be refactored into one                                             |
| [No dependency where the platform serves](https://thruput.se/agents/#no-dependency-where-the-platform-serves) | adding an external dependency            | the published documentation for the language, runtime, and framework already in use, on the web, **at the version this project pins** |
| [No external service where a dependency serves](https://thruput.se/agents/#no-external-service-where-a-dependency-serves) | integrating an external tool or service  | the package registry for this ecosystem                                                                                               |
| [No new code where an external tool serves](https://thruput.se/agents/#no-new-code-where-an-external-tool-serves) | writing new code                         | existing tools, and services callable over an API                                                                                     |

A probe on one of these that examined only the change set has not run. Its `examined` field MUST name the searches performed and the queries used, and a `clean` verdict MUST say what was searched for and not found. These are the probes most often skipped, because a negative result feels like no result — but an unsearched level and an empty level are different findings, and the `examined` field is the only thing that distinguishes them.

Every candidate the searches turn up is gated by [Available](https://thruput.se/agents/#available) and [Maintained](https://thruput.se/agents/#maintained), which the `Simplicity & Code Reuse` group probes against the dependencies the change itself adopts — the gating protocol is in [`PROBE_SUBAGENT_TEMPLATE.md` § Method](PROBE_SUBAGENT_TEMPLATE.md#method).

Group the probe list by group — the number of distinct group values is the number of subagents to dispatch. Launch them concurrently.

Only the reviewing context talks to the PR host. Subagents read; they never post, resolve threads, or submit — and they never fetch PR metadata: the description, the changed-file list, the head commit, and the surface are resolved here and handed to them.

**A probe reads the repository under review and its own instructions — nothing else on the host filesystem.** On disk that is the local checkout of this PR, or the files fetched at the head commit where there is none. The instructions are a closed set: its instructions document, the glossary and the principles at the rule source it names, and `{git-tool}-cheat-sheet.md`. Other checkouts, agent configuration, and the rest of the reviewer's home directory are out of scope; a probe that needed something there records that in `examined` rather than reading it. The Development Stack searches in the table above are unaffected, because none of them is a read of the host filesystem: they query the package registry, callable services, and the published documentation for the platform and framework on the web. Platform and framework capability is established from those published docs at the version this project pins — never from a local install tree, and never from memory of the framework.

Merge the returned rows into a single ledger, validating against [`ledger.schema.json`](https://thruput.se/agents/schemas/ledger.schema.json). The violations its rows carry become the comments drafted in [step 5](#5-draft-comments-locally). Fanned-out work that returns without ledger rows, or rows the schema rejects, is not a result — re-run it.

**Wait for every probe before moving on.** The probe list from the enumeration in [step 1](#1-setup) is the expected row count: the ledger is complete only when it holds one row per rule on that list. A subagent that returns fewer rows than its group has rules has not finished — re-run it for the missing rows. Waiting is a hard barrier — do not draft comments and do not submit while any probe is still outstanding. A `violation` returned early does not end the pass and does not license an early submission; neither does a run of `clean` verdicts. The only path that submits without a complete ledger is [step 2](#2-pre-review-content-checks).

Submitting while probes are still running does not produce a partial review; it produces a wrong one. It reports a violation count the surface does not have, and it makes the rules whose subagents had not yet returned indistinguishable from rules that came back `clean`.

### 4. Context Probing

If the ledger is complete and holds no `violation` rows, the review is not finished — probe further before approving:

1. Consult [`references/agent-rules-books-INDEX.md`](references/agent-rules-books-INDEX.md) and select the ruleset whose focus matches what this PR changes.
2. The index is a pointer, not a ruleset. Fetch the selected ruleset at its `canonical_url` in [`ciembor/agent-rules-books`](https://github.com/ciembor/agent-rules-books) and read the actual rules. Do not probe from the index's one-line summary, or from memory of the book.
3. Pick 3 rules that are relevant to the PR's changes.
4. Probe that ruleset the same way: one subagent, dispatched with [`PROBE_SUBAGENT_TEMPLATE.md`](PROBE_SUBAGENT_TEMPLATE.md) and instructions carrying the three picked rules, each written as a rule with the ruleset's name as its `group` and its `canonical_url` as the rule source. Add the returned rows to the same ledger.

Approve only after this pass also comes back clean.

### 5. Draft Comments Locally

Build the comments in memory (do not post yet), one per violation in the ledger. A violation is already shaped by [`violation.schema.json`](https://thruput.se/agents/schemas/violation.schema.json); here it is translated into the host's payload — a comment object on GitHub, a thread with a `threadContext` on Azure DevOps; both are in `{git-tool}-cheat-sheet.md`.

A violation anchored at the pull request becomes a **PR-level comment**: it carries no `path` or `line` — on GitHub it goes in the review body, on Azure DevOps it is a thread without a `threadContext`. It is drafted here and submitted with everything else in step 7, never posted on its own.

The anchor keeps the meaning the schema gives it whatever the host: the line is the line **as of the head commit** on the side named, never a diff hunk offset, and it is a line in the surface rather than merely a line in a file the surface touches.

Each comment body is the violation's body:

- Explains the violation. Keep it short.
- MUST cite the violated rule by its id, exactly as written in `rules/Rules.yaml`, linked to its rule URL.
- States what is wrong, not how to fix it.
- Does not hand the author a patch.

Write the completed ledger to a local file, `ledger.json`, validating against [`ledger.schema.json`](https://thruput.se/agents/schemas/ledger.schema.json), and render it as the Markdown table `ledger.md` — one row per probe with the columns rule, examined, verdict, evidence — for the host. It is the completeness record of the review, not review content: no ledger rows in comment bodies. It is submitted with the review in [step 7](#7-submit) as an attachment — mechanism per host in `{git-tool}-cheat-sheet.md § Attach the ledger`.

### 6. Settle Existing Threads

Subsequent reviews only. List the threads and their state, then act per thread — commands in `{git-tool}-cheat-sheet.md`:

- Fixed: resolve the thread.
- Resolved by the author but not actually fixed: unresolve it, and add a new comment in step 5.

### 7. Submit

Two gates, both checked before anything is posted:

- **The ledger is whole.** It validates against [`ledger.schema.json`](https://thruput.se/agents/schemas/ledger.schema.json) and holds one row per probe on the list. A missing row means a probe never returned, and the review is unfinished, whatever the findings count.
- **Every violation is in the payload.** Each violation a row carries gets its inline comment — or its PR-level comment, where it is anchored at the pull request — and the review body accounts for all of them. A violation that appears in the ledger but not in what is submitted has been found and then dropped, which is worse than not having probed for it — the author is told the surface is cleaner than the review actually established.

Submit every comment from step 5 together with the verdict, anchored to the head commit. The ledger file from step 5 is part of the same submission — see `{git-tool}-cheat-sheet.md § Attach the ledger`: on Azure DevOps it is uploaded as a PR attachment and linked from the PR-level summary thread; GitHub has no attachment API, so there it travels in the review body as a collapsed `<details>` block. How atomic that can be depends on the host:

- **GitHub** — one payload carries every inline comment plus the verdict, so submit exactly **one** review: one review, one notification, comments grouped. Do **not** post comments one at a time in a loop — that is N standalone comments, N notifications, and not atomic. See [`references/gh-cheat-sheet.md § Submit one atomic review`](references/gh-cheat-sheet.md#submit-one-atomic-review).
- **Azure DevOps** — no atomic endpoint exists. Each thread is its own request, and the vote is a separate call, so N comments unavoidably mean N requests. Drafting locally in step 5 is what replaces atomicity: post every thread **before** casting the vote, so the verdict never lands ahead of its evidence, and on a retry reconcile against the existing threads rather than duplicating them. See [`references/az-cheat-sheet.md § No atomic review`](references/az-cheat-sheet.md#no-atomic-review).
