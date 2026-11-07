# 002 — PR Review Lean: Tamper-Proof Controllers, Host Parity, and Black-Box Verification

|                |                                                                                         |
|----------------|-----------------------------------------------------------------------------------------|
| Plan           | `docs/plans/pr-review-lean/002-pr-review-lean.md`                                       |
| Branch         | `pr-review-lean`                                                                        |
| Started        | 2026-11-07                                                                              |
| Supersedes     | —                                                                                       |
| ADRs consulted | [0001](../../adrs/0001-separating-principles-rules-and-standards.md), [0002](../../adrs/0002-schema-validated-yaml-governance-documents.md), [0003](../../adrs/0003-axioms-above-principles.md), [0004](../../adrs/0004-schemas-and-taxonomy-published-to-the-web.md), [0005](../../adrs/0005-structure-is-described-in-json-schema.md), [0006](../../adrs/0006-diffs-are-described-in-a-schema-of-our-own.md) |
| ADRs added     | —                                                                                       |
| Status         | in-progress                                                                             |

## Implementing Agent Instructions

Read this section first, and in full, before touching any code.

**No authoring of this plan.**
This plan is committed and immutable during execution. Executing agents **MUST NOT** author, edit, rewrite, or amend this plan document (`docs/plans/pr-review-lean/002-pr-review-lean.md`) as part of immediate instructions or milestone execution. If any conflict, ambiguity, or unexpected error arises, stop immediately and return control to the human rather than modifying the plan.

**Read before starting.**
This repository's rules, [`rules/Rules.yaml`](../../../rules/Rules.yaml), with the principles ([`rules/Principles.yaml`](../../../rules/Principles.yaml)) and definitions ([`rules/Definitions.yaml`](../../../rules/Definitions.yaml)) they rest on, published at <https://thruput.se/agents/>, the skill contract in [`skills/pr-review/README.md`](../../../skills/pr-review/README.md) and [`skills/pr-review/SKILL.md`](../../../skills/pr-review/SKILL.md), and this plan end to end. The rules outrank this plan; raise any conflict with the human instead of resolving it yourself.

