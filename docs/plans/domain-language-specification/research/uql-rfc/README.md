# RFC 0001: Ubiquitous Language (`uql`)

- **Feature Name**: `ubiquitous-language` (`uql`)
- **Status**: Draft
- **Start Date**: 2026-11-21
- **Normative References**: CommonMark 0.31.2, JSON Schema Draft 2020-12, ISO/IEC 14977 (EBNF), SMT-LIB 2.6

---

## Summary

Specify **Ubiquitous Language (`uql`)**, a controlled domain language that projects an independent axiomatic system (`Abstract Syntax`) onto CommonMark (`uql-md`), JSON Schema Draft 2020-12 (`uql-json`), and first-order logic (`SMT-LIB 2.6`).

---

## Motivation

Everything in software development boils down to communication, and the introduction of AI makes this unmistakable. Years are spent trying to make AI agents follow human intent, yet the enormous potential of productivity is reached only in brief glimpses because the blocker is communication.

When English passes back and forth between human and AI, we believe we are communicating, but it is faked: each side attaches private assumptions to the same words, and meaning is not conveyed. To describe good software engineering from bad—where good is deeply effective and bad is ineffective—English is not the language. We need a domain language where words carry explicit, shared meaning so that human and machine understand each other.

Practically, writing a statement in that domain language should work like writing code: every word is accounted for by the syntax, an unmapped word produces an error just like an undefined variable, and an IDE can suggest and verify defined terms from a symbol table. Before a parser, linter, or IDE can exist, the language itself must be specified—just as a programming language requires a specification before its tooling is built. This RFC specifies that language: **Ubiquitous Language (`uql`)**.

---

## Guide-level explanation

### 1. Declarative Legal-State Invariants

Following Alloy, TLA+, and Attempto Controlled English (ACE), `uql` defines the **legal state space** of a domain using present-tense indicative `Statement`s:

- *"Every `Withdrawal` references an `Account`."*
- *"A settled `Invoice` is `Immutable`."*
- *"An `Account` contains no negative `Balance`."*

A target artifact complies if and only if it satisfies all statements and definitions in scope; any counterexample where a statement does not hold is a `Violation`.

### 2. Before and After in `uql-md`

Before (`Prose` with babble, inline URLs, verbatim quotes, and modal imperatives):

```yaml
- id: Double-entry balance
  body: |
    Accounting is the measurement and communication of financial information. Every ledger entry must balance debits and credits ([Luca Pacioli](https://example.org/pacioli-1494)): "a person should not go to sleep at night until the debits equal the credits."
  solutions:
  - marker: SHOULD
    body: |
      Record both the debit account and credit account on every transfer.
```

After (`uql-md` — the redundant re-definition of accounting is removed, clauses are present-tense truths, and external citations/quotes move to `## References` via CommonMark §4.7 `[Label]: <URI> "Verbatim quote"`):

```markdown
# Double-entry balance

Every Ledger entry balances its Debit and Credit, as established in Summa de Arithmetica.

## Solutions

- Every Transfer records a Debit Account and a Credit Account.

## References

[Summa de Arithmetica]: https://example.org/pacioli-1494 "Luca Pacioli: A person should not go to sleep at night until the debits equal the credits."
[Definitions]: https://example.org/schemas/accounting-definitions.schema.json
```

---

## Reference-level explanation

### 1. Abstract Syntax and Concrete Syntaxes

Following Grammatical Framework (GF), `uql` separates its **Abstract Syntax** (the 5 invariants over the ordered reference scope `Σ`, definitions `D`, and statements `S`) from three **Concrete Syntaxes**:
1. **`uql-md`**: CommonMark documents with a bottom `## References` section.
2. **`uql-json`**: JSON/YAML documents validated by JSON Schema Draft 2020-12 (`contentMediaType: "text/markdown"`, `contentSchema`, and `anyOf`/`$ref`).
3. **`uql-smt2`**: SMT-LIB 2.6 first-order logic assertions checked by Z3.

