# Fixture D: Blind Taxonomy Specialization & Stopping-Boundary Test

Below are 18 unlabelled `uql` statements drawn from a single governance corpus, with all tier labels (`Value`, `Axiom`, `Rationale`, `Principle`, `Rule`, `Standard`) and `parent:` pointers stripped and shuffled.

## Shuffled Unlabelled Statements

- **S1**: "`additionalProperties` is never `false` in a JSON Schema."
- **S2**: "Every piece of information is defined once."
- **S3**: "A schema accepts unknown properties at the boundary."
- **S4**: "Every activity occurs at the earliest point where it is possible."
- **S5**: "Software remains easy to maintain and extend."
- **S6**: "A producer emits its defined shape, and a consumer ignores unrecognized fields so contracts evolve independently."
- **S7**: "Disciplined engineering and rigorous automation produce sustainable speed without technical debt."
- **S8**: "Foreign models translate into internal domain types at boundary ports so the perimeter excludes invalid states."
- **S9**: "A command never appends `|| true` or `|| :` to suppress its exit status in Bash."
- **S10**: "Duplicate representations of authoritative knowledge diverge over time, so secondary artifacts derive from one authoritative representation."
- **S11**: "Every domain concept has one representation in the codebase."
- **S12**: "A program terminates immediately upon encountering an unexpected state rather than continuing with corrupt state."
- **S13**: "A boundary parses external data into an Encapsulated Type before domain logic executes."
- **S14**: "A script or command never suppresses a non-zero exit status."
- **S15**: "A Domain Method never accepts a Foreign Shape as a parameter."
- **S16**: "A program fails immediately when an unexpected error occurs."
- **S17**: "An Encapsulated Type in TypeScript never uses `any`, `unknown`, `object`, or `Record<string, unknown>` in its signature."
- **S18**: "Production Code contains no duplicated business logic."

## Tasks (Using Only `docs/rfcs/0001-ubiquitous-language.md`)

1. **Reconstruct Specialization Chains (`parent`)**: Using `uql` domain narrowing (where child `s₂` narrows the `Subject`, `Adverbial`, or `Predicate` domain of parent `s₁`), group S1–S18 into specialization chains from root to leaf.
2. **Test Axiom Independence (Invariant 3 — `UQL005`)**: Identify the root/near-root axiomatic truths among S1–S18 and verify whether any axiom is logically entailed by the others.
3. **Identify Stopping Boundaries**: For each leaf statement, classify whether it stops at:
   - **Agent-Testable Boundary (`Rule`)**: Evaluable on a code diff without naming a specific programming language/tool, or
   - **Static-Analysis Hard Stop (`Standard`)**: Names a concrete language/schema/tool (`JSON Schema`, `Bash`, `TypeScript`) enforceable by a deterministic linter (e.g., Semgrep) in milliseconds.
