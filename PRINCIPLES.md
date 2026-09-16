# PRINCIPLES

This is the foundation for engineering governance: what we mean by software quality, how we reason about design, and why we work the way we do. [`RULES.md`](./RULES.md) translates these principles into enforceable requirements.

Nothing here is an RFC 2119 rule. There are no `MUST`, `MUST NOT`, or `SHOULD` markers in this document on purpose — requirements that can be verified during review belong in [`RULES.md`](./RULES.md). What lives here is the mindset and rationale those rules serve, and the defaults to apply when resolving ambiguity or trade-offs.

---

## 1. Software Quality — What It Is

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

## 2. Purpose and Accuracy

Without a clear notion of **WHY** a piece of code is written, it should not be written at all. Code is written exclusively for the good it delivers to its users.

- **The Code as a Subset of the WHY:** Every part of the code solves some part of the stated WHY, and no part reaches outside it. A single change need not cover the entire WHY (which may take several incremental steps), but what it does solve, it solves accurately.
- **No Unintended Harm:** A solution must not introduce collateral effects or friction that consumers would find unacceptable.

---

## 3. Simplicity and the Ladder

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

## 4. Maintainability and Standards

Code is maintained by developers who did not write it. Adhering to established ecosystem conventions makes this possible: a maintainer familiar with standard idioms should not have to learn custom idiosyncratic patterns.

- **Convention Over Novelty:** Novelty belongs in the domain solution, assembled from standard parts and recognizable idioms.
- **Surrounding Context:** Where no universal industry standard decides an issue, consistency with surrounding codebase patterns becomes the baseline.
- **Demonstrable Standards:** A standard is a published convention, a maintained framework, or a pattern actively used by a large community. Recalled habits from past experience do not qualify as standards.

---

## 5. Shift Left

Bugs, invalid states, and regressions are caught earliest, cheapest, and with the greatest certainty when shifted as far left as possible:

| 1. Unrepresentable Illegal States | 2. Static Code Analysis | 3. Unit Tests | 4. Integration Tests | 5. E2E Tests |
| :--- | :--- | :--- | :--- | :--- |
| Invalid states cannot be constructed in the type system. | Compilers, typecheckers, and linters reject code before execution. | Isolated component behavior verified in-process without external dependencies. | Components exercised together against real adapters in local containers. | Fully deployed services exercised in running staging environments. |

A safeguard belongs at the leftmost rung capable of catching the error. Descend to runtime or testing rungs only when type-level or static prevention is impossible.

---

## 6. Why a Comment Is Not the Place

Comments in source code are often symptoms of missing abstraction, weak naming, or deferred work. Information conveyed in comments belongs in durable, verifiable mechanisms:

- **Clarification:** Introduce intent-revealing variable names, extract focused functions, or write negative tests demonstrating why a naive approach failed.
- **Procrastination (TODOs):** Add a failing test pinning the weakness, split work into smaller production-ready changes, or write an explicit plan document.
- **Architectural Decisions:** Document in an Architectural Decision Record (ADR) under `docs/adrs/`.
- **Usage Guidance:** Document in `README.md` or user-facing documentation.
- **Apologies or Confessions:** Fix the underlying design flaw or pin the limitation with a failing test.

Comments are justified only when intended for machine consumption: shebangs, machine directives (such as SPDX license identifiers or file encoding headers), generated docstrings for public API sites, mandated license headers, or generated-file banners.

---

## 7. Excuses That Don't Apply

These principles hold under all circumstances. None of the following constitutes valid grounds for bypassing quality:

- *"It is just test code or a mock, so strictness doesn't matter."*
- *"This is just a prototype; tests will be added later."*
- *"Following these guidelines would require a larger refactor."*
- *"I cannot find a way around this warning, so I will mute it."*
- *"The existing codebase does not follow these principles, so I don't need to either."*
- *"These defensive guards are standard habit, so I will add them just in case."* (Generalizing defensive habits—such as suppressing errors, swallowing exceptions, or defaulting on missing input—turns loud failures into silent bugs. Add safeguards only when concrete evidence demonstrates the need).
