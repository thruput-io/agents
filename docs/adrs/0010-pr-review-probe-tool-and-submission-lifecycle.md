# ADR 0010: PR Review Probe Tool and Submission Lifecycle

## Date

2026-11-19

## Context

Returning instructions, change metadata, surface overview, rules, and principles in a single command output exceeds tool
truncation limits and forces probe subagents to parse a monolithic payload before they can acknowledge their assignment.
Requiring the main agent to trigger review submission after probes finish exposes the ledger lifecycle to the
orchestrator, while prescribing unauthenticated-first preparation forces an avoidable failure on private hosts. Shipping
source code inside the installed skill directory exposes implementation internals to agents, and scattering validation,
hand-rolled classes, or path calculations outside schema contracts and single root definitions causes drift across
boundaries.

## Decisions

1. **JSON Schema Draft 2020-12 defines every interface, domain object, and perimeter API—the adapter layer included**:
   - Every interface, domain object, and perimeter API—the adapter layer included—is described in JSON Schema Draft
     2020-12.
   - Probe variants are distinguished by data invariants on their schema properties rather than by a static type tag or
     class hierarchy.
   - Every instruction and prompt handed to an agent or subagent carries fully resolved paths, session tokens, and probe
     identifiers with zero unfilled placeholders.
   - CLI help emits the Draft 2020-12 JSON Schema directly from the generated command schema so the contract itself
     instructs the caller.

2. **External input is parsed exclusively via `zod.parse`, API-to-domain conversion uses Zod codecs on API objects, and only controllers are classes**:
   - Internal schemas and external host OpenAPI specifications compile into Zod schemas and typed clients at build time
     without manual edits.
   - External input at every perimeter is parsed exclusively with `zod.parse` against generated schemas, and conversions
     between API objects and domain objects are defined exclusively as Zod codecs on the API objects, with zero
     non-codec parsing or validation code.
   - Only controllers are modeled as classes; all domain and adapter shapes are schema-defined data transformed by
     codecs.

3. **Build-time paths resolve from the project root and runtime paths resolve from a single-evaluated distribution root without symlinks**:
   - Build-time scripts resolve every path relative to the single project root environment variable, and runtime code
     resolves every path relative to a single distribution root evaluated once at startup, with no internal repository
     symlinks or directory-climbing searches.

4. **The probe CLI exposes small, targeted commands and pages only code changes and external rulebooks**:
   - Probes operate through targeted commands for instructions, acknowledgment, rules and external rulebook paging,
     changed-file paging, glossary lookup, and report submission, with affirmative investigation strategies stated in
     plain English.

5. **Acknowledgment verifies comprehension and JSON argument invocation up front, and timers run in code**:
   - A probe begins by fetching its instructions and acknowledging its assignment with a structured JSON argument on the
     command line—verifying up front that the subagent understands its instructions and can invoke the tool with valid
     JSON before its reporting deadline starts.
   - Acknowledgment and reporting deadline thresholds live as schema data and are tracked in code by the status command
     rather than by agent-scheduled timers.

6. **The final probe report submits the review to the host in code and fails fast on host errors**:
   - When the last pending probe records a valid slice, the probe tool merges the ledger and submits the review to the
     host directly; a failed host submission fails fast without exposing a completed review outcome.

7. **Authenticated and unauthenticated preparation are neutral choices**:
   - Preparation with or without a token is a neutral choice made up front by the main agent based on the target host
     and operator-governed credentials.

8. **Builds run only on GitHub, plugin installation copies pre-built release artifacts without sources, and integration tests verify the distributed layout**:
   - Compilation and bundling run only in GitHub workflows; plugin installation copies the pre-built release artifacts
     into place and checks out only runtime directories so no sources or build tools are shipped, and integration tests
     exercise the installed distribution layout against the built artifacts.