- **`Prose`**: Ordinary Markdown text (`"type": "string", "minLength": 1, "contentMediaType": "text/markdown"`), used for verbatim quotes (`Reference.quote`) and transcripts.
- **`UbiquitousLanguage` (`uql`)**: Text conforming to §§2–7 below.

### 2. Lexical Specification and `Term` Grounding

Aligned with W3C SKOS and OntoLex-Lemon:
1. **`Term.id` (`skos:prefLabel` / `ontolex:canonicalForm`)**: Canonical lemma of a `Noun` concept, `Adjective` property, or `MainVerb` relation (*SBVR Fact Type*), unique within its Bounded Context after ASCII case-folding and whitespace normalization.
2. **`Term.forms` (`skos:altLabel` & `ontolex:otherForm`)**:
   - **In source (`Definitions.yaml`)**: Deterministic English inflection suffixes on the head word (`-s`, `-es`, `-ies` for plurals and 3rd-person singular verbs; `-ed`, `-ing` for participles) apply automatically; optional `forms: string[]` declares irregular forms or acronyms (`["UQL", "uql"]`).
   - **In the glossary data artifact (`glossary.g.json`)**: Every `Term` expands into its complete list of valid surface `forms` as data (validated by `ubiquitous-language.schema.json#/$defs/Glossary`).
3. **Tokenization and Maximal Munch**:
   - Backtick code spans (`inlineCode`) and fenced code blocks (`code`) are extracted first by the CommonMark AST parser as `CodeLiteral`s.
   - Over the remaining text tokens, `Term` matching uses case-insensitive **longest-match (maximal munch)** left-to-right.
   - Hyphenated compounds match as a single `Term` if declared in `forms`, or split on `-` into constituent tokens if undeclared.

### 3. Syntactic Specification (ISO/IEC 14977 EBNF & Parts of Speech)

| Partition | Enumerated Word Classes | Rule in `uql` |
|---|---|---|
| **Open Word Classes** | `Noun`, `MainVerb` (*Fact Type*), `Adjective`, `Adverb` | Every open-class word or phrase outside a `CodeLiteral` resolves to a **`Term`** in the active scope (`D ∪ Σ`). |
| **Closed Word Classes** | `Determiner`, `Preposition`, `Conjunction`, `Pronoun`, present-tense `Copula` / `AuxiliaryVerb`, `Negation` | Form the grammatical structure connecting `Term`s. |

```ebnf
Document        = { Paragraph } , [ ReferencesBlock ] ;
Paragraph       = Statement , { Statement } ;
Statement       = [ Adverbial , "," ] , Clause , { Conjunction , Clause } , "." ;
Clause          = Subject , Predicate , [ ObjectOrComp ] , { Adverbial }
                | Complement , "," , Subject , Copula ;
Subject         = NounPhrase ;
ObjectOrComp    = NounPhrase | AdjectiveTerm | CodeLiteral ;
Predicate       = Copula , [ Negation ]
                | [ AuxiliaryVerb , Negation ] , VerbTerm ;
Adverbial       = ( Preposition , NounPhrase )
                | ( SubConjunction , Clause ) ;
NounPhrase      = [ Determiner ] , { AdjectiveTerm } , ( NounTerm | Pronoun | CodeLiteral ) ,
                  { Preposition , NounPhrase } ;
ReferencesBlock = "## References" , { ReferenceDef } ;
ReferenceDef    = "[" , TermOrSourceId , "]:" , URI , [ '"' , ProseQuote , '"' ] ;
```

- **Deterministic Attachment (ACE Right Association)**: A `Preposition` phrase inside a `NounPhrase` attaches to the nearest preceding `Term`; a sentence-wide `Adverbial` is fronted before `,` or attached to the `Predicate`.
- **Deterministic Anaphora (DRT/ACE)**: A `Pronoun` (`it`, `its`, `they`, `their`, `which`, `that`) binds to the nearest preceding `Term` matching in grammatical number; if 2 or more preceding `Term`s in the `Statement` match in number, it fails with `UQL003 AmbiguousPronoun`.

### 4. Authoritative Semantics (Five Mathematical Invariants)

