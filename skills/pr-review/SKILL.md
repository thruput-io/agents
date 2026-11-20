---

name: pr-review
description: Reviews a GitHub or Azure DevOps pull request, or a change in a plain git repository, against the thruput-io rules bundled with this skill (published at https://thruput.se/agents/), and posts one review with inline comments on the correct lines. Probes every rule in boxed subagents via deterministic controllers that compute the verdict, cite each violation by rule and published URL, and group comments into one review where the host allows. Use when the user gives a PR URL or asks for a rules-driven PR review.
compatibility: Requires node and tar. GitHub needs gh; Azure DevOps needs az with the azure-devops extension and git; a plain repository needs git. Network access to raw.githubusercontent.com/ciembor/agent-rules-books.
---

# PR Review Instructions

`<skill>` is the directory containing this `SKILL.md`. Terms in `[[Term]]` brackets are defined in `<skill>/rules/Definitions.yaml`; main controller CLI commands and return objects are specified in `https://thruput.se/agents/schemas/review/controller.schema.json` (`#/$defs/ControllerCommand`, `#/$defs/PrepareResponse`, `#/$defs/ReviewStatus`, `#/$defs/Outcome`, `#/$defs/HostError`).

Run `<skill>/dist/bin/review-tool.mjs` directly (`-h` or `--help` prints usage).

## Main Agent Role

- **Controller-driven orchestration**: Drive the review exclusively through `<skill>/dist/bin/review-tool.mjs` (`prepare` and `status`) and subagent spawning.
- **Immediate preparation**: Call `prepare` as your first action; inspect or adjust `<url>` or `<workdir>` only when `prepare` returns `InvalidInputError`.
- **Verbatim probe delegation**: Spawn one boxed subagent per probe in `PrepareReady.pending` order (which orders probes with the longest `deadlineMs`—`dead-code` and `context`—first) with workspace instruction files (`CLAUDE.md`, `GEMINI.md`) omitted, allowed tools set to `PrepareReady.permissions[probe]`, and prompt set to `PrepareReady.prompt` (with `<skill>`, `PrepareReady.session`, and `<probe>` filled in).
- **Automatic host submission**: The final probe's `review-tool-probe.mjs report` call posts the merged review to the host automatically in code; read `submittedOutcome` and `location` via `<skill>/dist/bin/review-tool.mjs status <workdir>`.

## 1. Prepare (`controller.schema.json#/$defs/PrepareCommand`)

1. Run `prepare` with `<url>` and `<workdir>` (e.g. `.pr-review`—`prepare` creates `<workdir>` and cleans its internal subdirectories automatically), with or without `<token>`:

   ```sh
   <skill>/dist/bin/review-tool.mjs prepare <url> <workdir>
   <skill>/dist/bin/review-tool.mjs prepare <url> <workdir> <token>
   ```

   Pass `<token>` when your environment or instructions provide an access token for the target host, or omit `<token>` when none is needed (such as a local `git` target or preconfigured environment credentials). When `<token>` is passed to `prepare`, the final probe's `report` call reuses it automatically to post the review.
2. Handle `PrepareResponse` (`controller.schema.json#/$defs/PrepareResponse`):
   - **`PrepareFailure` with `InvalidInputError` (`controller.schema.json#/$defs/InvalidInputError`, `kind: "invalid-target" | "invalid-workdir" | "invalid-token"`)**: Correct `<workdir>`, `<url>`, or `<token>` and re-run `prepare`.
   - **`PrepareFailure` with `HostError` (`controller.schema.json#/$defs/HostError`, `kind: "host-error"`)**: When `status` is `401`, `403`, or `203` and a governed `<token>` is available and was omitted on the first call, re-run `prepare <url> <workdir> <token>`. For any other `HostError`, report `host`, `status`, `message`, and `reason` to the user and stop.
   - **`PrepareFailure` with `Refused` | `TooLarge` | `AlreadyReviewed` (`controller.schema.json#/$defs/Refused`, `#/$defs/TooLarge`, `#/$defs/AlreadyReviewed`)**: Report `error.kind`, `headCommit`, `location` (when present), and the refusal summary (`reason` or changed file count) to the user and stop.
   - **`PrepareReady` (`controller.schema.json#/$defs/PrepareReady`, `{ "success": true, "session", "pending", "prompt", "permissions" }`)**: Proceed to Step 2.

## 2. Spawn Subagents & Await Status

1. **Spawn all `PrepareReady.pending` probes concurrently**:
   - If your harness defines custom subagents via `define_subagent`, define `pr-review-probe` once (`SystemPrompt: "Follow your prompt and the probe CLI instructions."`, `EnableWriteTools: true`, `EnableSubagentTools: false`, `EnableMCPTools: false`). If your harness accepts per-invocation tool allowlists and instruction-file exclusions, set allowed tools to `permissions[probe]` (`controller.schema.json#/$defs/ProbePermissionsMap`) and omit workspace instruction files (`CLAUDE.md`, `GEMINI.md`).
   - Invoke one subagent per `probe` in `PrepareReady.pending` order concurrently—starting with the longest-deadline probes (`dead-code` and `context` at 6 minutes, followed by `reuse` and `rules` at 5 minutes), using a fast mid-tier coding model (`sonnet` or `flash`) for standard probes (`rules`, `reuse`, `dead-code`) and the most capable model (`opus` or `pro`) for the `-context` probe—passing `PrepareReady.prompt` (`controller.schema.json#/$defs/PrepareReady/properties/prompt`) with `<skill>`, `PrepareReady.session`, and `<probe>` filled in.
2. **Await status in code (`controller.schema.json#/$defs/StatusCommand`)**:

   ```sh
   <skill>/dist/bin/review-tool.mjs status <workdir>
   ```

   `status` tracks the acknowledgment timeout (`StatusCommand.ackTimeoutMs`) and each probe's reporting deadline (`Probe.deadlineMs`) in code, returning `ReviewStatus` (`controller.schema.json#/$defs/ReviewStatus`) as soon as all probes complete or any probe times out:
   - **When `ReviewStatus.submittedOutcome` is present**: Terminate any remaining subagents, report `ReviewStatus.submittedOutcome` (`controller.schema.json#/$defs/Outcome`) and `ReviewStatus.location` to the user, and stop.
   - **When `ReviewStatus.unacknowledged` is non-empty**: Terminate the subagents for `ReviewStatus.unacknowledged`, re-spawn only `ReviewStatus.unacknowledged` using `PrepareReady.prompt` and `permissions[probe]`, and re-run `<skill>/dist/bin/review-tool.mjs status <workdir>` (up to **2 retries**). If `ReviewStatus.pending` remains non-empty after 2 retries, terminate remaining subagents, report `ReviewStatus.pending` to the user, and stop.
