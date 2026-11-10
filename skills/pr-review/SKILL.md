---

name: pr-review
description: Reviews a GitHub or Azure DevOps pull request, or a change in a plain git repository, against the thruput-io rules bundled with this skill (published at https://thruput.se/agents/), and posts one review with inline comments on the correct lines. Probes every rule in boxed subagents via controllers, so the reviewing agent never decides a verdict, cites each violation by rule and published URL, and groups comments into one review where the host allows. Use when the user gives a PR URL or asks for a rules-driven PR review.
compatibility: Requires node and tar. GitHub needs gh; Azure DevOps needs az with the azure-devops extension and git; a plain repository needs git. Network access to raw.githubusercontent.com/ciembor/agent-rules-books.
---

# PR Review Instructions

`<skill>` below is the directory containing this `SKILL.md`. Do not read `.ts` source files or write inline `node -e` scripts; run the two controller CLIs directly (pass `-h` or `--help` to either controller CLI for usage and schema help).

## Operating Boundaries

- **Do not pre-examine inputs before calling `prepare`.** Pass `<url>` and `<workdir>` directly to `controller.ts prepare` without first inspecting the pull request, diff, repository files, or rules. Only inspect, adjust, or test `<workdir>` or `<url>` (with `git`, `gh`, or `az`) if `prepare` fails and you need to diagnose the problem.
- **Do not read or modify review artifacts in `<workdir>`, and never expose `<workdir>` to subagents.** Files written inside `<workdir>` and its sibling `ledger` directory are managed exclusively by the controllers. Subagents receive only the opaque `<session>` token returned by `prepare` and have no tools to write to disk.
- **Do not author, alter, or relay subagent instructions, evaluate rules, decide verdicts, or invoke `sub-agent-controller.ts` in the main agent.** Spawn one boxed subagent per pending probe with a **5-minute deadline**, passing only `<skill>`, `<session>`, and `<name>`; each subagent obtains its immutable schema-locked `instructions`, `task`, and `permissions` directly from `sub-agent-controller.ts inspect`.

## 1. Main Agent — Prepare

1. Choose an empty canonical (non-symlinked) workspace directory `<workdir>` suited to your environment and run:

   ```sh
   node <skill>/scripts/domain/controller.ts prepare <url> <workdir> [<token>]
   ```

   Omit `<token>` unless a token was explicitly provided. `prepare` immediately writes to `<workdir>` and its sibling `ledger` directory to verify both are operational and warns if `<workdir>` traverses a symlink.
2. Handle the JSON output:
   - **`{ "success": false, "error": { "kind": "invalid-target" | "invalid-workdir" | "invalid-token", ... } }`**: Diagnose and fix `<workdir>` or `<url>`, then run `prepare` again.
   - **`{ "success": false, "error": { "kind": "host-error", "host", "status", "reason" } }`**: If access was rejected (`403`, `401`, or `203`) and no `<token>` was passed yet, you may—if permitted by your assigned permissions and instructions—pass `<token>` to `prepare <url> <workdir> <token>`; otherwise report `host`, `status`, and `reason` to the user and stop.
   - **`{ "success": false, "error": { "kind": "refused" | "too-large" | "already-reviewed", ... } }`**: Report the refusal or status message to the user and stop.
   - **`{ "success": true, "session": "<session>", "pending": [...] }`**: Proceed immediately to Step 2.

## 2. Main Agent — Spawn Subagents & Dispatch

1. Spawn one subagent per probe `<name>` in `pending` concurrently (using your subagent tool with a **5-minute / 300,000 ms deadline**), handing each subagent **only** `<skill>`, `<session>`, and its single `<name>` (to run Step 3). Never pass `<workdir>` and never add or alter instructions for the subagent.
2. Once the subagents finish (or reach the 5-minute deadline), submit (or check remaining probes) by running:

   ```sh
   node <skill>/scripts/domain/controller.ts dispatch <workdir> [<token>]
   ```
3. Handle the JSON output:
   - **`{ "kind": "submitted", "outcome", "location" }`**: Report `outcome` and `location` to the user and stop.
   - **`{ "kind": "pending", "remaining": [...] }`**: Re-spawn subagents only for `remaining` (with a 5-minute deadline) and run `dispatch` again (up to **2 retries**). If still `"pending"` after 2 retries, stop and report `remaining` to the user.

## 3. Boxed Subagent — Inspect, Acknowledge & Report

1. You have no tools to write to disk; the only way to write is via `sub-agent-controller.ts`. Run `inspect` and `ack` for your assigned `<probe>` using `<session>` (pass `-h` for command and row schema help):

   ```sh
   node <skill>/scripts/domain/sub-agent-controller.ts inspect <session> <probe>
   node <skill>/scripts/domain/sub-agent-controller.ts ack <session> <probe>
   ```
2. Follow **only** `instructions`, `task`, and `permissions` in the `inspect` JSON output within the **5-minute deadline**: use only the tools listed in `permissions` (which define your task boundaries), evaluate every assigned rule (or 3 rules from one selected ruleset for `99-context`), anchor surface violations using `{ "idToReportViolationOn": <number>, "text": "<text>" }` copied from `surface` fragments (`context` fragments have no IDs and cannot be reported on), and report your rows array:

   ```sh
   node <skill>/scripts/domain/sub-agent-controller.ts report <session> <probe> '<rows-json>'
   ```
3. If `report` outputs `{ "success": false, "error" }`, fix the reported validation error and run `report` again until `{ "success": true }` is returned.
