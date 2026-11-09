---

name: pr-review
description: Reviews a GitHub or Azure DevOps pull request, or a change in a plain git repository, against the thruput-io rules bundled with this skill (published at https://thruput.se/agents/), and posts one review with inline comments on the correct lines. Probes every rule in boxed subagents via controllers, so the reviewing agent never decides a verdict, cites each violation by rule and published URL, and groups comments into one review where the host allows. Use when the user gives a PR URL or asks for a rules-driven PR review.
compatibility: Requires node and tar. GitHub needs gh; Azure DevOps needs az with the azure-devops extension and git; a plain repository needs git. Network access to raw.githubusercontent.com/ciembor/agent-rules-books.
---

# PR Review Instructions

`<skill>` below is the directory containing this `SKILL.md`. Do not read `.ts` source files or write inline `node -e` scripts; run the two controller CLIs directly.

## Operating Boundaries

- **Do not pre-examine inputs before calling `prepare`.** Pass `<url>` and `<workdir>` directly to `controller.ts prepare` without first inspecting the pull request, diff, repository files, or rules. Only inspect, adjust, or test `<workdir>` or `<url>` (with `git`, `gh`, or `az`) if `prepare` fails and you need to diagnose the problem.
- **Do not read or modify review artifacts in `<workdir>`.** Files written inside `<workdir>` and its sibling `ledger` directory are managed exclusively by the controllers.
- **Do not evaluate rules, decide verdicts, or author review comments in the main agent.** Spawn one boxed subagent per pending probe; each subagent uses `sub-agent-controller.ts` to inspect its probe and report rows.

## 1. Main Agent — Prepare

1. Choose an empty workspace directory `<workdir>` suited to your environment and run:

   ```sh
   node <skill>/scripts/domain/controller.ts prepare <url> <workdir> [<token>]
   ```

   Omit `<token>` unless a token was explicitly provided.
2. Handle the JSON output:
   - **`{ "success": false, "error": { "kind": "invalid-target" | "invalid-workdir" | "invalid-token", ... } }`**: Diagnose and fix `<workdir>` or `<url>`, then run `prepare` again.
   - **`{ "success": false, "error": { "kind": "host-error", "host", "status", "reason" } }`**: If access was rejected (`403`, `401`, or `203`) and no `<token>` was passed yet, you may—if permitted by your assigned permissions and instructions—pass `<token>` to `prepare <url> <workdir> <token>`; otherwise report `host`, `status`, and `reason` to the user and stop.
   - **`{ "success": false, "error": { "kind": "refused" | "too-large" | "already-reviewed", ... } }`**: Report the refusal or status message to the user and stop.
   - **`{ "success": true, "pending": [...] }`**: Proceed immediately to Step 2.

## 2. Main Agent — Spawn Subagents & Dispatch

1. Spawn one subagent per probe `<name>` in `pending` concurrently (using your subagent tool), handing each subagent `<skill>`, `<workdir>`, and its single `<name>`, with instructions to run Step 3.
2. Once the subagents finish, submit (or check remaining probes) by running:

   ```sh
   node <skill>/scripts/domain/controller.ts dispatch <workdir> [<token>]
   ```
3. Handle the JSON output:
   - **`{ "kind": "submitted", "outcome", "location" }`**: Report `outcome` and `location` to the user and stop.
   - **`{ "kind": "pending", "remaining": [...] }`**: Re-spawn subagents only for `remaining` and run `dispatch` again (up to **2 retries**). If still `"pending"` after 2 retries, stop and report `remaining` to the user.

## 3. Boxed Subagent — Inspect & Report

1. Run `inspect` for your assigned `<probe>`:

   ```sh
   node <skill>/scripts/domain/sub-agent-controller.ts inspect <workdir> <probe>
   ```
2. Follow `instructions` and `task` in the JSON output: evaluate every assigned rule (or 3 rules from one selected ruleset for `99-context`, searching `snapshotDirectory` when `dead-code` or `reuse` requires it) and report your rows array:

   ```sh
   node <skill>/scripts/domain/sub-agent-controller.ts report <workdir> <probe> '<rows-json>'
   ```
3. If `report` outputs `{ "success": false, "error" }`, fix the reported validation error and run `report` again until `{ "success": true }` is returned.