The semantics of `uql` are defined once by five invariants over the ordered reference scope `Σ = ⟨V₁, …, Vₖ⟩`, definitions `D`, and statements `S`:

| Invariant | Authoritative Mathematical Definition | Human-Readable Projection in `uql` |
|---|---|---|
| **1. Well-Definedness (`Unambiguity`)** | `\|R(w)\| = 1  ∧  \|A(p)\| = 1  ∧  \|T(s)\| = 1` | `\|R(w)\| = 0` is `UQL001 UndefinedTerm`; cardinality `> 1` is a `UQL002`–`UQL004 Ambiguity` lint error. |
| **2. Propositional Form (`Statement`)** | `∀x ∈ S : C(x) ⇒ P(x, O)` | Declarative present-tense clause of `≤ 35` words (`≤ 220` bytes) and `≤ 1` subordinate `Adverbial` clause. |
| **3. Independence & Minimality (`SSOT`)** | `∀s ∈ S : (S \ {s}) ∪ D ⊭ s  ∧  ∀c ∈ s : truth(s \ {c}) ≠ truth(s)` | No `Statement` re-explains a `Term` or another `Statement` (`UQL005`), and every constituent narrows when the `Statement` holds (`UQL006`). |
| **4. Satisfiability (`No Contradiction`)** | `S ∪ D ⊭ ⊥` | Overlapping `Subject`/`Adverbial` conditions with mutually exclusive `Predicate`s are a `UQL007 Contradiction` lint error. |
| **5. Finite Closure** | `\|V\| < ∞` in dependency graph `G = (V, E)`, terminating at `Σ` leaves or `V_root` | Reachability from any `Term` with a visited set terminates in `≤ \|V\|` steps. |

### 5. Ordered `References` and Bounded Context Disambiguation

A `uql` document resolves `Term`s against an ordered `References` list (`## References` in `uql-md`; `anyOf: [{ "$ref": "..." }]` in `uql-json`):
1. **Order decides precedence**: Lookup `R(w)` returns the first entry in `Σ` where `w ∈ forms(T)`.
2. **Disambiguation in `References`**: Placing `[Contract]: <external-uri>` above `[Definitions]` binds `Contract` to that context; binding `[Schema contract]: <external-uri>` lets a document refer to both contexts without brackets in the body text.

### 6. The 5-Step `uql` Rewriting, Parsing, and Linting Algorithm

