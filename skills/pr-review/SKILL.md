---

name: pr-review
description: Reviews a GitHub or Azure DevOps pull request, or a change in a plain git repository, against the thruput-io rules bundled with this skill (published at https://thruput.se/agents/), and posts one review with inline comments on the correct lines. Probes every rule in boxed subagents via controllers, so the reviewing agent never decides a verdict, cites each violation by rule and published URL, and groups comments into one review where the host allows. Use when the user gives a PR URL or asks for a rules-driven PR review.
compatibility: Requires node and tar. GitHub needs gh; Azure DevOps needs az with the azure-devops extension and git; a plain repository needs git. Network access to raw.githubusercontent.com/ciembor/agent-rules-books.
---

# PR Review Instructions

`<skill>` is the directory containing this `SKILL.md`. Terms in `[[Term]]` brackets are defined in `<skill>/rules/Definitions.yaml`; CLI commands, return objects, and internal representations are specified in `https://thruput.se/agents/schemas/review/` (`schemas/review/*.schema.json`):

- **Main controller contract**: `controller.schema.json` (`#/$defs/ControllerCommand`, `#/$defs/PrepareResponse`, `#/$defs/ReviewStatus`, `#/$defs/DispatchResult`, `#/$defs/Outcome`, `#/$defs/HostError`, `#/$defs/PersistedPullRequest`).
- **Subagent controller contract**: `sub-agent-controller.schema.json` (`#/$defs/SubAgentCommand`, `#/$defs/AckResponse`, `#/$defs/ReportResponse`, `#/$defs/LedgerSubmission`) and `agent-instructions.schema.json` (`#/$defs/RulesInstructions`, `#/$defs/ReuseInstructions`, `#/$defs/DeadCodeInstructions`, `#/$defs/ContextInstructions`, `#/$defs/Ruleset`).
- **Domain contracts**: `change.schema.json` (`[[Change]]`, `#/$defs/Surface`, `#/$defs/Fragment`, `#/$defs/Threads`) and `ledger.schema.json` (`[[Ledger]]`, `#/$defs/Row`, `#/$defs/Violation`, `[[Evidence]]`).

Do not read `.ts` source files or write inline `node -e` scripts; run the two controller CLIs directly (`-h` or `--help` prints usage and schema help).

## Operating Boundaries

- **This `SKILL.md` is strictly for the reviewing context (Main Agent) and must never be referenced, passed to, or read by subagents.**
- **Do not pre-examine inputs before calling `prepare`.** Pass `<url>` (`controller.schema.json#/$defs/Target`) and `<workdir>` (`controller.schema.json#/$defs/SessionDir`) directly to `controller.ts prepare` without first inspecting the `[[Change]]`, `[[Change Set]]`, repository files, or `[[Ruleset]]`. Only inspect, adjust, or test `<workdir>` or `<url>` (with `git`, `gh`, or `az`) if `prepare` returns `InvalidInputError`.
- **Do not read or modify review artifacts in `<workdir>`, and never expose `<workdir>` to subagents.** `PersistedPullRequest` (`controller.schema.json#/$defs/PersistedPullRequest`), `AgentInstructions` (`agent-instructions.schema.json`), `AckRecord` (`sub-agent-controller.schema.json#/$defs/AckRecord`), and `Ledger` slices (`ledger.schema.json`) inside `<workdir>` and its sibling `ledger` directory are managed exclusively by the controllers. Subagents receive only the opaque `<session>` token (`PrepareReady.session`) and have no tools to write to disk.
- **Do not author, alter, or relay subagent instructions, evaluate rules, decide verdicts, or invoke `sub-agent-controller.ts` in the main agent.** Spawn one boxed subagent per probe in `PrepareReady.pending`, passing `PrepareReady.prompts[<probe>]` verbatim and restricting its allowed tools to `PrepareReady.permissions[<probe>]` (`controller.schema.json#/$defs/ProbePermissions`); each subagent obtains its `AgentInstructions` document (`agent-instructions.schema.json`) directly from `sub-agent-controller.ts inspect` (`sub-agent-controller.schema.json#/$defs/InspectCommand`).
- **Cancel the entire review if no obvious solution is there rather than venturing into workarounds.** On `AlreadyReviewed`, `TooLarge`, `Refused`, or an unrecoverable `HostError` (`controller.schema.json#/$defs/HostError`), cancel the entire review immediately and report the controller's response to the user—never fall back to reviewing a local `git` range, fetching branches manually, or evaluating rules outside the controller pipeline.

## 1. Main Agent — Prepare (`controller.schema.json#/$defs/PrepareCommand`)

1. Choose an empty canonical (non-symlinked) `<workdir>` and run:

   ```sh
   node <skill>/scripts/domain/controller.ts prepare <url> <workdir> [<token>]
   ```

   Omit `<token>` unless explicitly provided.
2. Handle `PrepareResponse` (`controller.schema.json#/$defs/PrepareResponse`):
   - **`PrepareFailure` with `InvalidInputError` (`controller.schema.json#/$defs/InvalidInputError`, `kind: "invalid-target" | "invalid-workdir" | "invalid-token"`)**: Fix `<workdir>` or `<url>` and re-run `prepare`.
   - **`PrepareFailure` with `HostError` (`controller.schema.json#/$defs/HostError`, `kind: "host-error"`)**: If `status` is `403`, `401`, or `203` and no `<token>` was passed yet, you may—if permitted by your assigned permissions and instructions—re-run `prepare <url> <workdir> <token>`; otherwise (including `status: 400` where the pull request is not writeable) report `host`, `status`, `message`, and `reason` to the user and cancel the entire review immediately without attempting any workarounds.
   - **`PrepareFailure` with `Refused` | `TooLarge` | `AlreadyReviewed` (`controller.schema.json#/$defs/Refused`, `#/$defs/TooLarge`, `#/$defs/AlreadyReviewed`)**: Report `error` to the user and cancel the entire review without attempting any workarounds.
   - **`PrepareReady` (`controller.schema.json#/$defs/PrepareReady`, `{ "success": true, "session", "pending", "prompts", "permissions" }`)**: Proceed immediately to Step 2.

## 2. Main Agent — Spawn Subagents, Ack & Dispatch

1. **Spawn all `PrepareReady.pending` probes concurrently**: Invoke one boxed subagent per `<name>` in `pending`, passing `prompts[<name>]` **verbatim** as the subagent prompt (`sub-agent-controller.ts ack` validates `AckCommand` against the exact canonical prompt and rejects any modified message) and restricting its allowed tools to `permissions[<name>]` (`controller.schema.json#/$defs/ProbePermissions`).
2. **Ack check (`45s` timer -> `controller.schema.json#/$defs/StatusCommand`)**: Schedule a one-shot timer (`DurationSeconds: 45`, `TimerCondition: "never"`). When all subagents have sent their `ack` message (or when the 45s timer fires), run `node <skill>/scripts/domain/controller.ts status <workdir>` (`ReviewStatus`, `controller.schema.json#/$defs/ReviewStatus`). Kill and re-spawn any probe in `ReviewStatus.unacknowledged`.
3. **Review deadline from `ack` (`180s` reminder + `150s` kill = `330s` total from `AckRecord.acknowledgedAt`)**:
   - Whenever a probe reports (including a late report, and regardless of whether an earlier or re-spawned subagent reported for that probe), immediately cancel any running subagent for that probe (`manage_subagents` `kill`).
   - Once probes have acknowledged, schedule a **3-minute reminder timer** (`DurationSeconds: 180`, `TimerCondition: "never"`).
   - If all subagents complete before `180s`, cancel the active timer (`manage_task` `kill`) and proceed to step 4.
   - When the `180s` timer fires, run `node <skill>/scripts/domain/controller.ts status <workdir>`, send every probe in `ReviewStatus.pending` a wrap-up signal via `send_message` (`"3 minutes elapsed since ack (2 minutes remaining before the 5-minute deadline). Wrap up and run sub-agent-controller.ts report immediately."`—never reveal the extra 30-second grace buffer to the subagent), and schedule the **kill timer** (`DurationSeconds: 150`, `TimerCondition: "never"`).
   - If any subagent is still running when the `150s` kill timer fires, terminate the overdue subagents immediately (`manage_subagents` `kill`) and proceed to step 4.
4. **Dispatch (`controller.schema.json#/$defs/DispatchCommand`)**:

   ```sh
   node <skill>/scripts/domain/controller.ts dispatch <workdir> [<token>]
   ```

5. Handle `DispatchResult` (`controller.schema.json#/$defs/DispatchResult`):
   - **`DispatchSubmitted` (`#/$defs/DispatchSubmitted`, `{ "kind": "submitted", "outcome", "ledger", "location" }`)**: Report `outcome` (`controller.schema.json#/$defs/Outcome`) and `location` to the user and stop.
   - **`HostError` (`controller.schema.json#/$defs/HostError`, `{ "kind": "host-error", "host", "status", "message", "reason" }`)**: Report `host`, `status`, `message`, and `reason` to the user and cancel the entire review immediately without attempting any workarounds.
   - **`DispatchPending` (`#/$defs/DispatchPending`, `{ "kind": "pending", "remaining" }`)**: Re-spawn subagents only for `remaining` following steps 1–4 (up to **2 retries**). If still `"pending"` after 2 retries, stop and report `remaining` to the user.
