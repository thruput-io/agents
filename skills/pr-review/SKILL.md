---

name: pr-review
description: Reviews a GitHub or Azure DevOps pull request, or a change in a plain git repository, against the thruput-io rules bundled with this skill (published at https://thruput.se/agents/), and posts one review with inline comments on the correct lines. Probes every rule in boxed subagents via controllers, so the reviewing agent never decides a verdict, cites each violation by rule and published URL, and groups comments into one review where the host allows. Use when the user gives a PR URL or asks for a rules-driven PR review.
compatibility: Requires node and tar. GitHub needs gh; Azure DevOps needs az with the azure-devops extension and git; a plain repository needs git. Network access to raw.githubusercontent.com/ciembor/agent-rules-books.
---

# PR Review Instructions

Operate `MainAgentController` (`scripts/domain/controller.ts`) as the orchestrating main agent and `SubAgentController` (`scripts/domain/sub-agent-controller.ts`) inside each boxed probe subagent.

## Operating Boundaries

- **Do not pre-examine inputs before calling `prepare`.** Pass `<url>` and `<workdir>` directly to `MainAgentController` without first inspecting the pull request, diff, repository files, or rules. Only inspect, adjust, or test `<workdir>` or `<url>` (with `git`, `gh`, or `az`) if `prepare` fails and you need to diagnose the problem.
- **Do not read or modify review artifacts in `<workdir>`.** Files written inside `<workdir>` and its sibling `ledger` directory exist only as a write-only audit log and are never read back to produce the review.
- **Do not evaluate rules, decide verdicts, or author review comments in the main agent.** Each subagent receives its boxed `SubAgentController` and reports rows via `controller.report(rows)`; when the last subagent reports valid rows, the review outcome is computed and submitted automatically.

## 1. Main Agent — Prepare

1. Instantiate the controller with `MainAgentController.withRunner(runner)` (or `MainAgentController.create()`).
2. Choose a workspace path `<workdir>` suited to your environment, wrap it with `Workdir.from(workdir)`, and call `controller.prepare(url, workdir)` with `<url>` (or, if a token was explicitly provided, wrap it with `AccessToken.from(rawToken)` from `scripts/domain/access-token.ts` and call `controller.prepareWithToken(url, workdir, token.data)`).
3. Handle the returned `PrepareResult`:
   - **`{ success: false, error: { kind: 'invalid-target', error } }`** (or `Workdir.from` / `AccessToken.from` failure): Diagnose the failure—fix `<workdir>`, normalize `<url>`, or test `<url>` with `git`, `gh`, or `az`—and call `prepare` or `prepareWithToken` again.
   - **`{ success: false, error: { kind: 'host-error', host, status, reason } }`**: If access was rejected (e.g. `403`, `401`, or `203`) and no token was explicitly passed yet, you may—if permitted by your assigned permissions and instructions—instantiate `AccessToken.from(rawToken)` and retry with `controller.prepareWithToken(url, workdir, token.data)`; otherwise report `host`, `status`, and `reason` to the user and stop.
   - **`{ success: false, error: { kind: 'refused' | 'too-large' | 'already-reviewed', ... } }`**: Report the refusal or status message to the user and stop.
   - **`{ success: true, data }`**: Proceed immediately to Step 2.

## 2. Main Agent — Dispatch

1. Call `controller.dispatch(workdir)` to run all pending probes (you may inspect read-only progress via `controller.ledger(workdir)`).
2. Handle the returned `DispatchResult`:
   - **`{ kind: 'submitted', outcome, ledger, location }`**: All probes reported and the review has been submitted. Report `outcome` and `location` to the user and stop.
   - **`{ kind: 'pending', remaining }`**: One or more probes timed out before reporting. Call `controller.dispatch(workdir)` again (up to **2 retries**) so only the `remaining` probes run. If still `'pending'` after 2 retries, stop and report `remaining` to the user.

## 3. Boxed Subagent — Probe & Report

Each subagent receives a `SubAgentController` instance (`sub`) and has no write access to the review outcome:

1. Read `sub.instructions()` (`prose()` and `task()`), `sub.change()` (`title` and `description`), `sub.codeUnderReview()` (`surface()`, `fragments()`, `threads()`, `host()`), `sub.rules()` (`rulebook` or `rulesets`), and `sub.workdir()` (when `reuse` or `dead-code` requires searching the snapshot at `sub.workdir().snapshotDirectory()`).
2. Evaluate every assigned rule (or 3 rules from one selected ruleset for `context`) and call `sub.report(rows)`.
3. If `sub.report(rows)` returns `{ success: false, error }`, fix the reported schema or surface-anchor validation error and call `sub.report(rows)` again until `{ success: true }` is returned.
