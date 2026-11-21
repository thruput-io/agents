# Results D: Taxonomy Specialization & Stopping-Boundary Analysis

This report completes the three analysis tasks defined in [fixture-d-shuffled-taxonomy.md](file:///Users/Shared/workspace/agents2/docs/plans/domain-language-specification/tracer-bullets/unstructured-prose-stress/fixture-d-shuffled-taxonomy.md) using only the semantics, invariants, and diagnostic rules defined in [RFC 0001: Ubiquitous Language (`uql`)](file:///Users/Shared/workspace/agents2/docs/rfcs/0001-ubiquitous-language.md).

---

## 1. Statement Inventory & Taxonomic Tier Classification

The 18 unlabelled statements map onto the 6 governance tiers (`Value` $\to$ `Axiom` $\to$ `Rationale` $\to$ `Principle` $\to$ `Rule` $\to$ `Standard`):

| ID | Unlabelled Statement | Tier | Scope / Role |
|---|---|---|---|
| **S1** | "`additionalProperties` is never `false` in a JSON Schema." | **Standard** | JSON Schema tool-specific static analysis rule. |
| **S2** | "Every piece of information is defined once." | **Axiom** | Universal truth of Single Source of Truth / DRY. |
| **S3** | "A schema accepts unknown properties at the boundary." | **Rule / Principle** | Language-agnostic boundary schema rule (Tolerant Reader). |
| **S4** | "Every activity occurs at the earliest point where it is possible." | **Axiom** | Universal truth of Shift-Left / Earliest Execution. |
| **S5** | "Software remains easy to maintain and extend." | **Value** | Engineering virtue / Maintainability & Extensibility. |
| **S6** | "A producer emits its defined shape, and a consumer ignores unrecognized fields so contracts evolve independently." | **Rationale** | Causal rationale for independent evolution via Tolerant Reader. |
| **S7** | "Disciplined engineering and rigorous automation produce sustainable speed without technical debt." | **Value** | Engineering virtue / Sustainable Velocity & Automation. |
| **S8** | "Foreign models translate into internal domain types at boundary ports so the perimeter excludes invalid states." | **Rationale** | Causal rationale for boundary translation (Perimeter Defense). |
| **S9** | "A command never appends `|| true` or `|| :` to suppress its exit status in Bash." | **Standard** | Bash-specific linter pattern for exit status preservation. |
| **S10** | "Duplicate representations of authoritative knowledge diverge over time, so secondary artifacts derive from one authoritative representation." | **Rationale** | Causal rationale explaining why duplication causes divergence. |
| **S11** | "Every domain concept has one representation in the codebase." | **Principle** | Architectural guideline narrowing authoritative knowledge to code. |
| **S12** | "A program terminates immediately upon encountering an unexpected state rather than continuing with corrupt state." | **Rationale** | Causal rationale explaining why fail-fast prevents corruption. |
| **S13** | "A boundary parses external data into an Encapsulated Type before domain logic executes." | **Principle** | Architectural guideline establishing parse-at-boundary. |
| **S14** | "A script or command never suppresses a non-zero exit status." | **Rule** | Agent-testable rule forbidding error suppression across CLI scripts. |
| **S15** | "A Domain Method never accepts a Foreign Shape as a parameter." | **Rule** | Agent-testable boundary rule for domain method parameter signatures. |
| **S16** | "A program fails immediately when an unexpected error occurs." | **Principle** | Architectural guideline specifying immediate program failure. |
| **S17** | "An Encapsulated Type in TypeScript never uses `any`, `unknown`, `object`, or `Record<string, unknown>` in its signature." | **Standard** | TypeScript-specific linter pattern enforcing type encapsulation. |
| **S18** | "Production Code contains no duplicated business logic." | **Rule** | Agent-testable rule prohibiting duplicated domain logic in PR diffs. |

---

## 2. Task 1: Reconstructed Specialization Chains (`parent`)

Under RFC 0001 §3 and §4, domain narrowing requires each child statement $s_{child}$ to strictly narrow the `Subject`, `Adverbial`, or `Predicate` domain of its parent $s_{parent}$:
$$\text{Domain}(s_{child}) \subset \text{Domain}(s_{parent})$$

The 18 statements assemble into three primary governance trees (with Tree 2 branching into two sub-hierarchies):

```
[Value S5] Software maintainability & extensibility
  │
  ├──► [Axiom S2] Information defined once
  │      └──► [Rationale S10] Duplicate knowledge diverges
  │             └──► [Principle S11] Domain concept has one representation in codebase
  │                    └──► [Rule S18] Production Code contains no duplicated business logic (LEAF)
  │
  └──► [Rationale S6] Producer emits shape, consumer ignores unknown fields
         └──► [Rule S3] Schema accepts unknown properties at boundary
                └──► [Standard S1] additionalProperties is never false in JSON Schema (LEAF)

[Value S7] Sustainable speed through disciplined engineering & automation
  │
  └──► [Axiom S4] Every activity occurs at the earliest point possible
         │
         ├──► [Rationale S12] Program terminates on unexpected state vs corrupt state
         │      └──► [Principle S16] Program fails immediately on unexpected error
         │             └──► [Rule S14] Script/command never suppresses non-zero exit status
         │                    └──► [Standard S9] Bash command never appends || true or || : (LEAF)
         │
         └──► [Rationale S8] Foreign models translate into internal domain types at boundary
                └──► [Principle S13] Boundary parses external data into Encapsulated Type
                       │
                       ├──► [Rule S15] Domain Method never accepts Foreign Shape (LEAF)
                       │
                       └──► [Standard S17] Encapsulated Type in TS never uses any/unknown (LEAF)
```

### Detailed Chain Narrowing Walkthrough

#### Chain 1: Single Source of Truth / Deduplication
- **S5 $\to$ S2**:
  - *Parent (S5)*: Declares high-level value: software maintainability and extensibility.
  - *Child (S2)*: Establishes foundational axiom: "Every piece of information is defined once." Narrowing: abstracts over all maintainability mechanisms to the invariant of informational uniqueness.
- **S2 $\to$ S10**:
  - *Parent (S2)*: Universal definition uniqueness across all domains.
  - *Child (S10)*: Narrows "information" to "authoritative knowledge" vs "secondary artifacts" and supplies the causal rationale ("diverge over time").
- **S10 $\to$ S11**:
  - *Parent (S10)*: Authoritative knowledge and secondary artifacts in general.
  - *Child (S11)*: Narrows domain to the "codebase" and subjects to "domain concepts".
- **S11 $\to$ S18**:
  - *Parent (S11)*: Codebase representations of all domain concepts.
  - *Child (S18)*: Narrows "codebase" to "Production Code" (excluding tests/tooling) and "domain concept" to "business logic" (excluding syntax/boilerplates).

#### Chain 2: Contract Evolution / Tolerant Reader
- **S5 $\to$ S6**:
  - *Parent (S5)*: Software extensibility.
  - *Child (S6)*: Narrows maintainability/extensibility to distributed producer-consumer contract evolution: "A producer emits its defined shape, and a consumer ignores unrecognized fields so contracts evolve independently."
- **S6 $\to$ S3**:
  - *Parent (S6)*: General consumer behavior regarding unrecognized fields.
  - *Child (S3)*: Narrows consumer behavior to explicit validation schemas: "A schema accepts unknown properties at the boundary."
- **S3 $\to$ S1**:
  - *Parent (S3)*: Generic boundary schemas across all serialization formats.
  - *Child (S1)*: Narrows to JSON Schema specifically: "`additionalProperties` is never `false` in a JSON Schema."

#### Chain 3: Early Failure / Exit Status Preservation (Fail-Fast)
- **S7 $\to$ S4**:
  - *Parent (S7)*: Disciplined engineering and sustainable speed without technical debt.
  - *Child (S4)*: Foundational axiom of Shift-Left: "Every activity occurs at the earliest point where it is possible."
- **S4 $\to$ S12**:
  - *Parent (S4)*: "Every activity" at the earliest possible point.
  - *Child (S12)*: Narrows "activity" to program termination and "earliest point" to immediate unexpected state detection: "A program terminates immediately upon encountering an unexpected state rather than continuing with corrupt state."
- **S12 $\to$ S16**:
  - *Parent (S12)*: Program termination vs corrupt state continuation.
  - *Child (S16)*: Narrows to actionable operational principle: "A program fails immediately when an unexpected error occurs."
- **S16 $\to$ S14**:
  - *Parent (S16)*: General program failure.
  - *Child (S14)*: Narrows "program" to "A script or command" and "fails" to preserving exit codes: "never suppresses a non-zero exit status."
- **S14 $\to$ S9**:
  - *Parent (S14)*: Any script or command exit status.
  - *Child (S9)*: Narrows to Bash shell syntax: "A command never appends `|| true` or `|| :` to suppress its exit status in Bash."

#### Chain 4: Boundary Validation / Encapsulated Types (Parse, Don't Validate)
- **S4 $\to$ S8**:
  - *Parent (S4)*: "Every activity occurs at the earliest point where it is possible."
  - *Child (S8)*: Narrows "activity" to validation/translation and "earliest point" to boundary ports: "Foreign models translate into internal domain types at boundary ports so the perimeter excludes invalid states."
- **S8 $\to$ S13**:
  - *Parent (S8)*: Perimeter exclusion via model translation.
  - *Child (S13)*: Narrows boundary translation to temporal sequencing before domain execution: "A boundary parses external data into an Encapsulated Type before domain logic executes."
- **S13 $\to$ S15**:
  - *Parent (S13)*: External data parsed before domain logic executes.
  - *Child (S15)*: Narrows domain logic to "A Domain Method" and forbids unparsed inputs: "A Domain Method never accepts a Foreign Shape as a parameter."
- **S13 $\to$ S17** (or **S15 $\to$ S17**):
  - *Parent (S13 / S15)*: Requirement that domain types be strictly encapsulated.
  - *Child (S17)*: Narrows "Encapsulated Type" to TypeScript and forbids escape hatches: "An Encapsulated Type in TypeScript never uses `any`, `unknown`, `object`, or `Record<string, unknown>` in its signature."

---

## 3. Task 2: Axiom Identification & Invariant 3 (`UQL005`) Independence Evaluation

### Identified Axiomatic Statements
Among S1–S18, two statements express root, universal, unconditional truths:
- **Axiom 1 (S2)**: *"Every piece of information is defined once."* (The Single-Source-of-Truth / Uniqueness Axiom)
- **Axiom 2 (S4)**: *"Every activity occurs at the earliest point where it is possible."* (The Shift-Left / Temporal Precedence Axiom)

*(Note: S5 and S7 express normative organizational Values/Goals rather than formal descriptive axioms of system behavior. S6, S8, S10, and S12 are Rationales explicitly qualified by causal "so" or comparative "rather than" clauses).*

### Logical Independence Evaluation (Invariant 3 — `UQL005`)
RFC 0001 §4 defines Invariant 3 (Independence & Minimality):
$$\forall s \in S : (S \setminus \{s\}) \cup D \not\models s$$
If any statement $s$ is entailed by the remaining statements, a `UQL005 RedundantStatement` diagnostic must be emitted.

#### Formal Proof of Mutual Independence:
1. **$S2 \not\models S4$**:
   - Let $\mathcal{M}_1$ be a system where every piece of information is defined exactly once (satisfying $S2$), but validation, error checking, and assertions are deferred to batch processing at the end of the day or suppressed during runtime (falsifying $S4$).
   - $\mathcal{M}_1 \models S2$ and $\mathcal{M}_1 \not\models S4$.
   - Therefore, $S4$ is not logically entailed by $S2$.

2. **$S4 \not\models S2$**:
   - Let $\mathcal{M}_2$ be a system where all actions (parsing, checks, error halting) occur at the earliest possible nanosecond (satisfying $S4$), but configuration parameters, domain models, and schemas are copy-pasted across 10 redundant files (falsifying $S2$).
   - $\mathcal{M}_2 \models S4$ and $\mathcal{M}_2 \not\models S2$.
   - Therefore, $S2$ is not logically entailed by $S4$.

3. **Evaluation across Values (S5, S7) and Rationales (S6, S8, S10, S12)**:
   - Neither $S2$ nor $S4$ can be derived from the general Value statements $S5$ ("Software remains easy to maintain and extend") or $S7$ ("Disciplined engineering... produce sustainable speed..."), because values define desired outcomes rather than operational axioms.
   - Neither $S2$ nor $S4$ is entailed by any combination of their downstream rationales or rules.

**Conclusion**: $S2$ and $S4$ form a minimal, independent axiomatic basis. **No `UQL005 RedundantStatement` diagnostic is emitted.**

---

## 4. Task 3: Stopping Boundary Classification & Intermediate Sublevels

Every specialization chain in a governance taxonomy terminates either at the **Agent-Testable Boundary (`Rule`)** or the **Static-Analysis Hard Stop (`Standard`)**.

### Classification of Leaf Statements

| Leaf ID | Statement Text | Stopping Boundary | Enforcement Mechanism |
|---|---|---|---|
| **S18** | "Production Code contains no duplicated business logic." | **Agent-Testable Boundary (`Rule`)** | **PR Code Diff / Agent Review**: Evaluable by an LLM agent or human reviewer inspecting a diff. Language-agnostic; cannot be resolved to a single AST regex or linter rule without human/semantic judgment of what constitutes "business logic". |
| **S15** | "A Domain Method never accepts a Foreign Shape as a parameter." | **Agent-Testable Boundary (`Rule`)** | **PR Code Diff / Agent Review**: Evaluable on diffs by verifying that domain entities/value objects do not accept transport DTOs or external shapes. Does not require a specific compiler tool. |
| **S1** | "`additionalProperties` is never `false` in a JSON Schema." | **Static-Analysis Hard Stop (`Standard`)** | **Deterministic Linter**: Targets `JSON Schema` directly. Lintable in $<5\text{ms}$ by a schema validator or AST query (e.g. `json-schema-linter`). |
| **S9** | "A command never appends `|| true` or `|| :` to suppress its exit status in Bash." | **Static-Analysis Hard Stop (`Standard`)** | **Deterministic Linter**: Targets `Bash` scripts directly. Enforceable in milliseconds via Semgrep/ShellCheck pattern matching `\|\|\s*(true|:)`. |
| **S17** | "An Encapsulated Type in TypeScript never uses `any`, `unknown`, `object`, or `Record<string, unknown>` in its signature." | **Static-Analysis Hard Stop (`Standard`)** | **Deterministic Linter**: Targets `TypeScript` specifically. Enforceable via ESLint rule `@typescript-eslint/no-explicit-any` / Semgrep AST rule. |

### Analysis of Intermediate Specialization Sublevels

1. **Full 5-Tier Canonical Depths**:
   - **Chain 1**: $S5 \to S2 \to S10 \to S11 \to S18$. Contains all intermediate tiers (Value $\to$ Axiom $\to$ Rationale $\to$ Principle $\to$ Rule) and halts cleanly at the **Agent-Testable Boundary (`Rule`)** because duplicated business logic cannot be reduced to a deterministic static analysis tool without language-specific AST contracts.
   - **Chain 3 (Fail-Fast)**: $S7 \to S4 \to S12 \to S16 \to S14 \to S9$. Contains all 6 tiers (Value $\to$ Axiom $\to$ Rationale $\to$ Principle $\to$ Rule $\to$ Standard). Here, $S14$ serves as the language-agnostic agent-testable rule, which is then lowered to the concrete static-analysis standard $S9$ for Bash.

2. **Compressed / Skipped Intermediate Sublevels**:
   - **Chain 2 (Tolerant Reader)**: $S5 \to S6 \to S3 \to S1$. 
     - Rationale $S6$ is bridged to Standard $S1$ via a single intermediate statement $S3$ ("A schema accepts unknown properties at the boundary").
     - $S3$ functions simultaneously as the general architectural Principle and the language-agnostic Rule before lowering directly into the JSON Schema Standard $S1$.
   - **Chain 4 (Boundary Parsing)**:
     - Principle $S13$ ("A boundary parses external data into an Encapsulated Type before domain logic executes") branches into two paths:
       1. **Semantic Path ($S13 \to S15$)**: Narrows into the Agent-Testable Rule $S15$ ("A Domain Method never accepts a Foreign Shape as a parameter") which stops at the agent boundary.
       2. **Syntactic/Tool Path ($S13 \to S17$ or $S15 \to S17$)**: Lowers directly into the TypeScript Standard $S17$. When viewed directly under $S13$, it skips an explicit intermediate language-agnostic rule regarding unconstrained type signatures, proceeding directly from Principle to concrete language Standard.
