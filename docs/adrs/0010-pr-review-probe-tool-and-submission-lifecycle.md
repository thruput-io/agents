# ADR 0010: PR Review Probe Tool and Submission Lifecycle

## Date

2026-11-19

## Context

Returning instructions, change metadata, surface overview, rules, and principles in a single command output exceeds tool
truncation limits and forces probe subagents to parse a monolithic payload before they can acknowledge their assignment.
Requiring the main agent to trigger review submission after probes finish exposes the ledger lifecycle to the
orchestrator, while prescribing unauthenticated-first preparation forces an avoidable failure on private hosts. Shipping
source code inside the installed skill directory exposes implementation internals to agents, and duplicating schema
contracts or instruction prose in hand-written code or static types per probe kind causes drift across boundaries.

## Decisions

1. **JSON Schema Draft 2020-12 is the single source of truth for contracts and instructions**:
   - Domain shapes and `const` instructions, tasks, permissions, and deadlines live directly on the schema properties of
     the objects that cross boundaries.
   - Probe kind is data, not a hierarchy of static instruction or ledger types; schemas define domain data types while
     leaving `const` instruction literals inline on their object properties.
   - CLI help emits the Draft 2020-12 JSON Schema directly from the generated command schema so the contract itself
     instructs the caller without hand-maintained usage wrappers.

2. **Codegen is hands-off and Zod owns all boundary validation and transformation**:
   - Internal domain schemas and external host OpenAPI specifications compile into Zod schemas and typed clients without
     manual edits.
   - Every boundary—CLI arguments and responses, persisted session state, and external host payloads—parses and
     transforms through Zod schemas and codecs, folds foreign shapes into domain types at the adapter perimeter, and
     populates `const` defaults when parsing parent objects.

3. **The probe CLI is an on-demand paging and lookup tool, never a monolithic dump**:
   - Each subcommand returns a bounded response strictly under 9 KB.
   - Probes fetch task instructions, rule pages, changed file pages, and external rulebook pages through separate,
     focused subcommands rather than a single combined payload.
   - Term lookup is an on-demand tool for resolving unfamiliar bracketed `[[Term]]`s, never a mandatory step for every
     term or unbracketed phrase.
   - Task instructions state affirmative investigation strategies for the probe's role in plain English without
     repeating schemas or lecturing on non-goals.

4. **Acknowledgment fails fast before inspection and timers run in code**:
   - A probe begins by running help and acknowledgment to prove it can execute the probe CLI, read the JSON Schema
     contract, verify the bootstrap prompt, and start the reporting deadline before inspecting review data.
   - Acknowledgment takes only the session and probe identifiers without fragile shell-quoting payloads.
   - Acknowledgment and reporting deadline thresholds live as schema data on the status command and probe objects, and
     the status command tracks them in code rather than delegating timer scheduling to the orchestrating agent.

5. **The final probe report submits the review to the host in code**:
   - When the last pending probe records a valid slice, the probe tool merges the ledger and submits the review to the
     host directly so the orchestrating agent cannot alter or delay the outcome.

6. **Authenticated and unauthenticated preparation are neutral choices**:
   - Preparation with or without a token is a neutral choice made up front by the main agent based on the target host
     and operator-governed credentials.

7. **The installed skill ships only runtime artifacts and isolates filesystem state**:
   - Source code, build scripts, and compiler or linter configuration live outside the shipped skill directory, and
     plugin setup checks out only runtime directories so agents face minimal distraction.
   - All filesystem operations live in the filesystem adapter, and session preparation cleans only its own managed
     subdirectories inside the working directory.
