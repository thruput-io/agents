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
   - Domain shapes and `const` instructions, permissions, and deadlines live directly on the schema properties of
     the objects that cross boundaries, with probe `instructions` expressed as a single `Prose` field and no internal
     probe `kind` or separate `task` field exposed to the subagent.
   - Probe variants are data, not a hierarchy of static instruction or ledger types; schemas define domain data types
     while leaving `const` instruction literals inline on their object properties.
   - CLI help emits the Draft 2020-12 JSON Schema directly from the generated command schema so the contract itself
     instructs the caller without hand-maintained usage wrappers.

2. **Codegen is hands-off and Zod owns all boundary validation and transformation**:
   - Internal domain schemas and external host OpenAPI specifications compile into Zod schemas and typed clients without
     manual edits.
   - Every boundary—CLI arguments and responses, persisted session state, and external host payloads—parses and
     transforms through Zod schemas and codecs, folds foreign shapes into domain types at the adapter perimeter, and
     populates `const` defaults when parsing parent objects.

3. **The probe CLI exposes small, targeted commands and pages only code changes and external rulebooks**:
   - Probes operate through six small, targeted commands: `instructions` (fetch probe instructions), `ack`
     (acknowledge instructions with a small JSON object), `rules` (fetch the probe's rules or external rulebook pages),
     `next` / `prev` (browse changed files and their surrounding context one file page at a time), `define` (on-demand
     lookup for unfamiliar bracketed `[[Term]]`s), and `report` (submit verdict rows).
   - Instructions state affirmative investigation strategies for the probe's role in plain English without repeating
     schemas or lecturing on non-goals.

4. **Acknowledgment verifies CLI JSON submission up front and timers run in code**:
   - A probe begins by running `instructions`, which ends by asking the probe to call `ack` with a small JSON object
     described the same way `report` is described—verifying up front that the subagent can invoke the tool, read its
     instructions, and submit valid JSON on the command line before starting the reporting deadline.
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
