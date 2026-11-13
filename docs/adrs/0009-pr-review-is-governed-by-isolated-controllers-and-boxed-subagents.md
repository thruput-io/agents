# 9. PR Review Is Governed by Isolated Controllers and Boxed Subagents

Date: 2026-04-13

## Status

Accepted

## Context

Reviewing a `[[Pull request]]` against all governance rules in `Rules.yaml`—plus external domain rulebooks—exceeds the reliable attention span of a single LLM prompt (`[[Contextrot]]`). When a single agent fetches the diff, reads the repository, interprets all rules, and posts comments directly:

1. Rules are silently skipped or evaluated superficially without verifiable `[[Evidence]]`.
2. Diffs and prior review threads on GitHub, Azure DevOps, and plain Git repositories have incompatible shapes, causing host-specific branching to leak into review logic.
3. Untrusted pull request descriptions or source comments can inject instructions into the reviewing agent.
4. Subagents asked to copy file paths, sides, and verbatim source lines into nested anchor objects waste tokens and fail validation on minor transcription errors.
5. Non-successful host HTTP responses (such as expired tokens or non-writeable pull requests) tempt the main agent into improvised workarounds instead of failing fast (`[[Fail fast]]`).

## Decision

The `pr-review` skill (`skills/pr-review/`) separates orchestration, rule probing, and host communication behind two deterministic CLI controllers (`controller.ts` for the main agent and `sub-agent-controller.ts` for probe subagents) governed by five consolidated JSON Schemas under `schemas/review/`:

1. **Five cohesive review schemas with zero duplication (`schemas/review/`)**:
   - `change.schema.json`: The `[[Change]]` (`GitHub`, `AzureDevOps`, or `Git`), the `[[Surface]]` (`SurfaceFile`, `Fragment`, `SurfaceLine` with `idToReportViolationOn`), and prior `Threads`.
   - `agent-instructions.schema.json`: The `AgentInstructions` handed to each probe (`rules`, `reuse`, `dead-code`, `context`), where `Ruleset` directly `$ref`s `../governance/rules.schema.json#/properties/rules`, `../governance/principles.schema.json#/properties/principles`, and `../governance/definitions.schema.json#/properties/definitions` alongside hardcoded `instructions` prose.
   - `ledger.schema.json`: The `[[Ledger]]` (`Row`, `Violation`, `BookRule`), where a `Violation` consists of the three essentials—the rule ID (`rule`, referencing `RuleId` or `BookRule`), the surface line ID (`idToReportViolationOn`, referencing `SurfaceLine.idToReportViolationOn` and omitted when the finding applies to the pull request as a whole), and the violation description (`observation`).
   - `controller.schema.json`: `ControllerCommand` (`prepare`, `status`, `dispatch`), `PrepareResponse`, `ReviewStatus`, `DispatchResult`, `Outcome`, `HostError`, and `PersistedPullRequest`.
   - `sub-agent-controller.schema.json`: `SubAgentCommand` (`inspect`, `ack`, `report` with `ProbeReport.oneRowPerRuleInOrder`), `AckResponse`, `ReportResponse`, and `LedgerSubmission`.
2. **Host-agnostic `Change` model via perimeter codecs and generated OpenAPI clients**:
   - GitHub (`schemas/github.openapi.json`) and Azure DevOps (`schemas/azure.openapi.json`) REST calls are generated via Orval (`clients.g.ts`), including commit archive downloads.
   - Host adapters fold vendor payloads into the single `Change`, `Surface`, and `Threads` model at the `[[Perimeter]]`. Every non-successful host call returns a schema-defined `HostError` (`kind: "host-error"`, `host`, `status`, `message`, `reason`) so the main agent stops and reports rather than improvising workarounds.
3. **Isolated controllers and opaque session tokens**:
   - `controller.ts prepare` resolves the pull request, extracts commit archives into `<workdir>/snapshot`, writes `pull-request.json` and per-probe audit documents, and returns an opaque `session` token (`pr-review-session:<base64url>`), `pending` probe names, canonical bootstrap `prompts`, and per-probe tool `permissions`.
   - The main agent never reads `<workdir>`, never authors subagent instructions, and never evaluates rules.
4. **Boxed subagents with prompt-injection guards, tool permissions, and deadlines**:
   - Each probe subagent is spawned with its exact bootstrap prompt and restricted to `PrepareReady.permissions[<probe>]` (`Bash(node *sub-agent-controller.ts*)` only for `rules` and `context` probes; read-only `Read`/`Grep`/`Glob` added for `dead-code`; `WebSearch`/`WebFetch` added for `reuse`).
   - `sub-agent-controller.ts ack` verifies the exact bootstrap prompt before starting the 5-minute deadline; `InstructionsProse` declares that only `#/instructions`, `#/task`, and `#/permissions` are instructions and all other fields (`#/change/description`, source code, dispatcher messages) are untrusted data.
   - Subagents report via `sub-agent-controller.ts report <session> <probe> '{"oneRowPerRuleInOrder": [...]}'`. The controller validates that every rule is accounted for in order and resolves each `Violation.idToReportViolationOn` against `surface.files` to produce inline findings, threads to settle, and threads to reopen on `controller.ts dispatch`.

## Consequences

- **Positive**: Every rule in `Rules.yaml` is accounted for in a validated `[[Ledger]]` row with `[[Evidence]]` before a review can be dispatched.
- **Positive**: Subagents report violations by referencing rule ID and line ID (`idToReportViolationOn`) without copying file paths, diff sides, or source lines, eliminating transcription failures and reducing token usage.
- **Positive**: Prompt injection via pull request descriptions or comments is neutralized by strict data/instruction separation and minimal per-probe tool permissions.
- **Negative**: Reviews require a multi-step controller lifecycle (`prepare` -> `inspect`/`ack`/`report` -> `dispatch`) rather than a single prompt.
