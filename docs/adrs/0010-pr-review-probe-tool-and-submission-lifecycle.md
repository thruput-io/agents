# ADR 0010: PR Review Probe Tool and Submission Lifecycle

## Date

2026-11-19

## Context

Returning instructions, change metadata, surface overview, rules, and principles in a single command output exceeds tool
truncation limits and forces probe subagents to parse a monolithic payload before they can acknowledge their assignment.
Requiring the main agent to trigger review submission after probes finish exposes the ledger lifecycle to the
orchestrator, while prescribing unauthenticated-first preparation forces an avoidable failure on private hosts. Shipping
source code inside the installed skill directory exposes implementation internals to agents.

## Decisions

1. **The probe CLI is an on-demand paging and lookup tool, never a monolithic dump**:
   - Each subcommand returns a bounded response strictly under 9 KB.
   - Probes fetch task instructions, rule slices, changed file pages (`next` and `prev` and fast jumps), and external rulebooks
     (`ruleset`) through separate, focused subcommands rather than a single combined `inspect` payload. 
   - Term lookup (`define`) is an optional on-demand tool for resolving unfamiliar bracketed `[[Term]]`s, never a
     mandatory step for every term or unbracketed phrase.
   - Task instructions state concrete investigation strategies for the probe's role in plain English without repeating
     schemas or lecturing on non-goals.

2. **`ack` Fail fast, so report is not where misalignment surfaces **:
   - A probe begins by running `-h` and `ack` to prove it can execute the probe CLI, understands the CLI
     usage and JSON Schema contracts, verifies the bootstrap prompt, and starts the 5-minute deadline before inspecting
     review data.
   - `ack` accepts its input without fragile shell-quoting traps on rule identifiers or prompt text.

3. **The final probe `report` submits the review to the host in code**:
   - The main agent cannot alter the report in any way as it is biased.

4. **Authenticated and unauthenticated preparation are neutral choices**:
   - `prepare` with or without `<token>` is a neutral choice made up front by the main agent based on the target host
     and operator-governed credentials. The option to provide it must be clear without dictating any security related matters.
   - Authentication is local thing we cannot control

5. **The installed skill ships only runtime artifacts and minimum of distraction **:
   - Source code, build scripts, and compiler or linter configuration live outside the shipped skill directory so that
     installing the skill exposes only `SKILL.md`, runtime rule and schema data, and the standalone `.mjs` binaries. 
   - Agents must have minimal distraction
