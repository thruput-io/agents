# PRINCIPLES

This is the foundation for engineering governance: what we mean by software quality, how we reason about design, and why we work the way we do. [`RULES.md`](./RULES.md) translates these principles into enforceable requirements.

Nothing here is an RFC 2119 rule. There are no `MUST`, `MUST NOT`, or `SHOULD` markers in this document on purpose — requirements that can be verified during review belong in [`RULES.md`](./RULES.md). What lives here is the mindset and rationale those rules serve, and the defaults to apply when resolving ambiguity or trade-offs.

## Citation Convention

Each principle has a unique, memorable name. Cite a principle in PR reviews, discussions, and ADRs by name with its markdown heading slug:
- `[Quality Uncompromised](./PRINCIPLES.md#quality-uncompromised)`
- `[Convention Over Novelty](./PRINCIPLES.md#convention-over-novelty)`
- `[Shift Left](./PRINCIPLES.md#shift-left)`

---

## Summary of Named Principles

| Principle | Core Idea | Anchor |
| :--- | :--- | :--- |
| **[Quality Uncompromised](#quality-uncompromised)** | Software quality is the non-negotiable priority above speed or features. | `#quality-uncompromised` |
| **[Code Only for User Value](#code-only-for-user-value)** | Never write code without a clear purpose measured in user benefit. | `#code-only-for-user-value` |
| **[Code as a Subset of the WHY](#code-as-a-subset-of-the-why)** | Every line must trace to the stated purpose without reaching outside it. | `#code-as-a-subset-of-the-why` |
| **[The Simplicity Ladder](#the-simplicity-ladder)** | The simplest code is no code; climb from reuse to platform to dependencies. | `#the-simplicity-ladder` |
| **[Convention Over Novelty](#convention-over-novelty)** | Assemble novel solutions from recognizable, standard ecosystem parts. | `#convention-over-novelty` |
| **[Shift Left](#shift-left)** | Catch defects at the leftmost tier: types and compiler over tests and runtime. | `#shift-left` |
| **[Durable Intent Over Comments](#durable-intent-over-comments)** | Express intent through types, descriptive names, and tests, not comments. | `#durable-intent-over-comments` |
| **[Loud Failures Over Silent Defaults](#loud-failures-over-silent-defaults)** | Fail fast and explicitly; never convert errors into silent wrong answers. | `#loud-failures-over-silent-defaults` |

---

## Quality Uncompromised

Software quality is always the highest priority. There is no situation that justifies lowering quality in favor of other goals, because all other objectives become harder to reach once quality drops. Faster development, higher performance, and new features are frequently offered as justifications; none of them qualify.

### How Quality Is Measured

These axes define software quality. They characterize problem areas and frame discussions during design and review:

- **Correctness:** The software accurately delivers what users need.
- **Maintainability:** Changing a behavior requires understanding and touching only the component that owns it.
- **Readability:** A reader unfamiliar with the code understands what it does and why without asking the author.
- **Testability:** Behavior is exercised in isolation without standing up networks, clocks, or global state.
- **Simplicity:** The design carries no structure that a present requirement does not demand.
- **True Test Coverage:** Tests fail when behavior breaks, rather than merely executing code paths.
- **Ease of Doing the Right Thing:** The correct approach is the path of least resistance for the next contributor.
- **Guardrails Against Doing the Wrong Thing:** Types, tests, and tooling cause incorrect approaches to fail early at compile time rather than relying on human vigilance.
- **Automation:** The path between a change and its verified deployment runs without manual intervention.
- **Currency of Tools and Libraries:** Dependencies are current and easily kept that way.

### What Wins When Values Collide

When competing values clash, resolve them according to this hierarchy:

- **Correctness:** Correct *over* Extensive
- **Maintainability:** Maintainable *over* Performant
- **Readability:** Readable *over* Commented
- **Testability:** Testable *over* Clickable
- **Simplicity:** Simple *over* Popular
- **True Test Coverage:** Competence *over* Measurable
- **Ease of Doing the Right Thing:** Open/Closed *over* Optimal
- **Guardrails Against Doing the Wrong Thing:** Build Checks *over* Rule Documents
- **Automation:** Pipelines *over* Platform Documents
- **Currency of Tools and Libraries:** Small & Manageable *over* Feature-Rich

Finding the right-hand value in code is a symptom that the left-hand value needs attention. The solution belongs on the left side of the pair, not in more of the right.

### How Quality Is NOT Measured

Quality is not measured by convenience, cleverness, compactness, raw speed, or feature count. Performance and feature breadth are specific requirements like any other; they do not earn credit against maintainability, correctness, or simplicity.

---

## Code Only for User Value

Without a clear notion of **WHY** a piece of code is written, it should not be written at all. We never write code without a purpose, and that purpose is measured exclusively in the good it delivers to the users of the code.

---

## Code as a Subset of the WHY

The code is a **subset** of the stated **WHY**: every part of it solves some part of the WHY, and no part reaches outside it. 

- **Incremental Coverage:** A single change need not cover the entire WHY (which may take several incremental changes to satisfy), but what the code does solve, it solves accurately.
- **No Unintended Harm:** A solution must not introduce collateral effects or friction that consumers would find unacceptable.

---

## The Simplicity Ladder

The simplest code of all is **no code**. Next in simplicity is code we do not write ourselves.

When solving a problem, climb the simplicity ladder: take the highest rung that applies, and descend only when higher rungs offer nothing viable:

1. **Reuse Code in This Codebase:** Leverage or refactor existing components into reusable domain modules.
2. **Use What the Platform or Framework Provides:** Rely on built-in capabilities of the runtime or language.
3. **Use an External Dependency:** Adopt maintained third-party libraries.
4. **Use an External Tool or Service:** Integrate existing services rather than building equivalents.

### Gating Conditions
Every rung is gated by two criteria:
- **Available:** Avoid components that impose restrictive licensing, payment models, or heavy secondary frameworks that increase maintenance burden.
- **Maintained:** Adopt code only when it is stable, actively maintained by multiple contributors, well-documented, and backed by a healthy community.

---

## Convention Over Novelty

Code is maintained by developers who did not write it. Adhering to established ecosystem conventions makes this possible: a maintainer familiar with standard idioms should not have to learn custom idiosyncratic patterns.

- **Convention in Structure, Novelty in Solution:** Novelty belongs in the domain solution, assembled from standard parts and recognizable conventions.
- **Surrounding Context:** Where no universal industry standard decides an issue, consistency with surrounding codebase patterns becomes the baseline rather than introducing an alternative style.
- **Demonstrable Standards:** A standard is a published convention, a maintained framework, or a pattern actively used by a large community. Recalled habits from past experience do not qualify as standards.

---

## Shift Left

Bugs, invalid states, and regressions are caught earliest, cheapest, and with the greatest certainty when shifted as far left as possible:

| 1. Unrepresentable Illegal States | 2. Static Code Analysis | 3. Unit Tests | 4. Integration Tests | 5. E2E Tests |
| :--- | :--- | :--- | :--- | :--- |
| Invalid states cannot be constructed in the type system. | Compilers, typecheckers, and linters reject code before execution. | Isolated component behavior verified in-process without external dependencies. | Components exercised together against real adapters in local containers. | Fully deployed services exercised in running staging environments. |

A safeguard belongs at the leftmost rung capable of catching the error. Descend to runtime or testing rungs only when type-level or static prevention is impossible.

---

## Durable Intent Over Comments

Comments in source code are often symptoms of missing abstraction, weak naming, or deferred work. Information conveyed in comments belongs in durable, verifiable mechanisms:

- **Clarification:** Introduce intent-revealing variable names, extract focused functions, or write negative tests demonstrating why a naive approach failed.
- **Procrastination (TODOs):** Add a failing test pinning the weakness, split work into smaller production-ready changes, or write an explicit plan document.
- **Architectural Decisions:** Document in an Architectural Decision Record (ADR) under `docs/adrs/`.
- **Usage Guidance:** Document in `README.md` or user-facing documentation.
- **Apologies or Confessions:** Fix the underlying design flaw or pin the limitation with a failing test.

Comments are justified only when intended for machine consumption: shebangs, machine directives (such as SPDX license identifiers or file encoding headers), generated docstrings for public API sites, mandated license headers, or generated-file banners.

---

## Loud Failures Over Silent Defaults

Systems must fail loudly and immediately upon encountering an unexpected state. None of the following defensive habits constitutes valid practice:

- Appending `|| true` or `2>/dev/null` to discard command failures or diagnostics.
- Catching exceptions only to log them and proceed with degraded or assumed state.
- Substituting a fallback default value when required input is missing or malformed.
- Branching speculatively on unsupported platforms or environments.

Each of these converts a loud, diagnosable failure into a silent wrong answer. Safeguards must be added only when concrete evidence demonstrates the need, and failures must abort execution cleanly.
