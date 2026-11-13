# 8. Skills Are Portable, Contract-Driven, and Environment-Independent

Date: 2026-04-13

## Status

Accepted

## Context

This repository authors and publishes skills for AI coding agents under `skills/` (following the open [Agent Skills specification](https://agentskills.io/specification)). Across agent harnesses—Claude Code, OpenAI Codex CLI, Gemini CLI, GitHub Copilot, Cursor, OpenCode, and Antigravity—a skill directory is discovered by its `SKILL.md` frontmatter (`name`, `description`, `compatibility`) and loaded progressively: metadata at startup, `SKILL.md` instructions on activation, and `scripts/`, `references/`, and `schemas/` on demand.

Early iterations of skill development exposed five recurring failure modes:

1. **Machine-specific and local-path coupling**: Instructions or scripts that reference operator-specific credential wrappers, host paths, or local git checkouts break portability when the skill is installed into another developer's or CI agent's environment.
2. **Duplicate representations and ad-hoc parsing**: Defining shapes separately in JSON Schema, TypeScript interfaces, and CLI help strings creates drift (`[[No second representation]]`). Validating internal objects repeatedly inside domain logic instead of parsing once at the `[[Perimeter]]` obscures whether types or schemas are out of step.
3. **Hand-rolled HTTP clients**: Writing ad-hoc `fetch` wrappers for vendor REST APIs duplicates vendor contracts and drifts from upstream request and response shapes.
4. **Prompt stuffing and bloated payloads**: Passing repeated prose or full duplicated objects to subagents wastes context tokens and increases instruction-following mistakes (`[[Contextrot]]`).
5. **Grey verification**: Testing a skill by reading local filesystem repositories or mocking internal functions rather than exercising the CLI entrypoints and generated vendor HTTP clients through black-box network boundaries fails to prove that the shipped skill works in production.

## Decision

Every skill under `skills/` is designed, built, and verified as a portable, contract-driven component governed by five rules:

1. **JSON Schema 2020-12 is the single source of truth for contracts**:
   - Every domain concept, CLI command argument, and CLI return payload is defined in JSON Schema (Draft 2020-12) under `schemas/`, using `$ref`, `$defs`, and `$dynamicRef` / `$dynamicAnchor` without duplicating definitions across files (`[[Shapes live in the contract]]`, `[[No second representation]]`).
   - TypeScript types and Zod schemas (`contracts.g.ts`) are generated from the JSON Schemas during the build (`generate-contracts.ts`) and never committed (`[[No committing generated code]]`). Any type error between generated types and domain code indicates a defect in either the schema or the code.
2. **Parse with Zod at boundaries only**:
   - Inputs crossing a `[[Perimeter]]`—CLI arguments, persisted files, and external API payloads—are parsed once using generated Zod schemas or codecs (`[[Parse, don't validate]]`, `[[Fold at Perimeter]]`).
   - Inside the domain, code operates on the generated TypeScript types and `[[Domain object]]`s without re-parsing internal values.
3. **Vendor REST APIs are specified in OpenAPI 3.1.0 and called through generated clients**:
   - External host REST APIs sit in OpenAPI 3.1.0 specifications under `schemas/` and are compiled into typed HTTP clients (`clients.g.ts`) via Orval during the build.
   - Domain adapters invoke the generated clients and fold vendor responses into our domain model via codecs.
4. **Compact, ID-referenced payloads and progressive disclosure**:
   - `SKILL.md` is a concise operational contract for the main agent that points to `schemas/` for data shapes rather than repeating them in prose.
   - Subagents receive compact, single-line JSON and report back using stable identifiers (`[[Id]]`) rather than copying full objects or source text, minimizing token consumption and copy errors.
5. **Environment independence and Test Pyramid verification**:
   - Neither `SKILL.md` nor any skill script may reference machine-specific credential helpers, local user paths, or undocumented host services.
   - Every skill is verified across the `[[Test Pyramid]]`: JSON Schema metaschema and instance validation (`@sourcemeta/jsonschema`), static analysis (`knip`, `biome`, `tsc --noEmit`), unit tests of domain logic, and black-box integration tests (`msw/node` intercepting the generated HTTP clients against real commit archives) wired into `./build.sh`.

## Consequences

- **Positive**: Skills run identically across any Agent Skills-compatible CLI or IDE without local machine assumptions.
- **Positive**: Schema drift between documentation, CLI argument parsing, and TypeScript code becomes a compile-time or build-time failure.
- **Positive**: Token usage across main agents and subagents is minimized by compact JSON output and ID-based references.
- **Negative**: Adding or changing a boundary shape requires updating the JSON Schema or OpenAPI specification first and regenerating contracts via `./build.sh`.
