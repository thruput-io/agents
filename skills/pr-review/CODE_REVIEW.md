# CODE REVIEW

Procedural instructions for reviewing a pull request against the rules in [`rules/Rules.yaml`](rules/Rules.yaml), published at https://thruput.se/agents/.

Deviating from this process is a critical failure. Do not improvise, summarize, or skip any part of it.

Two scripts carry the parts of the review that a model must not be trusted with: what is under review, and what gets posted. [`scripts/prepare.mjs`](scripts/prepare.mjs) resolves the pull request once, gathers everything under review as data, and writes the instructions every probe receives; [`scripts/review.mjs`](scripts/review.mjs) refuses any ledger that does not answer its instructions row for row, then builds and posts the review from the ledgers alone. The reviewing context dispatches probes and runs the two scripts. It never writes a ledger row, never edits one, and never authors the review payload: a merge done by hand is where findings go missing.

The shapes the scripts pass around are defined once, in the schemas under [`schemas/`](schemas/), published at `https://thruput.se/agents/schemas/`, and this document derives from them: what a term below *is* lives in its schema's `description`; this document says only what is done with it.

## Definitions

- **Rule** — one entry in `rules/Rules.yaml`, shaped by [`rules.schema.json`](schemas/governance/rules.schema.json): an `id`, a `marker` (`MUST` or `MUST NOT`), a `group`, a `parent` principle, and a `body`. A `[[term]]` in a body is defined in `rules/Definitions.yaml`, and the rule is applied as the glossary defines the term. When a rule's application is in doubt, its `parent` in `rules/Principles.yaml` answers, one level up at a time.
- **Group** — the `group` field of a rule. Rules sharing a group are probed by one subagent. Groups partition the work; they are not the unit of coverage.
- **Rule URL** — the rule's anchor on the published site: `https://thruput.se/agents/#` followed by the id lowercased, with apostrophes removed and every run of other non-alphanumeric characters replaced by one hyphen. `Demonstrable, not recalled` becomes `https://thruput.se/agents/#demonstrable-not-recalled`. The same derivation gives the URL of a principle or a glossary term.
- **Review probe** — a focused attempt to find issues from exactly one rule. Its result is one ledger row.
- **Reuse ladder probe** — the probe of the `Development Stack` group. Its rules ask whether the code needed to be written at all, so its probes are searches, not inspections; see [step 3](#3-rule-evaluation).
- **Escalation probe** — the one probe that is not of our rules: from the rulesets it is handed, the entries of [`references/agent-rules-books-search-index.json`](references/agent-rules-books-search-index.json), each downloaded once by `prepare.mjs`, it selects the one whose focus matches the change, picks the three rules most relevant to the change, and probes those. It runs on every review, alongside the rule probes.
- **git-tool** — `gh` for a GitHub pull request. For Azure DevOps (`dev.azure.com`) the scripts do not apply; follow [`references/az-cheat-sheet.md`](references/az-cheat-sheet.md) by hand, keeping to every standard below.
- **head commit** — the commit the review is anchored to: the pull request's head SHA. Every file read and every inline comment resolves against it.
- **change set** — [`change-set.schema.json`](schemas/review/change-set.schema.json): the lines this PR adds or removes at the head commit.
- **read once** — `prepare.mjs` reads every file once, from a snapshot of the head commit it then discards, and hands the content over inside each probe's instructions: every changed file in full, the text of the removed lines, and for the probes that reach beyond the change the call sites and the files the dead-code facts name. A probe opens no file and fetches nothing of the repository or of our rules.
- **surface** — [`surface.schema.json`](schemas/review/surface.schema.json): the lines a violation may be reported against, which on a first-time review are the change set and on a subsequent review are narrowed as [Subsequent Reviews](#subsequent-reviews) sets out.
- **full context** — the surface plus the content behind it: every changed file in full, and for the reuse ladder probe and the dead-code probe the [surroundings](schemas/review/surroundings.schema.json), the call sites into and out of the change, each in full. Context is what a verdict is *reached from*, never what a verdict is reported *against*. The surroundings and the dead-code facts exist for the rules that ask what the changed lines cannot answer alone, whether the code needed to be written and what a change leaves behind; every other rule is answered on the changed files.
- **instructions** — [`agent-instructions.schema.json`](schemas/review/agent-instructions.schema.json): everything one probe is handed, as one file under `<workdir>/instructions/`. Its `kind` names its schema under [`schemas/review/instructions/`](schemas/review/instructions/). Every probe is handed the same [review](schemas/review/review.schema.json); a probe of our rules also its [rulebook](schemas/review/rulebook.schema.json), the rules with the principles, rationales, and glossary terms that explain them; the reuse ladder probe also the surroundings, the repository tree, and the rules its candidates are gated through; the dead-code probe also the surroundings and the dead-code facts; the escalation probe the rulesets from outside our rules, each in full.
- **ledger** — [`ledger.schema.json`](schemas/review/ledger.schema.json): the completeness record of the review, of which there is one. Each probe writes its rows to its own file, and `review.mjs` merges them. A row carries the verdict on a rule of ours or, from the escalation probe, on a rule of a ruleset from outside, and for a violation its violations.
- **violation** — [`violation.schema.json`](schemas/review/violation.schema.json): one finding of the rule in whose row it sits: an observation, and its anchor inside the surface or at the pull request as a whole.
- **workdir** — the directory where one review's files live: `change-set.json`, `surface.json`, `pull-request.json`, `threads.json`, `summary.json`, `instructions/`, `ledger/`, and after submission `ledger.json`, `ledger.md`, `review.json`, `response.json`.

## Review Standards

### Probes

A probe is complete only when it has written one ledger row that validates against [`ledger.schema.json`](schemas/review/ledger.schema.json): the rule by id, what was examined, the verdict, the evidence, and for a `violation` row every violation it carries. The schema says what each field holds.

A statement that a rule was considered is not a probe. A row the schema rejects is not a row. A probe whose ledger file does not exist has not run.

The minimum bar is **one probe per rule** in `rules/Rules.yaml`, plus the three rows of the escalation probe.

`not-applicable` requires a reason tied to full context. "No findings" is not a reason.

Do not fabricate findings to satisfy a count. A review with zero violations is acceptable; a review with an incomplete ledger is not.

### The ledger is read, not retold

The reviewing context reads nothing from a probe's hand-back text that it then acts on. The probe's ledger file is its result; `review.mjs` reads the file. A ledger that is missing, short, reordered, or rejected by the schema is fixed by re-running that probe, never by writing or editing a row in the reviewing context.

### First-Time Reviews

Do not approve after a shallow pass. A first-time review is complete only when all the following hold:

- Every probe's ledger file exists and `review.mjs` accepted it.
- Every row's `evidence` field refers to something in this full context.
- Every violation is in the posted review, which `review.mjs` guarantees by building the review from the ledgers; a violation an open thread of ours already carries, on the same line citing the same principle, is counted in the body rather than posted twice.
- Any shortage of findings is explained by completed rows, not by absent ones.

If a previous review was rejected solely by the [Pre-Review Content Checks](#2-pre-review-content-checks), treat the next review as a first-time review.

### Subsequent Reviews

Apply the same standards and the same minimum bar. Do not reduce the number of probes and do not narrow scrutiny to topics already commented on. `prepare.mjs` limits only the **surface** under review, to the change-set lines that:

- carry an unresolved thread;
- carry a thread the **author** has resolved since the prior review;
- changed since the commit the prior review was anchored to.

The prior review is the latest review on the pull request by the account running the scripts. When that leaves no line, `prepare.mjs` stops and says so: there is nothing to review until the pull request changes. Every probe is rebuilt against that surface. A rule that was `clean` last time is probed again if the surface touches it.

As commented changes are reviewed, resolve or unresolve the threads directly in the PR — see [step 4](#4-settle-existing-threads).

## Workflow

### 1. Setup

`gh`, `node`, and `tar` must be available. Nothing is checked out: `prepare.mjs` reads the pull request through the host and gathers everything the probes will read, so the review runs the same from any machine, inside the repository or not.

```
node <skill>/scripts/prepare.mjs <pull-request-url> <workdir>
```

It fetches the pull request once, computes the change set from the diff with the text of the removed lines, downloads a snapshot of the head commit, computes the surface, the call sites, and the dead-code facts, reads every file the probes are handed out of the snapshot, discards the snapshot, reads the rules with their principles, rationales, and glossary, downloads every ruleset the escalation index names, and writes one instructions file per probe under `<workdir>/instructions/`: one per rule group, in the order of `Rules.yaml`, and one escalation probe last. Every instructions file is validated against its schema before the script returns. It prints `summary.json`: the head commit, mergeable state, check-run count, description length, the size of the change set and of the surface, the call-site and dead-code counts, the repository's file count, and the probe names.

Do **not** guess the head commit; do **not** read the pull request's metadata again later. `prepare.mjs` resolved it once, and every probe reads it from its instructions.

### 2. Pre-Review Content Checks

`prepare.mjs` makes them, before anything else is read: when a check run on the head commit did not succeed, or the pull request has merge conflicts, it posts a changes-requested verdict naming what blocked the review, with no inline comments, and stops without writing instructions. Nothing is left to judge here. Whether the description states the change's [[Purpose]] is a rule, [Stated purpose](https://thruput.se/agents/#stated-purpose), and its probe answers it like any other.

This is the only path that skips the ledger.

### 3. Rule Evaluation

Dispatch one subagent per file in `<workdir>/instructions/`, each with [`PROBE_SUBAGENT_TEMPLATE.md`](PROBE_SUBAGENT_TEMPLATE.md) and the content of its instructions file. Launch them concurrently. The pass runs to completion whatever it finds: a violation early does not end it, and neither does a run of `clean` verdicts.

Each subagent probes every rule in its instructions and writes its rows to the file `review.ledger` names. The reuse ladder probe, the dead-code probe, and the escalation probe are three of these files; they need no separate dispatch, only the same template.

**The reuse ladder cannot be probed by reading the full context.** Each `Development Stack` rule applies only where the change meets a need on the level the rule forbids; where it does, a search is the probe:

| rule                                                                                                      | applies where the change meets a need by | what the probe searches                                                                                                               |
|-----------------------------------------------------------------------------------------------------------|------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| [No platform feature where reuse serves](https://thruput.se/agents/#no-platform-feature-where-reuse-serves) | the platform or framework                | this repository, for an existing component or for code that should be refactored into one                                             |
| [No dependency where the platform serves](https://thruput.se/agents/#no-dependency-where-the-platform-serves) | adding an external dependency            | the published documentation for the language, runtime, and framework already in use, on the web, **at the version this project pins** |
| [No external service where a dependency serves](https://thruput.se/agents/#no-external-service-where-a-dependency-serves) | integrating an external tool or service  | the package registry for this ecosystem                                                                                               |
| [No new code where an external tool serves](https://thruput.se/agents/#no-new-code-where-an-external-tool-serves) | writing new code                         | existing tools, and services callable over an API                                                                                     |

A probe on one of these that examined only the change set has not run. Its `examined` field MUST name the searches performed and the queries used, and a `clean` verdict MUST say what was searched for and not found. Every candidate is gated by [Available](https://thruput.se/agents/#available) and [Maintained](https://thruput.se/agents/#maintained); the gating protocol is in [`PROBE_SUBAGENT_TEMPLATE.md` § Method](PROBE_SUBAGENT_TEMPLATE.md#method).

Only the reviewing context talks to the PR host. Subagents read; they never post, resolve threads, or submit — and they never fetch PR metadata: everything about the pull request is in their instructions.

**A probe reads its instructions and nothing else.** Everything it needs was read once by `prepare.mjs` and is in its instructions file: it opens no file of the repository, of our rules, or of the reviewer's machine, and fetches nothing from the host API. A probe that needed something it was not handed records that in `examined` rather than reading it. The reuse ladder's searches are not reads of the repository: they query the package registry, callable services, and published documentation on the web. The reuse ladder's search of this repository is a search of the tree and the files it was handed.

**Wait for every probe before moving on.** `review.mjs` in [step 5](#5-submit) will refuse to run while a ledger file is missing, and a probe that returns without writing its file has not finished — re-run it. A `violation` returned early does not end the pass and does not license an early submission; neither does a run of `clean` verdicts. The only path that submits without a complete ledger is [step 2](#2-pre-review-content-checks).

### 4. Settle Existing Threads

Subsequent reviews only. List the threads and their state, then act per thread — commands in [`references/gh-cheat-sheet.md` § Review threads](references/gh-cheat-sheet.md#review-threads):

- Fixed: resolve the thread.
- Resolved by the author but not actually fixed: unresolve it. The surface already covers its lines, so the probes have re-examined them.

### 5. Submit

```
node <skill>/scripts/review.mjs <workdir>
```

It reads every instructions file and the ledger file its review names, and stops with the names of any probe whose file is missing. It validates every file against the ledger schema, and checks that each answers its instructions: the same head commit; for a probe of our rules the rows name the rulebook's rules, every one, in order, nothing else, and for the escalation probe three rows, each on a rule of its ruleset; and every lines anchor lies inside the surface. It merges the rows into the one ledger, `ledger.json`, validates it, renders `ledger.md`, and builds `review.json` from it — every violation is rendered as `{observation} breaks {principle name}`, the principle being the parent of the row's rule, linked to the published rules, and for a book rule its heading, linked to its ruleset; every violation anchored at lines becomes an inline comment, every violation anchored at the pull request goes in the body, one already carried by an open thread of ours is counted and not repeated, the verdict is `REQUEST_CHANGES` if any row is a violation and `APPROVE` otherwise, posted as a comment carrying the verdict when the reviewer is the author, and the ledger table travels in the body as a collapsed block — and posts it as one review, anchored to the head commit, in the same run. One review, one notification, comments grouped.

When it stops, read why, fix the cause by re-running the probe it names, and run it again. Do not edit a ledger, do not edit `review.json`, and do not post the review any other way.
