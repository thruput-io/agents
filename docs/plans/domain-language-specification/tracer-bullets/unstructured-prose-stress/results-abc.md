# Ubiquitous Language (`uql`) Single-Pass Transformation Results: Fixtures A, B, and C

This report documents the single-pass execution of the 5-step `uql` algorithm specified in [RFC 0001: Ubiquitous Language (`uql`)](file:///Users/Shared/workspace/agents2/docs/rfcs/0001-ubiquitous-language.md) on the three stress-test fixtures:
1. `fixture-a-babble-essay.md` (unstructured prose with conversational babble, inline links, and verbatim quotes)
2. `fixture-b-seeded-ambiguity.md` (lexical, anaphoric, and attachment ambiguities: `UQL001`–`UQL004`)
3. `fixture-c-seeded-contradiction.md` (contradictions, redundancies, and non-minimal constituents: `UQL005`–`UQL007`)

---

## 1. Fixture A (`fixture-a-babble-essay.md`)

### 1.1 Stripped Sentences and Constituents (`UQL005` & `UQL006`)

| Source Paragraph / Sentence | Extracted Content / Diagnostic Code | Rationale under RFC 0001 Invariant Rules |
|---|---|---|
| **Paragraph 1, Sentence 1**:<br>`"In modern software engineering, it goes without saying that domain boundaries are really very important for teams that want to build great systems over a long period of time."` | Stripped as `UQL006` (`NonMinimalConstituent`) and `UQL005` (`RedundantStatement`) | Contains conversational framing ("In modern software engineering", "it goes without saying that") and vacuous value judgment ("really very important for teams that want to build great systems over a long period of time"). Fails Invariant 3: does not narrow the domain state space; `(S \ {s}) ∪ D ⊭ s` fails because the statement asserts no domain constraint. |
| **Paragraph 1, Sentence 2**:<br>`"As Alistair Cockburn famously wrote in [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/), 'Allow an application to equally be driven by users, programs, automated test or batch script, and to be developed and tested in isolation from its eventual run-time devices and databases.'"` | Moved to `## References` (Step 1); attribution stripped as `UQL006` | Inline URL and verbatim quote extracted per Step 1 into `[Hexagonal Architecture]: https://alistair.cockburn.us/hexagonal-architecture/ "..."`. Attributive rhetorical clause ("As Alistair Cockburn famously wrote in...") stripped as non-narrowing constituent (`UQL006`). |
| **Paragraph 1, Sentence 3**:<br>`"Basically, what this means in practice is that an application should always be able to run its tests without needing a real database or external network service."` | Stripped as `UQL006` (`NonMinimalConstituent`) and `UQL005` (`RedundantStatement`) | Conversational explanation of a quote ("Basically, what this means in practice is that..."), modal imperative ("should always be able to..."), and mentions terms ("database", "external network service") that are neither in the domain glossary `D` nor part of the perimeter specification. |
| **Paragraph 2, Sentence 1**:<br>`"When we talk about a Perimeter, a Perimeter is the boundary where an application meets the outside world."` | Prefatory clause stripped as `UQL006`; main clause stripped as `UQL005` | "When we talk about a Perimeter," is conversational filler (`UQL006`). The main clause merely restates the glossary definition of `Perimeter` in `D` ("Boundary where an application interacts with external systems"). Entailed by `D`; fails Invariant 3 (`(S \ {s}) ∪ D ⊭ s`). |
| **Paragraph 2, Sentence 2**:<br>`"Every external payload arriving at the Perimeter must be parsed into a Domain Object by a Factory before any Domain Method executes."` | **Retained and rewritten** (Steps 3 & 4) | Core domain rule. Rewritten from modal passive to present-tense declarative statement over glossary terms (`Factory`, `Foreign Shape`, `Perimeter`, `Domain Object`, `Domain Method`): *"A Factory parses every Foreign Shape at the Perimeter into a Domain Object before any Domain Method executes."* |
| **Paragraph 2, Sentence 3**:<br>`"In other words, you should never pass unparsed Foreign Shapes into a Domain Method, because Foreign Shapes belong only at the Perimeter and must be translated into a Domain Object by a Factory first."` | Stripped as `UQL005` (`RedundantStatement`) and `UQL006` (`NonMinimalConstituent`) | "In other words," and "because Foreign Shapes belong only at the Perimeter and must be translated into a Domain Object by a Factory first" are non-minimal explanatory discourse (`UQL006`). The remaining imperative is the exact logical contrapositive of Sentence 2 (`(S \ {s}) ∪ D ⊨ s`) and is redundant (`UQL005`). |
| **Paragraph 2, Sentence 4**:<br>`"Furthermore, as Alexis King explained in [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/), 'Whenever possible, prefer functions that parse data into a more precise representation over functions that merely validate it and return unit or a boolean.'"` | Moved to `## References` (Step 1); attribution stripped as `UQL006` | Inline URL and quote extracted per Step 1 into `[Parse, don't validate]: https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/ "..."`. Attributive intro ("Furthermore, as Alexis King explained in...") stripped as non-narrowing (`UQL006`). |
| **Paragraph 3, Sentence 1**:<br>`"Additionally, every Domain Object is Immutable after creation."` | Filler stripped (`UQL006`); **core rule retained** | "Additionally," is a discourse connective (`UQL006`). "after creation" is non-narrowing (`UQL006`) because `Immutable` is defined in `D` as "Unchanging in state after construction". Retained as present-tense declarative statement: *"Every Domain Object is Immutable."* |
| **Paragraph 3, Sentence 2**:<br>`"Because a Domain Object is Immutable after creation, a Domain Object never exposes a Setter that mutates its fields in place."` | Stripped as `UQL006` and `UQL005` | "Because a Domain Object is Immutable after creation," is redundant causal justification (`UQL006`). "that mutates its fields in place" is redundant with the definition of `Setter` in `D` ("Method that mutates the state of an instance after construction") (`UQL006`). Finally, the proposition is logically entailed by Invariant 3 (`Every Domain Object is Immutable` ∧ `Setter mutates state after construction` ⊨ `Domain Object exposes no Setter`); hence stripped as `UQL005`. *(Note: If preserved as an explicit structural design invariant, it reduces to: "No Domain Object exposes a Setter.")* |

---

### 1.2 Final `uql` Output

```markdown
# Architecture at the Perimeter

A Factory parses every Foreign Shape at the Perimeter into a Domain Object before any Domain Method executes.

Every Domain Object is Immutable.

## References

[Hexagonal Architecture]: https://alistair.cockburn.us/hexagonal-architecture/ "Alistair Cockburn: Allow an application to equally be driven by users, programs, automated test or batch script, and to be developed and tested in isolation from its eventual run-time devices and databases."
[Parse, don't validate]: https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/ "Alexis King: Whenever possible, prefer functions that parse data into a more precise representation over functions that merely validate it and return unit or a boolean."
```

*(Note: If the entailed structural constraint on `Setter` is retained, the body includes `No Domain Object exposes a Setter.`, increasing the body byte count by 36 bytes).*

---

### 1.3 Exact Byte Count and Reduction Statistics

| Measurement Scope | Byte Count | Byte Reduction vs. Input Prose (1,567 B) |
|---|---|---|
| **Input Prose (3 essay paragraphs, lines 3, 5, 7)** | **1,567 bytes** | 0.00% |
| Input Prose Section (paragraphs + blank lines, lines 3–7) | 1,569 bytes | — |
| Entire Fixture A Input File (including Title and Glossary) | 2,512 bytes | — |
| **Output `uql` Body Statements (minimal canonical)** | **145 bytes** | **90.75% reduction** |
| Output `uql` Body with Heading | 178 bytes | 88.64% reduction |
| Output `uql` Body with Entailed Setter Statement (`No Domain Object exposes a Setter.`) | 181 bytes | 88.45% reduction |
| Output `uql` Body + Heading + Entailed Setter Statement | 214 bytes | 86.34% reduction |
| Output `uql` References Block (`## References` + citations) | 568 bytes | — |
| **Full Output `uql` Document (Heading + Minimal Body + References)** | **746 bytes** | **52.39% reduction** |

---

## 2. Fixture B (`fixture-b-seeded-ambiguity.md`)

Each of the seeded sentences in Fixture B was evaluated against Invariant 1 (Well-Definedness: $|R(w)| = 1 \land |A(p)| = 1 \land |T(s)| = 1$) and Step 4–5 rules.

### Sentence 1
> `Every Adapter translates a Contract at the Perimeter.`

- **Diagnostic Code**: `UQL002` (`AmbiguousTerm`)
- **Span**: `"Contract"`
- **Candidates**:
  1. `BoundedContextA.Contract` (`https://example.org/context-a/glossary.json`): *"Schema specification governing message structure."*
  2. `BoundedContextB.Contract` (`https://example.org/context-b/glossary.json`): *"Legal service-level agreement between organizations."*
  - Mathematical condition: $|R(\text{"Contract"})| = 2 > 1$.
- **Resolution**:
  - **Using Ordered `References`**: Add an explicit link reference in `## References`:
    ```markdown
    [Contract]: https://example.org/context-a/glossary.json#Contract
    ```
    or establish precedence in $\Sigma = \langle V_1, \dots, V_k \rangle$ by listing `[BoundedContextA]` before `[BoundedContextB]`.
  - **Using Aliasing/Rewriting**: Disambiguate at the reference level without body brackets via:
    ```markdown
    [Schema Contract]: https://example.org/context-a/glossary.json#Contract
    ```
    and rewrite Sentence 1 as: *"Every Adapter translates a Schema Contract at the Perimeter."*

---

### Sentence 2
> `When a Producer sends a Message to a Consumer, it validates the Signature before delivery.`

- **Diagnostic 1 (Anaphora)**:
  - **Diagnostic Code**: `UQL003` (`AmbiguousPronoun`)
  - **Span**: `"it"`
  - **Candidates / Antecedents**:
    1. `"Producer"` (singular neuter/3rd-person noun term)
    2. `"Message"` (singular neuter/3rd-person noun term)
    3. `"Consumer"` (singular neuter/3rd-person noun term)
    - Mathematical condition: $|A(\text{"it"})| = 3 > 1$ under DRT anaphora resolution.
  - **Resolution**: Replace the pronoun with its intended antecedent noun phrase:
    - *"When a Producer sends a Message to a Consumer, the Producer validates the Signature before delivery."* (or *"the Consumer validates the Signature..."*).
- **Diagnostic 2 (Lexical)**:
  - **Diagnostic Code**: `UQL001` (`UndefinedTerm`)
  - **Span**: `"delivery"`
  - **Candidates**: None. $|R(\text{"delivery"})| = 0$ (unmapped in local glossary $D$ and reference scope $\Sigma$).
  - **Resolution**: Declare `delivery` in $D$ (`noun`, forms: `delivery`, definition: *"Transmission of a Message to a Consumer"*), or rewrite using defined vocabulary:
    - *"When a Producer sends a Message to a Consumer, the Producer validates the Signature."*

---

### Sentence 3
> `The Factory parses the Payload from the Client with a Schema.`

- **Diagnostic Code**: `UQL004` (`AmbiguousAttachment`)
- **Span**: `"with a Schema"`
- **Candidates (Syntactic Parse Trees)**:
  1. **Tree 1 (Right Association per ACE)**: Attaches the prepositional phrase `with a Schema` to the nearest preceding noun term `"Client"`:
     `[NP the Client [PP with a Schema]]` $\rightarrow$ The Client possesses or provides a Schema.
  2. **Tree 2 (Predicate Adverbial)**: Attaches `with a Schema` to the predicate verb `"parses"`:
     `[VP parses [NP the Payload] [PP from the Client] [PP with a Schema]]` $\rightarrow$ The Factory utilizes a Schema as the instrument to parse the Payload.
  - Mathematical condition: $|T(s)| = 2 > 1$.
- **Resolution**: Apply §3 ISO EBNF fronted adverbial syntax (`[ Adverbial, "," ], Clause`):
  - *"With a Schema, the Factory parses the Payload from the Client."*
  - Alternatively rewrite: *"The Factory parses the Payload from the Client by using a Schema."*

---

### Sentence 4
> `Every Widget serializes its state through a Codec.`

- **Diagnostic 1**:
  - **Diagnostic Code**: `UQL001` (`UndefinedTerm`)
  - **Span**: `"Widget"`
  - **Candidates**: None. $|R(\text{"Widget"})| = 0$.
  - **Resolution**: Declare `Widget` in $D$ or replace with an existing defined domain term (e.g., `Domain Object` or `Payload`).
- **Diagnostic 2**:
  - **Diagnostic Code**: `UQL001` (`UndefinedTerm`)
  - **Span**: `"state"`
  - **Candidates**: None. $|R(\text{"state"})| = 0$.
  - **Resolution**: Declare `state` in $D$ or rewrite using defined terms (e.g., *"Every Domain Object serializes into a Payload through a Codec."*).
- *(Note on `"its"`: Because `"Widget"` is undefined, antecedent binding $|A(\text{"its"})|$ cascades into an error state `?AmbiguousPronoun(its, {?Term(Widget)})`).*

---

## 3. Fixture C (`fixture-c-seeded-contradiction.md`)

Each sentence in Fixture C was evaluated against Invariant 3 (Independence & Minimality) and Invariant 4 (Satisfiability: $S \cup D \not\models \bot$).

### Sentence 1
> `Every Unit Test executes in memory without Calls Over The Network.`

- **Diagnostic Code**: `UQL005` (`RedundantStatement`)
- **Span**: `"Every Unit Test executes in memory without Calls Over The Network."`
- **Mathematical Invariant Violation**:
  - Invariant 3 (Independence): $\forall s \in S : (S \setminus \{s\}) \cup D \not\models s$.
  - In Glossary $D$, `Unit Test` is defined as: *"Automated test that verifies a single unit in memory without Calls Over The Network."*
  - Therefore, $D \models \forall x \in \text{Unit Test} : \text{ExecutesInMemory}(x) \land \neg\text{ExecutesWithCallsOverTheNetwork}(x)$.
  - $(S \setminus \{S_1\}) \cup D \models S_1$. Sentence 1 is entailed directly by $D$ and lacks independence.

---

### Sentence 2
> `When a Unit Test verifies an External Dependency, the Unit Test executes Calls Over The Network.`

- **Diagnostic Code**: `UQL007` (`Contradiction`)
- **Span**: `"When a Unit Test verifies an External Dependency, the Unit Test executes Calls Over The Network."`
- **Mathematical Invariant Violation**:
  - Invariant 4 (Satisfiability): $S \cup D \not\models \bot$.
  - Overlapping subject domain with contradictory predicates:
    - Definition in $D$ (and $S_1$, $S_3$): $\forall x \in \text{Unit Test} : \neg\text{Executes}(x, \text{CallsOverTheNetwork})$.
    - Sentence $S_2$: $\exists x \in \text{Unit Test} : \text{Verifies}(x, \text{ExternalDependency}) \implies \text{Executes}(x, \text{CallsOverTheNetwork})$.
    - Whenever $\text{Verifies}(x, \text{ExternalDependency})$ is satisfied, $x$ must simultaneously satisfy $\text{Executes}(x, \text{CallsOverTheNetwork}) \land \neg\text{Executes}(x, \text{CallsOverTheNetwork}) \equiv \bot$.
    - The conjunction $S \cup D \models \bot$. $\{D, S_2\}$ and $\{S_1, S_2\}$ form unsatisfiable cores.

---

### Sentence 3
> `No Unit Test performs Calls Over The Network during execution.`

- **Diagnostic 1**:
  - **Diagnostic Code**: `UQL005` (`RedundantStatement`)
  - **Span**: `"No Unit Test performs Calls Over The Network during execution."`
  - **Mathematical Invariant Violation**:
    - Invariant 3 (Independence): $\forall s \in S : (S \setminus \{s\}) \cup D \not\models s$.
    - Logically equivalent to the definition of `Unit Test` in $D$ and $S_1$: $(S \setminus \{S_3\}) \cup D \models S_3$.
- **Diagnostic 2**:
  - **Diagnostic Code**: `UQL006` (`NonMinimalConstituent`)
  - **Span**: `"during execution"`
  - **Mathematical Invariant Violation**:
    - Invariant 3 (Minimality): $\forall c \in s : \text{truth}(s \setminus \{c\}) \neq \text{truth}(s)$.
    - Performing calls by a test is inherently an execution-time activity; removing `"during execution"` leaves $\text{truth}(s \setminus \{c\}) = \text{truth}(s)$.
- *(Note: Sentence 3 also forms an unsatisfiable contradiction core with Sentence 2: $\{S_2, S_3\} \models \bot$ under `UQL007`).*

---

### Sentence 4
> `Every Domain Object in any software repository is Immutable after construction.`

- **Diagnostic Code**: `UQL006` (`NonMinimalConstituent`)
- **Spans**:
  1. Span 1: `"in any software repository"`
  2. Span 2: `"after construction"`
- **Mathematical Invariant Violations**:
  - Invariant 3 (Minimality): $\forall c \in s : \text{truth}(s \setminus \{c\}) \neq \text{truth}(s)$.
  - **Span 1 (`"in any software repository"`)**: Quantifying over arbitrary software repositories does not narrow the domain of `Domain Object` in bounded context $D$. The constituent is non-narrowing filler: $\text{truth}(s \setminus \{\text{"in any software repository"}\}) = \text{truth}(s)$.
  - **Span 2 (`"after construction"`)**: Glossary $D$ defines `Immutable` as *"Unchanging in state after construction"*. Appending `"after construction"` to the copula predicate repeats the definition of the adjective term without narrowing: $\text{truth}(s \setminus \{\text{"after construction"}\}) = \text{truth}(s)$.
- **Minimal Canonical Form**: *"Every Domain Object is Immutable."*

---

### Sentences 5 & 6
> **Sentence 5**: `During a Maintenance Window, a Retry Policy retries a Failed Request.`
> **Sentence 6**: `A Retry Policy never retries a Failed Request.`

- **Diagnostic Code**: `UQL007` (`Contradiction`)
- **Span**: Sentences 5 and 6 (joint contradiction pair).
- **Mathematical Invariant Violation**:
  - Invariant 4 (Satisfiability): $S \cup D \not\models \bot$.
  - Sentence 6 establishes a universal negative across all states and times:
    $$\forall p \in \text{RetryPolicy}, \forall r \in \text{FailedRequest} : \neg\text{Retries}(p, r)$$
  - Sentence 5 establishes an affirmative execution under non-empty condition `Maintenance Window`:
    $$\text{During}(\text{MaintenanceWindow}) \implies \forall p \in \text{RetryPolicy}, \forall r \in \text{FailedRequest} : \text{Retries}(p, r)$$
  - In any state where $\text{During}(\text{MaintenanceWindow})$ holds, we have $\text{Retries}(p, r) \land \neg\text{Retries}(p, r) \equiv \bot$.
  - The statement set $\{S_5, S_6\}$ is unsatisfiable in SMT-LIB; both statements are flagged with `UQL007`.
