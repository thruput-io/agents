# 001 — PR Review Probe Tool, Intentional Instructions, and Automatic Host Submission
|
## Implementing Agent Instructions

Read this section first, and in full, before touching any code.

**No authoring of this plan.**
This plan is committed and immutable during execution. Executing agents **MUST NOT** author, edit, rewrite, or amend
this plan document (`docs/plans/pr-review-probe-lifecycle/001-pr-review-probe-lifecycle.md`) as part of immediate
instructions or milestone execution. If any conflict, ambiguity, or unexpected error arises, stop immediately and
return control to the human rather than modifying the plan.

**Read before starting.**
This repository's rules, [`rules/Rules.yaml`](../../../rules/Rules.yaml), with the principles
([`rules/Principles.yaml`](../../../rules/Principles.yaml)) and definitions
([`rules/Definitions.yaml`](../../../rules/Definitions.yaml)) they rest on, published at <https://thruput.se/agents/>,
[ADR 0010](../../adrs/0010-pr-review-probe-tool-and-submission-lifecycle.md), the instruction research and target texts
in [`research/instruction-design/README.md`](research/instruction-design/README.md), and this plan end to end. The rules
outrank this plan; raise any conflict with the human instead of resolving it yourself.

**Scope.**
Implement the milestones in [Execution Plan](#execution-plan), in order, with verification and git commit checkpoints at
each milestone. Anything not in this plan is out of scope — stop and ask rather than extending it.

**Definition of done.**
Implementation is complete when every milestone's verification test passes, `./build.sh` at the repository root succeeds
with zero warnings or errors, and every goal in [Goals](#goals) is delivered per the [Goal coverage](#goal-coverage)
table.

**Verification.**
Run `./build.sh` at the repository root at each milestone checkpoint. Do not treat a milestone as done on inspection
alone.

### Progress log

Keep an append-only progress log for this attempt:

- Open `docs/plans/pr-review-probe-lifecycle/progress/001-attempt-1-2026-11-19.md` before the first code change.
- Append at each milestone checkpoint: what was implemented, what verification showed, and the commit hash.
- **MUST NOT** rewrite, condense, or delete an existing entry. Corrections are new entries.
- **MUST NOT** amend or force-push a commit that contains progress-log entries.
- Commit the log alongside the milestone work it describes.

---

## Background

A live smoke test of `pr-review` `v0.3.29` on Azure DevOps PR `62345` exposed five structural and instructional flaws
recorded in [ADR 0010](../../adrs/0010-pr-review-probe-tool-and-submission-lifecycle.md) and analyzed in
[`research/instruction-design/README.md`](research/instruction-design/README.md):

1. **Monolithic `inspect` output exceeded tool truncation limits (`10,662` bytes on `05-domain-model`)**:
   - Stuffing `instructions`, `task`, `permissions`, `change`, `surface`, and the entire `ruleset` (`12` rules + `5`
     principles) into one `inspect` response exceeded the `10,000`-byte `run_command` output limit.
   - Requiring the subagent to echo `rulesInOrder` inside single-quoted shell JSON to `ack` broke `zsh` (`zsh:1:
     unmatched "`) on rule `"Tell, don't ask"`, causing `05-domain-model` to miss the 45-second `ack` deadline.
2. **One-file-per-page `next` paging wasted 104 LLM turns on a 167-line PR**:
   - `paginateSurfaceWithin` forced at least one page per changed file regardless of file size, requiring 8 sequential
     `next` calls per probe for 7 small files totaling under 9 KB.
3. **Bloated, strategy-free, and grammatically inverted instructions wasted tokens and caused invalid `define` calls**:
   - `InstructionsProse` repeated schema shapes across 9 verbose paragraphs (`3,773` bytes), driving 55–83 second
     thinking spirals on `report`.
   - `ReuseTask` and `DeadCodeTask` lacked concrete step-by-step investigation strategies, while `DeadCodeTask`
     lectured on what *not* to do.
   - `RulesetInstructions` used inverted syntax that made `define` sound mandatory for every term, causing 9 failed
     `define` calls on unbracketed phrases and rule IDs.
4. **Main Agent `dispatch` exposed the ledger lifecycle to the orchestrator**:
   - Instead of the last probe's `report` posting the review directly to the host in code, posting was deferred to a
     Main Agent `dispatch` command that dumped the 40 KB merged `ledger` onto the Main Agent's stdout.
5. **Skill source code was shipped inside `skills/pr-review/`**:
   - Placing `src/`, `clients/`, `scripts/`, and build configs inside `skills/pr-review/` shipped TypeScript sources
     into every installed skill directory.

### Goals

In priority order:

1. **Isolate source code outside `skills/pr-review/` so only runtime artifacts are shipped**:
   - Move `src/`, `clients/`, `scripts/`, `package.json`, `package-lock.json`, `tsconfig.json`, `biome.json`,
     `knip.json`, and developer `README.md` from `skills/pr-review/` to `tools/pr-review/`.
   - `skills/pr-review/` contains only runtime skill artifacts: `SKILL.md`, `rules/`, `schemas/`, `references/`, and
     `dist/bin/review-tool.mjs` + `dist/bin/review-tool-probe.mjs`.
2. **Make `ack` Step 1 and bound every probe CLI subcommand strictly under 9 KB**:
   - Remove monolithic `inspect` and the fragile single-quoted `rulesInOrder` / `bookRuleRows` `ack` payload.
   - A probe begins by running `<probe-bin> -h` and `<probe-bin> ack <session> <probe>`, which records acknowledgment,
     starts the 5-minute deadline, and returns the bounded (`< 9 KB`) assignment (`instructions`, `task`,
     `permissions`, `kind`, `change`, `surface`, and `totalRulePages` or `rulesets`).
   - Add `<probe-bin> rules <session> <probe> [page]` to page the probe's `Ruleset` (`rules` and `principles`) strictly
     under 9 KB.
   - Pack multiple small changed files into each `next` / `prev` page up to the `< 9 KB` budget so a small multi-file
     diff fits in 1–2 pages instead of 1 page per file.
3. **Replace all hardcoded instructions with intentional, strategy-driven, plain-English directives**:
   - Apply the exact target texts from [`research/instruction-design/README.md`](research/instruction-design/README.md)
     across `controller.schema.json`, `agent-instructions.schema.json`, `sub-agent-controller.schema.json`, and
     `skills/pr-review/SKILL.md`.
   - State explicit step-by-step investigation strategies in `ReuseTask`, `DeadCodeTask`, `ContextTask`, and
     `RulesTask`, make `define` explicitly optional for unfamiliar bracketed `[[Term]]`s, and make `prepare` with or
     without `<token>` a neutral up-front choice.
4. **Submit the review to the host in code when the final probe reports (no Main Agent `dispatch`)**:
   - Persist host authentication in `LedgerDirectory` during `prepare` / `prepareWithToken`.
   - When the final pending probe records a valid report via `review-tool-probe.mjs report`, merge all slices, post the
     review to the host via `HostAdapter.post(outcome, ledger)` in code, and persist `{ outcome, location }`.
   - Remove `dispatch` from `MainAgentController`, `controller.schema.json`, and `review-tool.mjs`; `status <workdir>`
     returns `submittedOutcome` and `location`.

#### Cheapest passing interpretation

| Goal | Cheapest way to "pass" while missing the point | How the goal excludes it | Accepted by |
|---|---|---|---|
| 1 | Delete `src/` in `install.sh` while leaving source files tracked under `skills/pr-review/` | `git ls-files skills/pr-review` contains only `SKILL.md`, `rules/*`, `schemas`, `references/*`; all TypeScript sources and configs live under `tools/pr-review/` | [D1](#discussions) |
| 2 | Rename `inspect` to `ack` while still returning an un-paginated `10.6 KB` payload containing all rules, or keep 1-file-per-page `next` | `ack` returns only the bounded assignment (`< 9 KB`), `rules` pages the rulebook (`< 9 KB`), and `next` packs multiple small files per page (`< 9 KB`), verified by tests across all 13 bundled probes | [D2](#discussions) |
| 3 | Tweak a few words in `InstructionsProse` while keeping the 9-item schema-repeating wall of text or negative lectures in `DeadCodeTask` | `agent-instructions.schema.json` and `SKILL.md` match the exact 5-item `InstructionsProse` and role strategies in `research/instruction-design/README.md` | [D3](#discussions) |
| 4 | Keep `dispatch` under another name on `review-tool.mjs` or require the Main Agent to pass `<token>` after probes finish | `ControllerCommand` in `controller.schema.json` has only `prepare` and `status`; the final `review-tool-probe.mjs report` posts to the host in code and writes `location` for `status` | [D4](#discussions) |

### Non-goals

- Modifying the governance rules or definitions in `rules/Rules.yaml`, `rules/Principles.yaml`, or
  `rules/Definitions.yaml`.
- Changing GitHub or Azure DevOps review rendering formats or thread settlement logic.

## Summary

Move the `pr-review` TypeScript package out of `skills/pr-review/` into `tools/pr-review/` so `skills/pr-review/` ships
only runtime artifacts; replace monolithic `inspect` with Step 1 `ack`, `rules` paging, and multi-file `next` page
packing strictly under 9 KB; rewrite all probe and main-agent instructions per
[`research/instruction-design/README.md`](research/instruction-design/README.md); and make the final probe `report` post
the review directly to the host in code while removing `dispatch`.

## Assumptions, risks and preconditions

### Assumptions

| Assumption | Tested |
|---|---|
| Separating `rules` from `ack` keeps every probe CLI output strictly under 9 KB even for 12-rule groups (`05-domain-model`) and 2 KB PR descriptions | Verified against the `10,662`-byte `05-domain-model` payload from PR `62345` (`5,206` B `ruleset` moved to `rules` + `InstructionsProse` reduced from `3,773` B to `< 1,600` B) |
| Persisting the optional host token inside `LedgerDirectory` allows the final probe's `report` process to rehydrate `HostAdapter` and post directly to GitHub or Azure DevOps | Verified against `HostAdapterPort.rehydrateWithToken` in `tools/pr-review/src/adapters/host-adapter-factory.ts` |

### Risks

- Concurrent probe `report` processes finishing at the exact same millisecond could race when checking whether all
  slices are present; mitigated by atomic slice writes and idempotent submission state in `LedgerDirectory`.

### Preconditions

- Branch `adr-pr-review-tool-lifecycle` is up to date with `origin/main` (`v0.3.29`, commit `ceab170`).

## References

- Research report: [`research/instruction-design/README.md`](research/instruction-design/README.md)
- Architectural direction: [ADR 0010](../../adrs/0010-pr-review-probe-tool-and-submission-lifecycle.md)

## Discussions

| Row | Decider | Question | Answer |
|---|---|---|---|
| D1 | Human | Should `pr-review` source code ever be shipped in the installed skill directory? | "Also make sure code for skill is never shipped" |
| D2 | Human | How should `ack` and the probe CLI work instead of a single bloated `inspect` payload? | "Complete failure Wrapping everything in one SINGLE BLOATED invocation, WHAT IS THE TOOKL FOR???`?? ... Ack pupose: find the tool, understand the json schemas" |
| D3 | Human | How should probe instructions, strategies (`reuse`, `dead-code`), and `define` be written? | "L57: Extremely many woords wihtout any inormation. L63: Completely lacks how agent should strategize this L67: Same as reuse, ALSO funiest of ALL, what he SHOULD NOT DO L75: Why are not using correct grammar, it sounds like 'star wars'. And define is not MANDATORY ... changes to insructionstions should be handled by INTENTIONAL KNOWLEDGE HOW TO WRITE THEM" |
| D4 | Human | Who triggers posting the review when all probes have reported, and how should `<token>` on `prepare` be chosen? | "I just cannot understand why this is back when main agent should have nothing to do with, last subagent reporting should trigger it in code ... make an adr (why tool, why ack, why mmethosd tieh or without token should bne a neutral choice to agent" |

---

## Execution Plan

### Goal coverage

| Goal | Delivered by |
|---|---|
| 1 Isolate source code outside `skills/pr-review/` (`tools/pr-review/`) | M1 |
| 2 Make `ack` Step 1, add `rules` paging, and pack multi-file `next` pages (`< 9 KB`) | M2, M3 |
| 3 Intentional, strategy-driven instructions and neutral `<token>` `prepare` | M2, M3, M4 |
| 4 Automatic host submission in code on final probe `report` (remove `dispatch`) | M2, M4 |

### Running all tests

`./build.sh` at the repository root.

### Milestone M1: Isolate `pr-review` source and build tooling in `tools/pr-review/`

Delivers: Goal 1 (`tools/pr-review/` holds all TypeScript sources, client generation, tests, and build configs;
`skills/pr-review/` holds only `SKILL.md`, `rules/`, `schemas`, `references/`, and `dist/bin/*.mjs`).

Steps:

1. Open `docs/plans/pr-review-probe-lifecycle/progress/001-attempt-1-2026-11-19.md`.
2. `git mv` `src/`, `clients/`, `scripts/`, `package.json`, `package-lock.json`, `tsconfig.json`, `biome.json`,
   `knip.json`, and `README.md` from `skills/pr-review/` to `tools/pr-review/`.
3. Update `tools/pr-review/package.json` `build` script so `esbuild` outputs `../../skills/pr-review/dist/bin/review-tool.mjs`
   and `../../skills/pr-review/dist/bin/review-tool-probe.mjs`.
4. Update path resolution in `tools/pr-review/src/adapters/fs/skill-dir.ts`,
   `tools/pr-review/src/client/sub-agent-help.ts`, `tools/pr-review/scripts/generate-clients.ts`,
   `tools/pr-review/src/integration-test/scenario-cli.ts`, and `tools/pr-review/src/integration-test/github-mocks.ts` to
   locate the runtime skill directory (`skills/pr-review/`).
5. Update `scripts/verify.sh` and `.github/workflows/release.yml` to run `npm --prefix "$PROJECT_ROOT/tools/pr-review"`.

Checkpoint M1 verification: `./build.sh` exits 0 and `git ls-files skills/pr-review` lists no `.ts` or package config
files.

### Milestone M2: Update review schemas and codegen for `ack` Step 1, `rules` paging, multi-file `next`, intentional instructions, and removal of `dispatch`

Delivers: Schema contracts for Goals 2, 3, and 4 (`schemas/review/*.schema.json` and
`tools/pr-review/scripts/generate-contracts.ts`).

Steps:

1. Update `schemas/review/controller.schema.json`:
   - Set `ProbePrompt` pattern to
     `^Run /.+/review-tool-probe\.mjs -h, then run /.+/review-tool-probe\.mjs ack pr-review-session:[A-Za-z0-9_-]+ [0-9]{2}-[a-z0-9-]+ and follow its instructions\.$`.
   - Remove `DispatchCommand`, `DispatchResult`, `DispatchPending`, and `DispatchSubmitted`.
   - Add `location` (`LocationUrl | null`) to `ReviewStatus` and optional persisted host token to
     `PersistedPullRequest`.
2. Update `schemas/review/agent-instructions.schema.json`:
   - Replace the 9-item `InstructionsProse` with the 5-item intentional `InstructionsProse` from
     [`research/instruction-design/README.md`](research/instruction-design/README.md).
   - Update `RulesTask`, `ReuseTask`, `DeadCodeTask`, `ContextTask`, and `RulesetInstructions` to the exact texts in
     [`research/instruction-design/README.md`](research/instruction-design/README.md).
   - Replace inline `ruleset` on `RulesInstructions`, `ReuseInstructions`, and `DeadCodeInstructions` with
     `totalRulePages` (`integer >= 1`) and `ruleIds` (`array of RuleId`) so `ack` is guaranteed `< 9 KB`, and define
     `RulesPageResponse` for the `rules` subcommand.
3. Update `schemas/review/sub-agent-controller.schema.json`:
   - Remove `InspectCommand`, `RulesAckPayload`, and `ContextAckPayload`.
   - Define `AckCommand` (`{ command: "ack", session, probe }`) returning `AckResponse` (`{ success: true, probe,
     acknowledged: true, deadlineMs, instructions: AgentInstructions }`).
   - Add `RulesCommand` (`{ command: "rules", session, probe, page }`) returning `RulesPageResponse`.
   - Update `SurfacePage` to carry `files: SurfacePageFile[]` so multiple small files pack into a single `< 9 KB` page.
   - Add `location` (`LocationUrl`, optional) to `ReportSuccess` when `kind` is `"submitted"`.
4. Update `tools/pr-review/scripts/generate-contracts.ts` and run `npm --prefix tools/pr-review run codegen`.

Checkpoint M2 verification: `scripts/verify.sh` JSON Schema lint/metaschema checks and `npm --prefix tools/pr-review run codegen` pass.

### Milestone M3: Implement Step 1 `ack`, `rules` paging, and multi-file `next` packing (`< 9 KB`)

Delivers: Goal 2 and Goal 3 domain/controller/CLI implementation (`pagination.ts`, `instructions.ts`,
`probe-document.ts`, `sub-agent-paging.ts`, `sub-agent-probe.ts`, `sub-agent-controller.ts`, `sub-agent-args.ts`,
`sub-agent-cli.ts`, `sub-agent-help.ts`, and unit tests).

Steps:

1. Update `tools/pr-review/src/domain/pagination.ts` to greedily pack multiple changed files into each `SurfacePage`
   under `MAX_PAGE_JSON_BYTES`, splitting single files across pages only when a file's fragments exceed the byte cap,
   and add rulebook pagination (`paginateRulebookWithin`) under `MAX_PAGE_JSON_BYTES`.
2. Update `tools/pr-review/src/domain/instructions.ts` and `probe-document.ts` to construct the 5-item
   `InstructionsProse`, strategy-driven `task` strings, `totalRulePages`, and `ruleIds`.
3. Update `SubAgentController`, `sub-agent-probe.ts`, `sub-agent-paging.ts`, `sub-agent-args.ts`, `sub-agent-cli.ts`,
   and `sub-agent-help.ts` so:
   - `ack <session> <probe>` records the timestamp, starts the 5-minute deadline, and returns `AckResponse` with the
     probe's `AgentInstructions` (`< 9 KB`).
   - `rules <session> <probe> [page]` returns the requested page of `Ruleset` (`rules`, `principles`, `instructions`)
     strictly `< 9 KB`.
   - `next` and `prev` return multi-file `SurfacePage` responses strictly `< 9 KB`.
4. Update unit tests (`instructions.test.ts`, `instructions-prose.test.ts`, `controller.test.ts`,
   `controller-cli.test.ts`, `review-tool-paging.test.ts`) to assert `< 9 KB` bounds across every subcommand (`ack`,
   `rules`, `ruleset`, `next`, `prev`) for all 13 bundled probes.

Checkpoint M3 verification: All unit tests in `tools/pr-review/src/domain/`, `controller/`, and `client/` pass.

### Milestone M4: Automatic host submission on final probe `report`, removal of `dispatch`, and `SKILL.md` update

Delivers: Goal 4 and final Goal 3 integration (`ledger-directory.ts`, `ports.ts`, `coordinate-ledgers.ts`,
`main-agent-ledger.ts`, `controller-session.ts`, `controller.ts`, `sub-agent-hydration.ts`, `controller-cli.ts`,
`controller-cli-handlers.ts`, `skills/pr-review/SKILL.md`, and black-box integration tests).

Steps:

1. Update `LedgerStore` (`ports.ts`) and `LedgerDirectory` (`ledger-directory.ts`) to persist host authentication token
   in `pull-request.json` during `prepareWithToken` and to read/write `{ outcome, location }` in `submission.json`.
2. Make `SubAgentController.report` and `runSubAgentCli` asynchronous so that when the final pending probe slice is
   recorded and `coordinateLedgers` settles `{ ledger, outcome }`, the controller rehydrates the `HostAdapter`, calls
   `await adapter.post(outcome, ledger)`, persists `{ outcome, location }` to `LedgerDirectory`, and returns
   `{ success: true, kind: "submitted", headCommit, rowCount, location }`.
3. Remove `dispatch` and `dispatchWithToken` from `MainAgentController`, `controller-cli.ts`, and
   `controller-cli-handlers.ts`, and include `location` in `ReviewStatus` returned by `review-tool.mjs status <workdir>`.
4. Update `skills/pr-review/SKILL.md` to reflect:
   - Neutral up-front choice between `prepare <url> <workdir>` and `prepare <url> <workdir> <token>` based on host and
     operator-governed credentials.
   - Spawning probes with `PrepareReady.prompts[probe]` and `PrepareReady.permissions[probe]`.
   - Monitoring via `status <workdir>` (45s `ack` check, 180s reminder, 150s deadline) until `submittedOutcome` and
     `location` are populated, with no `dispatch` command.
5. Update all black-box integration tests (`review-cli.test.ts`, `review-cli-rereview.test.ts`,
   `review-cli-shortcircuit.test.ts`, `scenario.ts`, `scenario-cli.ts`, `main-agent-fixtures.test.ts`,
   `controller-fixtures.test.ts`) and run `./build.sh`.

Checkpoint M4 verification: `./build.sh` exits 0 with all schema validations, `codegen`, `build`, `knip`, `biome`,
`tsc --noEmit`, unit and integration tests, `@agentplugins/cli audit`, and site build passing.
