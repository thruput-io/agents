---

name: pr-review
description: Reviews a GitHub or Azure DevOps pull request, or a change in a plain git repository, against the thruput-io rules bundled with this skill (published at https://thruput.se/agents/), and posts one review with inline comments on the correct lines. Probes every rule in boxed subagents via deterministic controllers that compute the verdict, cite each violation by rule and published URL, and group comments into one review where the host allows. Use when the user gives a PR URL or asks for a rules-driven PR review.
compatibility: Requires node and tar. GitHub needs gh; Azure DevOps needs az with the azure-devops extension and git; a plain repository needs git. Network access to raw.githubusercontent.com/ciembor/agent-rules-books.
---

# PR Review Instructions

`<skill>` is the directory containing this `SKILL.md`. Terms in `[[Term]]` brackets are defined in `<skill>/rules/Definitions.yaml`; main controller CLI commands and return objects are specified in `https://thruput.se/agents/schemas/review/controller.schema.json` (`#/$defs/ControllerCommand`, `#/$defs/PrepareResponse`, `#/$defs/ReviewStatus`, `#/$defs/Outcome`, `#/$defs/HostError`).

Run `<skill>/dist/bin/review-tool.mjs` directly (`-h` or `--help` prints usage).

## Main Agent Role

- **Controller-driven orchestration**: Drive the review exclusively through `<skill>/dist/bin/review-tool.mjs` (`prepare` and `status`), subagent spawning, and timer scheduling.
- **Immediate preparation**: Call `prepare` as your first action; inspect or adjust `<url>` or `<workdir>` only when `prepare` returns `InvalidInputError`.
- **Verbatim probe delegation**: Spawn one boxed subagent per probe in `PrepareReady.pending` with workspace instruction files (`CLAUDE.md`, `GEMINI.md`) omitted, allowed tools set to `PrepareReady.permissions[probe]`, and prompt set verbatim to `PrepareReady.prompts[probe]`.
- **Automatic host submission**: The final probe's `review-tool-probe.mjs report` call posts the merged review to the host automatically in code; read `submittedOutcome` and `location` via `<skill>/dist/bin/review-tool.mjs status <workdir>`.

## 1. Prepare (`controller.schema.json#/$defs/PrepareCommand`)

1. Run `prepare` with `<url>`, `<workdir>` (e.g. `.pr-review`—`prepare` creates `<workdir>` and cleans its internal subdirectories automatically), and optional `<token>`:

   ```sh
   <skill>/dist/bin/review-tool.mjs prepare <url> <workdir> [<token>]
   ```

   Pass `<token>` when your operator-governed credentials (`get-gh-token.sh`, `get-ado-pat.sh`, or an explicit user token) provide one for the target host, or omit `<token>` when ambient CLI authentication (`gh` / `az`) or a local `file://` target is used. When `<token>` is passed to `prepare`, the final probe's `report` call reuses it to post the review.
2. Handle `PrepareResponse` (`controller.schema.json#/$defs/PrepareResponse`):
   - **`PrepareFailure` with `InvalidInputError` (`controller.schema.json#/$defs/InvalidInputError`, `kind: "invalid-target" | "invalid-workdir" | "invalid-token"`)**: Correct `<workdir>`, `<url>`, or `<token>` and re-run `prepare`.
   - **`PrepareFailure` with `HostError` (`controller.schema.json#/$defs/HostError`, `kind: "host-error"`)**: When `status` is `401`, `403`, or `203` and a governed `<token>` is available and was omitted on the first call, re-run `prepare <url> <workdir> <token>`. For any other `HostError`, report `host`, `status`, `message`, and `reason` to the user and stop.
   - **`PrepareFailure` with `Refused` | `TooLarge` | `AlreadyReviewed` (`controller.schema.json#/$defs/Refused`, `#/$defs/TooLarge`, `#/$defs/AlreadyReviewed`)**: Report `error.kind`, `headCommit`, `location` (when present), and the refusal summary (`reason` or changed file count) to the user and stop.
   - **`PrepareReady` (`controller.schema.json#/$defs/PrepareReady`, `{ "success": true, "session", "pending", "prompts", "permissions" }`)**: Proceed to Step 2.

## 2. Spawn Subagents, Ack & Verify Status

1. **Spawn all `PrepareReady.pending` probes concurrently**: Invoke one boxed subagent per `probe` in `pending`—using a fast mid-tier coding model (`sonnet` or `flash`) for standard probes (`rules`, `reuse`, `dead-code`) and the most capable model (`opus` or `pro`) for the `-context` probe—with workspace instruction files (`CLAUDE.md`, `GEMINI.md`) omitted, allowed tools set to `permissions[probe]` (`controller.schema.json#/$defs/ProbePermissions`), and prompt set verbatim to `prompts[probe]` (`controller.schema.json#/$defs/ProbePrompt`).
2. **Ack check (`45s` timer -> `controller.schema.json#/$defs/StatusCommand`)**: Schedule a one-shot timer (`DurationSeconds: 45`, `TimerCondition: "never"`). When the `45s` timer fires, run `<skill>/dist/bin/review-tool.mjs status <workdir>` (`ReviewStatus`, `controller.schema.json#/$defs/ReviewStatus`). If `ReviewStatus.submittedOutcome` is present, report `submittedOutcome` and `location` to the user and stop. Otherwise, terminate and re-spawn every probe in `ReviewStatus.unacknowledged` with its `prompts[probe]` and `permissions[probe]` verbatim.
3. **Review deadline from `ack` (`180s` reminder + `150s` kill)**:
   - As each probe subagent finishes, terminate any duplicate subagent for that probe (`manage_subagents` `kill`). Once all probes finish, cancel the active timer (`manage_task` `kill`) and proceed to step 4.
   - After the `45s` status check, schedule a one-shot reminder timer (`DurationSeconds: 180`, `TimerCondition: "never"`).
   - When the `180s` timer fires, run `<skill>/dist/bin/review-tool.mjs status <workdir>`, send every probe in `ReviewStatus.pending` the exact message `"3 minutes elapsed since ack (2 minutes remaining before the 5-minute deadline). Wrap up and submit your report immediately."` via `send_message`, and schedule the kill timer (`DurationSeconds: 150`, `TimerCondition: "never"`).
   - When the `150s` kill timer fires, terminate any remaining subagents (`manage_subagents` `kill`) and proceed to step 4.
4. **Verify final status (`controller.schema.json#/$defs/StatusCommand`)**:

   ```sh
   <skill>/dist/bin/review-tool.mjs status <workdir>
   ```

   - **When `ReviewStatus.submittedOutcome` is present**: Report `ReviewStatus.submittedOutcome` (`controller.schema.json#/$defs/Outcome`) and `ReviewStatus.location` to the user and stop.
   - **When `ReviewStatus.pending` is non-empty**: Re-spawn subagents only for `ReviewStatus.pending` following steps 1–4 (up to **2 retries**). If `ReviewStatus.pending` remains non-empty after 2 retries, report `ReviewStatus.pending` to the user and stop.
