# Research: Prior-Art & "Reinvented the Wheel" Audit for `uql`

## 1. Established Standards That Solve Parts of This Problem

| `uql` Mechanism | Established Prior Art |
|---|---|
| Partitioning tokens into **Closed-Class Function Words** vs. **Open-Class Content Words** (`Noun`, `MainVerb`, `Adjective`, `Adverb`) | **Attempto Controlled English (ACE)** & **PENG** (Fuchs & Schwitter, 1996–2013): Predefine a fixed closed-class function word lexicon and require all open-class content words to be declared in a domain lexicon. |
| Declarative present-tense sentences mapped deterministically to First-Order Logic ($\forall x \in S : C(x) \implies P(x, O)$) | **ACE $\to$ DRS $\to$ FOL**: Translates declarative present-tense English deterministically into Discourse Representation Structures (DRS) and First-Order Logic. |
| Consistency (`No Contradiction`) and Redundancy (`Logical Independence` / `No Babble`) checking via theorem proving | **ACE RACE (Reasoning in Attempto Controlled English)** & **NASA FRET + Z3**: RACE proves consistency and detects logical redundancy over ACE axioms; NASA FRET compiles structured English into logic and uses **Z3 SMT** (`get-unsat-core`) to isolate minimal conflicting subsets of requirements. |
| Separating noun terms, relational verbs (*Fact Types*), and rules across imported vocabulary namespaces | **OMG SBVR (Semantics of Business Vocabulary and Business Rules, v1.5)**: Defines *Noun Concepts* (`Term`), *Verb Concepts* / *Fact Types* (`Subject + Verb + Object`), *Vocabulary Namespaces* (imported with aliasing), and *SBVR Structured English*. |
| Replacing modal `MUST`/`SHOULD` markers with declarative present-tense invariants defining the legal state space | **Alloy (Jackson)**, **TLA+ (Lamport)**, **OMG SBVR** (*Alethic* vs. *Deontic* invariants), and **EARS (Mavin et al., Rolls-Royce 2009)** (`WHEN`/`WHILE`/`WHERE` precondition clauses). |
| Canonical `Term.id` + `forms: string[]` (inflections, abbreviations, acronyms) grounded to URIs | **W3C SKOS** (`skos:prefLabel`, `skos:altLabel`) & **W3C OntoLex-Lemon** (`ontolex:LexicalEntry`, `ontolex:canonicalForm`, `ontolex:otherForm`, `ontolex:writtenRep`). |
| One authoritative semantic definition projected into multiple surface formats (`uql-md`, `uql-json`, SMT-LIB) | **Grammatical Framework (GF, Aarne Ranta, 2004)**: Separates **Abstract Syntax** (typed semantic AST) from parallel **Concrete Syntaxes** (surface English, formal logic, JSON/schemas). |

---

## 2. Six Corrections to Avoid Looking Naive to Colleagues

1. **Deterministic Attachment (`Right Association`) Instead of Unconstrained Word Order**:
   - In computational linguistics, free constituent order with prepositional phrases is structurally ambiguous (PP-attachment). Cite **Attempto Controlled English (ACE) Deterministic Interpretation Rules** (*Right Association*, where a prepositional phrase or relative clause attaches to the nearest preceding noun phrase, while sentence-level `Adverbial` conditions are fronted or comma-delimited as in **EARS** `WHEN`/`WHERE`/`IF`).
2. **Anaphora Resolution Rule (`Discourse Representation Theory`)**:
   - Cite **Kamp & Reyle's DRT** and **ACE Anaphora Resolution**: a pronoun (`it`, `its`, `they`) resolves to the nearest accessible antecedent matching in number; if $\ge 2$ antecedents of the same number exist in the clause, the pronoun is rejected (`AmbiguousPronoun`) and must be replaced by the definite `Term` (`the Change`).
3. **Typed Relations (*SBVR Fact Types*) in Z3 Encoding**:
   - Cite **OMG SBVR**: nouns are unary predicates $T(x)$, while relational verbs (`states`, `contains`, `folds`, `validates`) form binary/n-ary **Fact Types** $P(x, y)$ connecting `Subject` sort $S$ and `Object` sort $O$.
4. **Alethic vs. Deontic Framing (Legal State Space)**:
   - Cite **Alloy / TLA+ / SBVR**: `uql` expresses deontic obligations as declarative invariants defining the **set of legal domain states/artifacts** ($\mathcal{M}$); an artifact complies iff it is a model of the theory ($\mathcal{M} \models \mathcal{S} \cup \mathcal{D}$), making any counterexample ($\mathcal{M} \not\models s_i$) a `Violation`.
5. **Lexical Grounding Terminology (`W3C SKOS` & `OntoLex-Lemon`)**:
   - Cite **W3C SKOS** and **OntoLex-Lemon**: `id` is the canonical lemma (`ontolex:canonicalForm` / `skos:prefLabel`), abbreviations/acronyms (`UQL`) are `skos:altLabel`, and inflected forms expanded into `*.g.schema.json` are `ontolex:otherForm`.
6. **Abstract vs. Concrete Syntax (`Grammatical Framework`)**:
   - Cite **Grammatical Framework (GF)**: the 5 invariants and AST define the **Abstract Syntax**, while `uql-md` (CommonMark), `uql-json` (JSON Schema Draft 2020-12), and SMT-LIB 2.6 are three **Concrete Syntaxes** of that single abstract syntax.

---

## 3. Why Existing Heavy Standards Failed in Developer Workflows (The Gap `uql` Fills)

| Standard | Why It Failed in Day-to-Day Git / LLM Workflows | How `uql` Solves It |
|---|---|---|
| **OMG SBVR** | Serialized as MOF/XMI XML for enterprise modeling tools; prefixes every rule with heavy boilerplate (*"It is obligatory that each..."*) and requires font styling (underlined terms, italic verbs) that breaks plain Markdown. | Uses plain CommonMark (`uql-md`) and JSON Schema 2020-12 (`uql-json`) with declarative present-tense clauses and zero visual markup in sentences. |
| **Attempto Controlled English (ACE)** | Requires a Prolog runtime (APE) and manual lexicon maintenance; has no native CommonMark link-reference or JSON Schema integration and was not designed for LLM context budgets. | Compiles `Term` inflections into static `*.g.schema.json` at build time and offloads external URLs/quotes to CommonMark `## References` (`[Label]: <URI> "Quote"`) for lazy loading. |
| **W3C SKOS / OntoLex-Lemon / OWL** | Requires RDF triples, Turtle/OWL files, and SPARQL endpoints just to validate terminology in a repository. | Uses standard YAML/Markdown files validated by JSON Schema Draft 2020-12 (`anyOf` / `$ref`). |
| **EARS & NASA FRET** | Targets tick-by-tick real-time embedded control loops (Linear Temporal Logic / Lustre) via a standalone Electron GUI database without Bounded Context glossary closure. | Targets software architecture and code governance in Git, enforcing open-class lexical closure against `Definitions`. |
