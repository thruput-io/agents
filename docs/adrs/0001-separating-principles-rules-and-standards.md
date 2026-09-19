# ADR 0001: Separating Principles, Rules, and Standards

## Date

2026-09-16

## Context

The previous handbook in `thruput-io/handbook` combined foundational values, hard invariants, and language-specific details into a single document (`RULES.md`). This caused several problems:
- **Mixed Abstraction:** High-level philosophy (*"code is a subset of the WHY"*) sat beside tool syntax (`set -euo pipefail`, `biome.json`).
- **Audit Friction:** Reviewers and automated agents need binary (Pass/Fail) criteria rather than narrative essays.
- **RFC 2119 Inversion:** Aspirational guidance (`SHOULD`) conflicted with structural mandates (`MUST`).
- **Technology Coupling:** Language-specific trivia made universal rules difficult to scale across tech stacks.

## Decision

Decouple engineering guidance in `thruput-io/agents` into three distinct tiers:

```
+-------------------------------------------------------------------+
|  1. PRINCIPLES (The "Why")                                        |
|  - Foundational values, quality definitions, trade-off models     |
|  - Non-enforceable: contains no RFC 2119 markers                  |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  2. RULES (The "What")                                            |
|  - Universal, language-agnostic invariants                        |
|  - Strict RFC 2119 markers (MUST, MUST NOT, PREFER) for CI/review |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  3. STANDARDS (The "How")                                         |
|  - Language- and ecosystem-specific implementations & presets     |
|  - One document/module per technology (e.g. TypeScript, Go, Bash) |
+-------------------------------------------------------------------+
```

### Tier Definitions & Terminology

1. **Principles (The "Why"):**
   - **Role:** Defines quality and the mindset for resolving trade-offs and ambiguity.
   - **Form:** Reasoned essays, trade-off matrices, mental models. No RFC 2119 markers.
   - **Rationale:** *"Principles"* anchors engineering values (e.g., SOLID) over academic *"Philosophy"* or bureaucratic *"Policy"*.

2. **Rules (The "What"):**
   - **Role:** Hard, universal architectural and coding constraints across all codebases.
   - **Form:** Concise RFC 2119 directives (`MUST`, `MUST NOT`, `PREFER`) for deterministic, binary evaluation.
   - **Rationale:** *"Rules"* provides unambiguous pass/fail boundaries for humans and automated agents.

3. **Standards (The "How"):**
   - **Role:** Concrete technical specifications, language idioms, and linter/compiler presets for a given tech stack.
   - **Form:** Modular files under `standards/` (e.g. `standards/typescript.md`, `standards/bash.md`).
   - **Rationale:** *"Standards"* captures authoritative ecosystem norms without diluting universal rules.

## Consequences

### Positive
- **Deterministic Auditing:** Automated agents and reviewers evaluate code against concise, unambiguous rules.
- **Modular Scalability:** New languages or tools are supported by adding files in `standards/` without altering core rules.
- **Clear Escalation:** `PRINCIPLES.md` provides explicit reasoning when resolving edge cases not settled by a rule.

### Negative
- Guidance is distributed across three tiers rather than in a single file, requiring clear cross-references.