When rewriting loose English prose into `uql`, the loose prose is discarded and replaced by the resulting `uql` text. When linting `uql`, the parser builds a `UqlAst` (`Statement`s, `Constituent`s, resolved `Term`s, and `References`) and checks Invariants 1–5 to emit `Diagnostics` (see [Appendix A](#appendix-a-error-recovery)):

1. **Extract Citations and Quotes**: Move every inline URL (`[label](https://...)`) and attributed verbatim quote out of the statement body into `## References` as `[Label]: <URI> "Author: Verbatim quote"`.
2. **Strip Babble (Invariant 3)**: Delete any clause or sentence already entailed by `D` or an earlier `Statement` (`UQL005`), and any constituent whose removal leaves the truth condition unchanged (`UQL006`).
3. **Form Declarative Present-Tense Clauses (Invariant 2)**: Drop external `marker:` fields (`MUST`, `MUST NOT`, `SHOULD`, `MAY`) and express each clause as a present-tense truth (`≤ 35` words) conforming to §3.2 EBNF.
4. **Resolve Open-Class Words to `Term`s (Invariant 1)**: Strip `[[...]]` brackets. Match every Open-Class span (`Noun`, `MainVerb`, `Adjective`, `Adverb`) outside `CodeLiteral`s against `D ∪ Σ`; if `|R(w)| = 0`, replace `w` with an existing synonym in `D`, declare `w` as a new `Term`, or emit `UQL001 UndefinedTerm(w)`.
5. **Lint Unambiguity and Satisfiability (Invariants 1 & 4)**: Emit `UQL002` if `|R(w)| > 1`, `UQL003` if `|A(p)| > 1`, `UQL004` if `|T(s)| > 1`, or `UQL007` if two `Statement`s have overlapping `Subject` + `Adverbial` domains and mutually exclusive `Predicate`s.

### 7. Conformance Levels and Complexity Budgets

1. **Level 1 (Lexical & Reference Closure)**: Enforces maximal-munch `Term` matching against `glossary.g.json` `forms` and `References` (`UQL001`, `UQL002`).
2. **Level 2 (Syntactic & Anaphora Unambiguity)**: Parses into `UqlAst` per §3.2 EBNF, enforcing the `≤ 35`-word `Statement` bound and DRT pronoun resolution (`UQL003`, `UQL004`).
3. **Level 3 (Logical Independence, Minimality & Satisfiability)**: Lowers `UqlAst` `Term`s to `(declare-fun T (Entity) Bool)` and *Fact Types* to `(declare-fun P (Entity Entity) Bool)` in Z3 SMT-LIB 2.6 (`UQL005`–`UQL007`).
4. **Budgets**: Normative core (§§1–7) `≤ 1,200` words (`≤ 8` KB); complete RFC `≤ 2,500` words (`≤ 18` KB).

---

## Drawbacks

- Authoring new statements requires declaring any new open-class noun, verb (*Fact Type*), or adjective as a `Term` (or binding it in `References`) before Level 1 verification passes.

---

## Rationale and alternatives

| Alternative | Why it was rejected |
|---|---|
| Keep `[[Id]]` wiki-links and regex alternations | Validates only bracketed substrings while leaving unbracketed English unmapped; corrupts code spans; forces duplicate plural definitions. |
| Require `[Term]` brackets around every `Term` in `uql` | Bracket markup around most words makes prose uncomfortable for humans to read and write. |
| Enumerate individual English glue words instead of Parts of Speech and EBNF | Word lists drift; pinning Parts of Speech, EBNF clause structure, and `Term` resolution keeps the specification finite. |
| Inline `[Contract][Context]` brackets inside sentences | Deferring disambiguation and aliasing to the bottom `References` section keeps the prose body 100% bracket-free. |

---

## Prior art

| Prior Art | What `uql` Adopts | Why Existing Tooling Did Not Fit Directly |
|---|---|---|
| **Domain-Driven Design (Evans, 2003)** | *Ubiquitous Language* and *Bounded Context* boundaries. | Informal prose practice with no formal grammar or compiler. |
| **Attempto Controlled English (ACE) & DRT** | Open/closed word split, present-tense FOL mapping, Right-Association, and DRT pronoun resolution. | Requires a Prolog runtime (APE), lacks CommonMark / JSON Schema bindings, and does not optimize LLM context budgets. |
| **OMG SBVR v1.5** | *Noun Concepts* (`Term`), *Fact Types* (`P(x, O)`), and vocabulary imports. | Serialized as MOF/XMI XML with modal prefixes and visual font styling. |
| **W3C SKOS & OntoLex-Lemon** | Canonical lemma (`id` / `skos:prefLabel`), acronyms (`skos:altLabel`), and inflected forms (`ontolex:otherForm`). | Requires RDF/Turtle/SPARQL infrastructure rather than static JSON Schema enums. |
| **Grammatical Framework (GF)** | Separation of one **Abstract Syntax** from multiple **Concrete Syntaxes** (`uql-md`, `uql-json`, `uql-smt2`). | Requires Haskell/GF grammars rather than CommonMark + JSON Schema. |
| **Alloy, TLA+, EARS & NASA FRET** | Declarative legal-state invariants, fronted conditions, and Z3 `unsat-core`. | FRET targets real-time temporal logic (`pmLTL`/Lustre) in an Electron database rather than repository governance. |

---

## Unresolved questions

None for the Level 1–3 specification; corpus-specific `Term`s are surfaced empirically when applying this RFC to a target domain corpus.

---

## Future possibilities

- Level 1–3 verification in `verify.sh`, automatic `<a href="#...">` link compilation in `build_site.sh`, on-demand `Reference` quote retrieval in `define`, and IDE autocomplete from `glossary.g.json`.

---

## Appendix A: Error Recovery

To continue past the first error instead of exiting immediately, each failure in Steps 2–5 inserts a placeholder node and appends to `Diagnostics`:

| Code & Diagnostic Kind | Invariant | Local Recovery (Placeholder Node) | Diagnostic Payload |
|---|---|---|---|
| `UQL001 UndefinedTerm` | Invariant 1 (`\|R(w)\| = 0`) | Bind span to `?Term(w)` | Unresolved span `w`, location, and closest candidate `Term`s in `D` |
| `UQL002 AmbiguousTerm` | Invariant 1 (`\|R(w)\| > 1`) | Bind span to `?AmbiguousTerm(w, candidates)` | Span `w` and competing `Term` URIs at the same precedence level |
| `UQL003 AmbiguousPronoun` | Invariant 1 (`\|A(p)\| > 1`) | Bind pronoun to `?AmbiguousPronoun(p, antecedents)` | Pronoun `p` and matching antecedent `Term`s in the `Statement` |
| `UQL004 AmbiguousAttachment` | Invariant 1 (`\|T(s)\| > 1`) | Keep right-associated tree | Modifier span and competing head constituents |
| `UQL005 RedundantStatement` | Invariant 3 (`(S \ {s}) ∪ D ⊨ s`) | Keep `s` marked as redundant | Statement `s` and the subset of `S ∪ D` that entails it |
| `UQL006 NonMinimalConstituent` | Invariant 3 (`truth(s \ {c}) = truth(s)`) | Keep `c` marked as non-narrowing | Constituent/modifier `c` whose removal leaves `truth(s)` unchanged |
| `UQL007 Contradiction` | Invariant 4 (`S ∪ D ⊨ ⊥`) | Keep both statements marked | Contradicting statements `(s₁, s₂)` and their overlapping domain |

---

## References

[CommonMark]: https://spec.commonmark.org/0.31.2/ "John MacFarlane: CommonMark Specification, Section 4.7 Link reference definitions."
[JSON Schema 2020-12]: https://json-schema.org/draft/2020-12/json-schema-validation "Wright, Andrews, Hutton, Dennis: JSON Schema Validation: A Vocabulary for Structural Validation of JSON, Section 8."
[ISO EBNF]: https://www.iso.org/standard/26153.html "ISO/IEC 14977:1996 Information technology — Syntactic metalanguage — Extended BNF."
[SMT-LIB]: https://smt-lib.org/papers/smt-lib-reference-v2.6-r2021-05-12.pdf "Barrett, Fontaine, Tinelli: The SMT-LIB Standard: Version 2.6."
[DDD]: https://www.domainlanguage.com/ddd/ "Eric Evans: Domain-Driven Design: Tackling Complexity in the Heart of Software (2003)."
[ACE]: http://attempto.ifi.uzh.ch/site/pubs/papers/fuchs_reasoningweb2008.pdf "Norbert E. Fuchs, Kaarel Kaljurand, Tobias Kuhn: Attempto Controlled English for Knowledge Representation (2008)."
[SBVR]: https://www.omg.org/spec/SBVR/1.5/ "Object Management Group: Semantics of Business Vocabulary and Business Rules (SBVR), Version 1.5."
[SKOS]: https://www.w3.org/TR/skos-reference/ "W3C Recommendation: SKOS Simple Knowledge Organization System Reference (2009)."
[OntoLex-Lemon]: https://www.w3.org/2016/05/ontolex/ "W3C Community Group Final Report: Lexicon Model for Ontologies (OntoLex-Lemon, 2016)."
[GF]: https://www.grammaticalframework.org/ "Aarne Ranta: Grammatical Framework: A Type-Theoretical Grammar Formalism (2004)."
[EARS]: https://ieeexplore.ieee.org/document/5328509 "Alistair Mavin et al.: Easy Approach to Requirements Syntax (EARS), IEEE RE 2009."
[FRET]: https://github.com/NASA-SW-VnV/fret "Giannakopoulou et al.: Formal Requirements Elicitation with FRET (NASA Ames Research Center)."