**Scope.**
Implement the milestones in [Execution Plan](#execution-plan), in order, with verification and git commit checkpoints at each milestone. Anything not in this plan is out of scope — stop and ask rather than extending it.

**Definition of done.**
Implementation is complete when every milestone's verification test passes, `./build.sh` at the repository root succeeds with zero warnings or errors, and every goal in [Goals](#goals) is delivered per the [Goal coverage](#goal-coverage) table.

**Verification.**
Run `./build.sh` at the repository root at each milestone checkpoint. Do not treat a milestone as done on inspection alone.

### Progress log

Keep an append-only progress log for this attempt:

- Open `docs/plans/pr-review-lean/progress/002-attempt-1-2026-11-07.md` before the first code change.
- Append at each milestone checkpoint: what was implemented, what verification showed, and the commit hash.
- **MUST NOT** rewrite, condense, or delete an existing entry. Corrections are new entries.
- **MUST NOT** amend or force-push a commit that contains progress-log entries.
- Commit the log alongside the milestone work it describes.

---

## Background

The shipped `pr-review` skill (`v0.3.15`) is widely used because it enforces a strict separation between deterministic code and boxed LLM judgment: code resolves the pull request, checks preconditions, computes the merge-base diff and narrowed re-review surface, boxes each probe, validates ledger rows against the probe's rules and surface, settles or reopens threads, and posts the review.

During the TypeScript and controller migration on `pr-review-lean`, an earlier pass replaced real persistence and host behavior with in-memory test fakes (`Map`s in `MainAgentController`, `dispatch(_workdir)` ignoring `workdir`), tampered with `knip.json` and `generate-contracts.ts` to hide unused exports, and dropped key host capabilities from `v0.3.15`.

### Goals

In priority order:

1. **Two tamper-proof actor controllers (`MainAgentController` and `SubAgentController`)**:
   - `MainAgentController` is the sole interface to the main agent (`prepare`, `prepareWithToken`, `dispatch`, and a read-only `MainAgentLedger` status view). The main agent cannot manipulate review outcomes, write ledger rows, or access `HostAdapter`.
   - `MainAgentController.prepare` / `prepareWithToken` returns a typed error (`invalid-target`, `refused`, `too-large`, `already-reviewed`) when review cannot proceed, and `{ success: true, data }` only when ready to dispatch.
   - `SubAgentController` is the sole interface to each boxed subagent (`workdir()`, `instructions()`, `change()`, `codeUnderReview()`, `rules()`, and one write method `report(rows)`).
   - When the last subagent calls `report(rows)` with valid rows, the ledger merges all slices, computes thread settlements and reopenings, and submits the review.
2. **Generic `HostAdapter` over generated client models with full `v0.3.15` parity**:
   - Eliminate all hand-written host response-parsing Zod schemas in `github.ts`, `github-review.ts`, `azure.ts`, and `azure-review.ts`; fold Orval-generated client response models directly into domain types.
   - Use Zod `.transform()` from domain schemas in `contracts.g.ts` (`InlineFindingSchema`, `OutcomeSchema`, `ThreadBodySchema`, `ReviewVerdictSchema`, `HeadCommitSchema`) into generated client request models.
   - Restore all host behaviors from `v0.3.15`: `merge-base` diffing, multi-commit git descriptions, preserving trailing blank lines in snapshots, filtering empty/0-hunk files, paginating GitHub GraphQL `reviewThreads`, filtering human and outdated (`line: null`) threads on GitHub and Azure DevOps, executing GraphQL `resolveReviewThread` / `unresolveReviewThread`, avoiding duplicate review posts at `headCommit`, re-flagging recurring violations on previously `"resolved"` threads, and closing stale Azure refusal threads.
3. **Untampered tooling and rulebook compliance**:
   - Restore honest `knip` configuration (`"knip": "knip"`, excluding only generated `!scripts/domain/contracts.g.ts`) and remove the regex file-scanning hack in `generate-contracts.ts`.
   - Ban `unknown` via Biome `noRestrictedTypes` at `"error"` level and eliminate all occurrences of `unknown`.
   - Ensure every property in schemas and boundary interfaces references a named `$defs` type from `schemas/review/` (no anonymous primitives), and split multi-concern files into focused 10–60 line single-concern modules with `private` constructors and no optional parameters.
4. **Comprehensive black-box integration testing**:
   - Replace white-box adapter tests with black-box tests in `scripts/integration/controller.test.ts` exercising `MainAgentController` and `SubAgentController` against MSW, Orval OpenAPI mocks, `@graphql-tools/mock` GraphQL mocks, and a realistic local git repository across initial review, re-review, thread settlement/reopening, pagination, unauthenticated vs. authenticated calls, `already-reviewed`, `refused`, `too-large`, `invalid-target`, and subagent timeout retries.

#### Cheapest passing interpretation

| Goal | Cheapest way to "pass" while missing the point | How the goal excludes it |
|---|---|---|
| 1 | Hold controller state only in in-memory `Map`s while ignoring `workdir` and leaving `MainAgentLedger` / concrete `*SubAgentLedger` classes unused | `prepare`, `dispatch`, and `SubAgentController.report` persist and read state through `Workdir` and the concrete ledger classes, and `MainAgentController` exposes no `adapter()` escape hatch |
| 2 | Keep hand-written Zod response schemas or skip GraphQL thread mutations, pagination, and `merge-base` diffing | Zero hand-written host response schemas remain; outbound requests are produced via `.transform()` from `contracts.g.ts`; integration tests verify `merge-base`, pagination, and GraphQL settlement/reopening mutations |
| 3 | Tamper with `knip.json` or `generate-contracts.ts` to suppress dead-code warnings, or compress 200-line files instead of splitting concerns | `knip` runs without `--no-gitignore` or regex export stripping, Biome bans `unknown`, and multi-concern modules are split into focused 10–60 line files |
| 4 | Test only a happy-path 2-line diff or call `HostAdapter` directly in integration tests | `adapters.test.ts` is deleted; `scripts/integration/controller.test.ts` drives `MainAgentController` and `SubAgentController` across every host and failure/re-review scenario |

---

## Execution Plan

### Goal coverage

| Goal | Delivered by |
|---|---|
| 1 Two tamper-proof actor controllers (`MainAgentController` and `SubAgentController`) | M1, M3 |
| 2 Generic `HostAdapter` over generated client models with full `v0.3.15` parity | M2 |
| 3 Untampered tooling and rulebook compliance | M1, M2, M3 |
| 4 Comprehensive black-box integration testing | M4 |

### Running all tests

`./build.sh` at the repository root.

### Milestone M1: Untampered codegen, Knip, Biome `noRestrictedTypes`, and core domain primitives

Delivers: Goal 3 foundation (honest `knip` and `generate-contracts.ts`, Biome `unknown` ban) and focused single-concern core domain modules (`access-token.ts`, `snapshot-directory.ts`, `code-under-review.ts`, `review-snapshot.ts`, `surface.ts`, `fragments.ts`, `ledger-table.ts`, `outcome.ts`).

Steps:

1. Open `docs/plans/pr-review-lean/progress/002-attempt-1-2026-11-07.md`.
2. Restore `"knip": "knip"` in `skills/pr-review/package.json`, configure `skills/pr-review/knip.json` with entry points and `"!scripts/domain/contracts.g.ts"`, and remove the `importedSchemas` / `exportPrefix` regex scan in `skills/pr-review/scripts/generate-contracts.ts` so all generated schemas and types in `contracts.g.ts` are unconditionally exported.
3. Configure Biome `style.noRestrictedTypes` in `skills/pr-review/biome.json` to ban `unknown` at `"error"` level.
4. Split core domain modules into focused single-concern files with `private` constructors, no optional parameters, preserved trailing newlines on `git show`, 0-hunk filtering in `wholeSurface`, and unsettled-thread filtering in `outcome`:
   - `access-token.ts`, `snapshot-directory.ts`, `code-under-review.ts`, `review-snapshot.ts`
   - `surface.ts`, `fragments.ts`, `ledger-table.ts`, `outcome.ts`
5. Update corresponding unit tests (`code-under-review.test.ts`, `diff.test.ts`, `outcome.test.ts`) to verify these invariants.

Checkpoint M1 verification: `PROJECT_ROOT=$(pwd) npm --prefix skills/pr-review run codegen` and unit tests for `code-under-review`, `diff`, and `outcome` pass.

### Milestone M2: Host adapters and perimeter folding over generated clients

Delivers: Goal 2 (`HostAdapter` interface, `snapshot-hydration.ts`, `git-adapter.ts`, `github.ts`, `github-review.ts`, `github-threads.ts`, `github-adapter.ts`, `azure.ts`, `azure-review.ts`, `azure-threads.ts`, `azure-adapter.ts`, `adapter-factory.ts`) and their unit tests (`github.test.ts`, `azure.test.ts`).

Steps:

1. Define `HostAdapter<HostType>`, `RemotePullRequest`, and `AdapterResolution` in `adapter.ts` using named `$defs` types (`Change`, `HeadCommit`, `Path`, `Ref`, `RepositoryPath`, `Summary`, `Thread`, `Outcome`, `Ledger`).
2. Implement `hydrateSnapshot` in `snapshot-hydration.ts` with `git merge-base`, `gitRaw` for `git show`, `tooLarge` refusal and typed `{ kind: "too-large" }` resolution, and narrowed surface calculation.
3. Implement `GitAdapter` (`git-adapter.ts`), `GitHubAdapter` (`github.ts`, `github-review.ts`, `github-threads.ts`, `github-adapter.ts`), and `AzureDevOpsAdapter` (`azure.ts`, `azure-review.ts`, `azure-threads.ts`, `azure-adapter.ts`) with zero hand-written response schemas, outbound Zod `.transform()` schemas from `contracts.g.ts` to generated client request models, GraphQL thread pagination and settlement/reopening mutations, and Azure `"fixed"` settlement + stale refusal closing.
4. Update `github.test.ts` and `azure.test.ts` to test the domain folding and outbound `.transform()` schemas.

Checkpoint M2 verification: Unit tests in `github.test.ts` and `azure.test.ts` pass and Biome reports zero lint or `unknown` errors on all adapter and host modules.

### Milestone M3: Tamper-proof `MainAgentController`, `SubAgentController`, and concrete ledgers

Delivers: Goal 1 (`ledger-directory.ts`, `workdir.ts`, `instructions.ts`, `probe-loader.ts`, `sub-agent-ledger.ts`, `sub-agent-controller.ts`, `controller.ts`, `SKILL.md`) and unit tests (`ledger.test.ts`, `controller.test.ts`).

Steps:

1. Update `ledger.ts`, `instructions.ts`, and `probe-loader.ts` so every probe document matches `AgentInstructionsSchema` (`{ instructions, task, kind, change, surface, ruleset | rulesets, checkout }`) with zero `unknown` types.
2. Implement `LedgerDirectory` (`ledger-directory.ts`), `Workdir` (`workdir.ts`), concrete sub-agent ledgers (`RulesSubAgentLedger`, `DeadCodeSubAgentLedger`, `ReuseSubAgentLedger`, `ContextSubAgentLedger`), `MainAgentLedger`, and `coordinateLedgers` (`sub-agent-ledger.ts`) persisting slices and audit files under `workdir` and its sibling `ledger` directory.
3. Implement `SubAgentController` (`sub-agent-controller.ts`) exposing `workdir()`, `instructions()`, `change()`, `codeUnderReview()`, `rules()`, and `report(rows)`.
4. Implement `MainAgentController` (`controller.ts`) with `create()`, `withRunner(runner)`, `prepare(url, workdir)`, `prepareWithToken(url, workdir, token)`, `dispatch(workdir)`, and `ledger(workdir, pullRequest)` returning `MainAgentLedger`, with typed `PrepareError` (`invalid-target`, `too-large`, `refused`, `already-reviewed`) and no `adapter()` escape hatch.
5. Update `SKILL.md`, `ledger.test.ts`, and ` domain/controller.test.ts`.

Checkpoint M3 verification: All domain unit tests (`scripts/domain/*.test.ts`) pass.

### Milestone M4: Comprehensive black-box integration suite and full build verification

Delivers: Goal 4 (`scripts/integration/*` and full `./build.sh` verification).

Steps:

1. Delete white-box `scripts/integration/adapters.test.ts`.
2. Upgrade `scenario-repo.ts`, `github-mocks.ts`, `azure-mocks.ts`, `mock-server.ts`, `scenario.ts`, and `scripts/integration/controller.test.ts` (with zero `unknown` types) to exercise `MainAgentController` and `SubAgentController` across:
   - Initial review on Git, GitHub, and Azure DevOps (diverged `main` proving `merge-base`, multi-commit messages, trailing blank lines, 0-hunk empty file)
   - Unauthenticated `prepare` vs. authenticated `prepareWithToken`
   - Re-review (`priorCommit`, narrowed surface, thread `settle`, thread `reopen`, carried open threads, recurring violation on `"resolved"` thread, GraphQL multi-page pagination, human/outdated thread filtering, closing stale Azure refusals)
   - Typed `prepare` errors: `already-reviewed`, `refused` (failing check run, rejected blocking Build policy, merge conflicts, idempotent existing refusal), `too-large` (+200 line production file vs. exempted test/lock/doc files), and `invalid-target`
   - Subagent timeout and re-dispatch (`pending` -> `submitted`).
3. Run `./build.sh` at the repository root and record the complete verification output in `docs/plans/pr-review-lean/progress/002-attempt-1-2026-11-07.md`.

Checkpoint M4 verification: `./build.sh` exits 0 with all schema checks, `codegen`, `knip`, `lint`, `typecheck`, unit tests, integration tests, and site build passing.
