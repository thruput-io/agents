# ADR 0001: Separating Principles, Rules, and Standards

## Status

Accepted

## Date

2026-09-16

## Context

The existing engineering handbook in `thruput-io/handbook` accumulated foundational values, enforceable constraints, and language-specific details into a single document (`RULES.md`). Over time, this caused several systemic problems:

1. **Mixed Levels of Abstraction:** Foundational worldview declarations (e.g., *"The code is a subset of the WHY"*), strict architectural invariants (e.g., *"Make illegal states unrepresentable"*), and language/tool specifics (e.g., `set -euo pipefail`, `@ts-ignore`, `biome.json`) sat side-by-side in the same document.
2. **Audit & Review Friction:** Code reviewers, automated agents, and CI probes need clear, testable, binary (Pass/Fail) criteria. Embedding narrative essays, conceptual analogies, and educational tables into rule files introduced ambiguity and debate during enforcement.
3. **RFC 2119 Semantic Inversions:** Blending aspirational guidance (`SHOULD`) with structural mandates (`MUST`) inside nested ladders caused unintended priority collisions where lower-level rungs overrode gating criteria.
4. **Technology Coupling:** Language-specific conventions and tool names cluttered what should have been universal engineering constraints, making the ruleset fragile as the technology stack expanded.

## Decision

We will refine and organize all engineering governance documents in the `agents` repository into three strictly decoupled tiers: **Principles**, **Rules**, and **Standards**.

```
+-------------------------------------------------------------------+
|  1. PRINCIPLES (The "Why")                                        |
|  - Engineering values, quality definitions, trade-off heuristics  |
|  - Mental models (e.g., Shift-Left, Simplicity Ladder)            |
|  - Non-enforceable via RFC 2119; provides reasoning & intent     |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  2. RULES (The "What")                                            |
|  - Universal, language-agnostic invariants                        |
|  - Strict RFC 2119 markers (MUST, MUST NOT, PREFER)               |
|  - Binary compliance: verifiable by humans, linters, and agents   |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  3. STANDARDS (The "How")                                         |
|  - Ecosystem-, language-, and framework-specific implementations  |
|  - Tool configs, language idioms, type patterns, shell flags      |
|  - Modular: one document/preset per technology domain             |
+-------------------------------------------------------------------+
```

### Terminology Selection Rationale

1. **Principles (over "Philosophy" or "Policy"):**
   - *"Policy"* often connotes administrative, HR, or security access compliance rather than engineering craftsmanship.
   - *"Philosophy"* can sound academic or purely theoretical to some engineers.
   - *"Principles"* firmly anchors foundational engineering values (akin to SOLID or Agile principles) while clearly signaling that it defines the mindset and decision criteria when resolving trade-offs.

2. **Rules (over "Directives" or "Invariants"):**
   - Universally understood in linters, CI, and code reviews.
   - Matches RFC 2119 requirement levels (`MUST`, `MUST NOT`, `PREFER`) for unambiguous, binary pass/fail verification.

3. **Standards (over "Recipes" or "Conventions"):**
   - Reflects authoritative technical specifications and established community benchmarks for specific languages, runtimes, and tools.
   - Clearly defines how the universal *Rules* are concretely implemented and verified in each specific ecosystem.

---

### Tier Definitions

#### 1. Principles (The "Why")
- **Purpose:** Establishes the shared definition of software quality, core values, and guiding defaults when resolving trade-offs or ambiguity.
- **Form:** Descriptive, reasoned essays, trade-off matrices, and mental models.
- **Constraint:** Contains **no** RFC 2119 markers (`MUST`, `SHOULD`, etc.). It explains the *reasoning* behind rules, not the mandate itself.

#### 2. Rules (The "What")
- **Purpose:** Defines hard, non-negotiable coding and architectural invariants that apply universally across all codebases and projects.
- **Form:** Pure, concise RFC 2119 requirements organized by domain layer (e.g., Domain Modeling, Architecture, Behavior, Testing, Quality Tooling).
- **Constraint:** Non-discursive, devoid of educational essays or tool-specific trivia. Every rule must be objectively auditable as a binary check.

#### 3. Standards (The "How")
- **Purpose:** Specifies exact implementation patterns, idiomatic translations, tool presets, and configurations for specific languages, runtimes, and platforms (e.g., TypeScript, Go, C#, Bash, Docker).
- **Form:** Concrete syntax examples, linting presets, and prescriptive snippets showing *how* to satisfy the universal rules in a particular tech stack.
- **Constraint:** Scoped strictly to the relevant ecosystem without redefining core rules or philosophical rationale.

---

## Consequences

### Positive
- **Deterministic Agent & Review Verification:** Automated agents and human reviewers can evaluate code against `RULES.md` with unambiguous pass/fail boundaries.
- **Maintainable & Scalable Governance:** Adding support for a new programming language or tool requires only adding a new standard in `standards/`, leaving the core rules and principles untouched.
- **Clear Guidance on Conflict Resolution:** When developers or agents face an ambiguous edge case not covered by a rule, `PRINCIPLES.md` serves as the explicit reasoning framework.

### Negative / Trade-offs
- Governance is modularized across files/directories rather than a single monolithic document, requiring clear cross-referencing and indexing.
- Contributors must consult the appropriate tier depending on whether they seek intent (Principles), invariants (Rules), or syntax (Standards).
