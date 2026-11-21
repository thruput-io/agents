# RFC 0001: Ubiquitous Language (`uql`)

- **Feature Name**: `ubiquitous-language` (`uql`)
- **Status**: Draft
- **Start Date**: 2026-11-21
- **Normative References**: CommonMark 0.31.2, JSON Schema Draft 2020-12, ISO/IEC 14977 (EBNF), SMT-LIB 2.6

---

## Summary

Specify **Ubiquitous Language (`uql`)**, a controlled domain language that projects an independent axiomatic system (`Abstract Syntax`) onto human-readable text with **Markdown** and **JSON Schema Draft 2020-12** bindings and **SMT-LIB 2.6** first-order logic semantics.

---

## Motivation

Communication fails whenever natural language passes back and forth without shared meaning. Humans—and even more visibly, humans and AI agents—exchange words while attaching private, conflicting assumptions to them. We believe we are communicating because sentences flow both ways, yet meaning is not conveyed.

To distinguish good from bad or true from false in any domain, natural English is not the language. Conveying exact meaning requires a **Ubiquitous Language (`uql`)** where every domain term carries a single defined meaning, every statement is a falsifiable present-tense truth, and any unmapped word, ambiguity, or contradiction is an error. Just as a programming language requires a specification before its parser, linter, and IDE tooling can exist, this RFC specifies **`uql`**.

---

## Guide-level explanation

### 1. Declarative Present-Tense Invariants

Following Alloy, TLA+, and Attempto Controlled English (ACE), `uql` defines the valid state space of a domain using present-tense indicative `Statement`s:

- *"Every `Withdrawal` references an `Account`."*
- *"A settled `Invoice` is `Immutable`."*
- *"An `Account` contains no negative `Balance`."*

A target complies if and only if it satisfies all statements and definitions in scope; any counterexample where a statement does not hold is a `Violation`.

### 2. Before and After

Before (unstructured prose mixing redundant explanations, inline URLs, verbatim quotes, and modal imperatives):

```markdown
# Double-entry balance

Accounting is the measurement and communication of financial information. Every ledger entry must balance debits and credits ([Luca Pacioli](https://example.org/pacioli-1494)): "a person should not go to sleep at night until the debits equal the credits."

- You should record both the debit account and credit account on every transfer.
```

After (`uql` — redundant re-definitions are removed, clauses are present-tense truths, and external citations/quotes move to `## References` via CommonMark §4.7 `[Label]: <URI> "Verbatim quote"`):

```markdown
# Double-entry balance

Every Ledger entry balances its Debit and Credit, as established in Summa de Arithmetica.

- Every Transfer records a Debit Account and a Credit Account.

## References

[Summa de Arithmetica]: https://example.org/pacioli-1494 "Luca Pacioli: A person should not go to sleep at night until the debits equal the credits."
[Glossary]: https://example.org/accounting/glossary.json
```

---

## Reference-level explanation

### 1. Abstract Syntax and Host Bindings

Following Grammatical Framework (GF), `uql` separates its **Abstract Syntax** (the 5 invariants over the ordered reference scope `Σ`, glossary definitions `D`, and statements `S`) from its host bindings:
1. **Markdown Binding**: CommonMark documents whose body is written in `uql` and whose bottom `## References` section declares ordered CommonMark link reference definitions (`[Label]: <URI> "Optional quote"`).
2. **JSON Schema Binding**: JSON or YAML documents where text properties are typed as `UbiquitousLanguage` (`contentMediaType: "text/markdown"`, `contentSchema: UqlAst`) alongside a structured `Glossary` and ordered `References`.
3. **SMT-LIB 2.6 Binding**: First-order logic assertions (`declare-fun`, `assert (forall ...)`) for mechanical verification of Invariants 3–5.

- **`Prose`**: Unconstrained Markdown text (`"type": "string", "minLength": 1, "contentMediaType": "text/markdown"`), used for verbatim quotes (`Reference.quote`) and transcripts.
- **`UbiquitousLanguage` (`uql`)**: Text conforming to §§2–7 below.

### 2. Lexical Specification and `Glossary` Grounding

Aligned with W3C SKOS and OntoLex-Lemon, a **`Glossary`** (`D`) is a collection of **`Term`** entries:
1. **`Term.id` (`skos:prefLabel` / `ontolex:canonicalForm`)**: Canonical lemma of an open-class `Term`, unique within its Bounded Context after ASCII case-folding and whitespace normalization.
2. **`Term.partOfSpeech`**: One of `"noun"`, `"verb"` (*SBVR Fact Type*), `"adjective"`, or `"adverb"`.
3. **`Term.forms` (`skos:altLabel` & `ontolex:otherForm`)**:
   - Standard English inflection suffixes on the head word (`-s`, `-es`, `-ies` for plurals and 3rd-person singular verbs; `-ed`, `-ing` for participles) expand into the `Glossary`'s `forms` list; irregular forms or acronyms (`["UQL", "uql"]`) are declared explicitly in `forms`.
4. **Tokenization and Maximal Munch**:
   - Backtick code spans (`inlineCode`) and fenced code blocks (`code`) are extracted first by the CommonMark AST parser as `CodeLiteral`s.
   - Over the remaining text tokens, `Term` matching uses case-insensitive **longest-match (maximal munch)** left-to-right against `forms`.
   - Hyphenated compounds match as a single `Term` if present in `forms`, or split on `-` into constituent tokens if absent.

### 3. Syntactic Specification (ISO/IEC 14977 EBNF & Parts of Speech)

#### 3.1 Parts of Speech

| Partition | Enumerated Word Classes | Rule in `uql` |
|---|---|---|
| **Open Word Classes** | `NounTerm`, `VerbTerm` (*Fact Type*), `AdjectiveTerm`, `AdverbTerm` | Every open-class word or phrase outside a `CodeLiteral` resolves to a **`Term`** in `D ∪ Σ` with the corresponding `partOfSpeech`. |
| **Closed Word Classes** | `Determiner`, `Preposition`, `CoordConj`, `SubConj`, `Pronoun`, `Copula`, `AuxiliaryVerb`, `Negation` | Form the grammatical structure connecting `Term`s. |

#### 3.2 Complete Phrase Structure Grammar (ISO/IEC 14977 EBNF)

```ebnf
Document        = { Block } , [ ReferencesBlock ] ;
Block           = Heading | Paragraph | List ;
Heading         = "#" , { "#" } , NounPhrase ;
List            = ListItem , { ListItem } ;
ListItem        = "-" , Statement ;
Paragraph       = Statement , { Statement } ;
Statement       = [ Adverbial , "," ] , Clause , { CoordConj , Clause } , "." ;
Clause          = Subject , Predicate , [ ObjectOrComp ] , { Adverbial }
                | ObjectOrComp , "," , Subject , Copula ;
Subject         = NounPhrase ;
ObjectOrComp    = NounPhrase | AdjectiveTerm | CodeLiteral ;
Predicate       = Copula , [ Negation ] , [ VerbTerm ]
                | [ AuxiliaryVerb , Negation ] , VerbTerm , [ AdverbTerm ] ;
Adverbial       = ( Preposition , NounPhrase )
                | ( SubConj , Clause ) ;
NounPhrase      = [ Determiner ] , { AdjectiveTerm } , ( NounTerm | Pronoun | CodeLiteral ) ,
                  { Preposition , NounPhrase } ;
ReferencesBlock = "## References" , { ReferenceDef } ;
ReferenceDef    = "[" , ReferenceId , "]:" , URI , [ '"' , Prose , '"' ] ;

(* Closed-Class Terminal Categories *)
Determiner      = "a" | "an" | "the" | "this" | "that" | "these" | "those"
                | "each" | "every" | "any" | "no" | "all" | "both" | "either"
                | "neither" | "one" | "only" | "own" | "same" | "such" | "other" | "another" ;
Preposition     = "in" | "on" | "at" | "to" | "from" | "by" | "with" | "without"
                | "of" | "for" | "into" | "through" | "before" | "after" | "between"
                | "under" | "over" | "across" | "within" | "outside" | "above"
                | "below" | "against" | "per" | "via" | "as" ;
CoordConj       = "and" | "or" | "but" | "nor" ;
SubConj         = "when" | "whenever" | "if" | "unless" | "where" | "while"
                | "because" | "so" | "than" | "whether" | "as" ;
Pronoun         = "it" | "its" | "itself" | "they" | "them" | "their"
                | "theirs" | "themselves" | "who" | "whom" | "whose" | "which" | "what" ;
Copula          = "be" | "is" | "are" | "been" | "being" ;
AuxiliaryVerb   = "have" | "has" | "do" | "does" ;
Negation        = "not" ;

(* Open-Class Terminals Resolved Against Glossary D ∪ Σ *)
NounTerm        = ? surface form in D ∪ Σ with partOfSpeech = "noun" ? ;
VerbTerm        = ? surface form in D ∪ Σ with partOfSpeech = "verb" ? ;
AdjectiveTerm   = ? surface form in D ∪ Σ with partOfSpeech = "adjective" ? ;
AdverbTerm      = ? surface form in D ∪ Σ with partOfSpeech = "adverb" ? ;
CodeLiteral     = ? CommonMark inlineCode or fenced code node ? ;
```

- **Deterministic Attachment (ACE Right Association)**: A `Preposition` phrase inside a `NounPhrase` attaches to the nearest preceding `Term`; a sentence-wide `Adverbial` is fronted before `,` or attached to the `Predicate`.
- **Deterministic Anaphora (DRT/ACE)**: A `Pronoun` binds to the nearest preceding `Term` matching in grammatical number; if 2 or more preceding `Term`s in the `Statement` match in number, it fails with `UQL003 AmbiguousPronoun`.

### 4. Authoritative Semantics (Five Mathematical Invariants)

The semantics of `uql` are defined once by five invariants over the ordered reference scope `Σ = ⟨V₁, …, Vₖ⟩`, glossary definitions `D`, and statements `S`:

| Invariant | Authoritative Mathematical Definition | Human-Readable Projection in `uql` |
|---|---|---|
| **1. Well-Definedness (`Unambiguity`)** | `\|R(w)\| = 1  ∧  \|A(p)\| = 1  ∧  \|T(s)\| = 1` | `\|R(w)\| = 0` is `UQL001 UndefinedTerm`; cardinality `> 1` is a `UQL002`–`UQL004 Ambiguity` lint error. |
| **2. Propositional Form (`Statement`)** | `∀x ∈ S : C(x) ⇒ P(x, O)` | Declarative present-tense clause of `≤ 35` words (`≤ 220` bytes) and `≤ 1` subordinate `Adverbial` clause. |
| **3. Independence & Minimality (`SSOT`)** | `∀s ∈ S : (S \ {s}) ∪ D ⊭ s  ∧  ∀c ∈ s : truth(s \ {c}) ≠ truth(s)` | No `Statement` re-explains a `Term` or another `Statement` (`UQL005`), and every constituent narrows when the `Statement` holds (`UQL006`). |
| **4. Satisfiability (`No Contradiction`)** | `S ∪ D ⊭ ⊥` | Overlapping `Subject`/`Adverbial` conditions with mutually exclusive `Predicate`s are a `UQL007 Contradiction` lint error. |
| **5. Finite Closure** | `\|V\| < ∞` in dependency graph `G = (V, E)`, terminating at `Σ` leaves or `V_root` | Reachability from any `Term` with a visited set terminates in `≤ \|V\|` steps. |

### 5. Ordered `References` and JSON Schema Binding

A `uql` document resolves `Term`s against an ordered `References` list (`## References` in Markdown; `references` / `anyOf` `$ref` in JSON Schema):
1. **Order decides precedence**: Lookup `R(w)` returns the first entry in `Σ` where `w ∈ forms(T)`.
2. **Disambiguation in `References`**: Placing `[Contract]: <external-uri>` above `[Glossary]` binds `Contract` to that context; binding `[Schema contract]: <external-uri>` lets a document refer to both contexts without brackets in the body text.
3. **JSON Schema Draft 2020-12 Binding**:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "Prose": {
      "type": "string",
      "minLength": 1,
      "contentMediaType": "text/markdown"
    },
    "UbiquitousLanguage": {
      "type": "string",
      "minLength": 1,
      "contentMediaType": "text/markdown",
      "contentSchema": { "$ref": "#/$defs/UqlAst" }
    },
    "Term": {
      "type": "object",
      "required": ["id", "partOfSpeech", "forms", "definition"],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "partOfSpeech": { "enum": ["noun", "verb", "adjective", "adverb"] },
        "forms": { "type": "array", "minItems": 1, "uniqueItems": true, "items": { "type": "string", "minLength": 1 } },
        "definition": { "$ref": "#/$defs/UbiquitousLanguage" }
      }
    },
    "Reference": {
      "type": "object",
      "required": ["id", "uri"],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "uri": { "type": "string", "format": "uri" },
        "quote": { "$ref": "#/$defs/Prose" }
      }
    }
  }
}
```

### 6. The 5-Step `uql` Rewriting, Parsing, and Linting Algorithm

When rewriting loose prose into `uql`, the loose prose is discarded and replaced by the resulting `uql` text. When linting `uql`, the parser builds a `UqlAst` and checks Invariants 1–5 to emit `Diagnostics` (see [Appendix A](#appendix-a-error-recovery)):

1. **Extract Citations and Quotes**: Move every inline URL (`[label](https://...)`) and attributed verbatim quote out of the statement body into `## References` as `[Label]: <URI> "Author: Verbatim quote"`.
2. **Strip Babble (Invariant 3)**: Delete any clause or sentence already entailed by `D` or an earlier `Statement` (`UQL005`), and any constituent whose removal leaves the truth condition unchanged (`UQL006`).
3. **Form Declarative Present-Tense Clauses (Invariant 2)**: Express each clause as a present-tense truth (`≤ 35` words) conforming to §3.2 EBNF.
4. **Resolve Open-Class Words to `Term`s (Invariant 1)**: Match every Open-Class span (`NounTerm`, `VerbTerm`, `AdjectiveTerm`, `AdverbTerm`) outside `CodeLiteral`s against `D ∪ Σ`; if `|R(w)| = 0`, replace `w` with an existing synonym in `D`, declare `w` as a new `Term`, or emit `UQL001 UndefinedTerm(w)`.
5. **Lint Unambiguity and Satisfiability (Invariants 1 & 4)**: Emit `UQL002` if `|R(w)| > 1`, `UQL003` if `|A(p)| > 1`, `UQL004` if `|T(s)| > 1`, or `UQL007` if two `Statement`s have overlapping `Subject` + `Adverbial` domains and mutually exclusive `Predicate`s.

### 7. Conformance Levels and Complexity Budgets

1. **Level 1 (Lexical & Reference Closure)**: Enforces maximal-munch `Term` matching against the `Glossary` `forms` and `References` (`UQL001`, `UQL002`).
2. **Level 2 (Syntactic & Anaphora Unambiguity)**: Parses into `UqlAst` per §3.2 EBNF, enforcing the `≤ 35`-word `Statement` bound and DRT pronoun resolution (`UQL003`, `UQL004`).
3. **Level 3 (Logical Independence, Minimality & Satisfiability)**: Lowers `UqlAst` `Term`s to `(declare-fun T (Entity) Bool)` and *Fact Types* to `(declare-fun P (Entity Entity) Bool)` in Z3 SMT-LIB 2.6 (`UQL005`–`UQL007`).
4. **Budgets**: Normative core (§§1–7) `≤ 1,200` words (`≤ 8` KB); complete RFC `≤ 2,500` words (`≤ 18` KB).

---

## Drawbacks

- Authoring new statements requires declaring any new open-class noun, verb (*Fact Type*), adjective, or adverb as a `Term` in the `Glossary` (or binding it in `References`) before Level 1 linting passes.

---

## Rationale and alternatives

| Alternative | Why it was rejected |
|---|---|
| Validate only bracketed `[[Term]]` substrings with regular expressions | Leaves unbracketed words unmapped, corrupts code spans, and forces duplicate plural definitions. |
| Require `[Term]` brackets around every `Term` in `uql` | Bracket markup around most words makes prose uncomfortable for humans to read and write. |
| Inline `[Contract][Context]` brackets inside sentences | Deferring disambiguation and aliasing to the bottom `References` section keeps the prose body 100% bracket-free. |

---

## Prior art

| Prior Art | What `uql` Adopts | Why Existing Tooling Did Not Fit Directly |
|---|---|---|
| **Domain-Driven Design (Evans, 2003)** | *Ubiquitous Language* and *Bounded Context* boundaries. | Informal prose practice with no formal grammar or linter. |
| **Attempto Controlled English (ACE) & DRT** | Open/closed word split, present-tense FOL mapping, Right-Association, and DRT pronoun resolution. | Requires a Prolog runtime (APE), lacks CommonMark / JSON Schema bindings, and does not optimize LLM context budgets. |
| **OMG SBVR v1.5** | *Noun Concepts* (`Term`), *Fact Types* (`P(x, O)`), and vocabulary imports. | Serialized as MOF/XMI XML with modal prefixes and visual font styling. |
| **W3C SKOS & OntoLex-Lemon** | Canonical lemma (`id` / `skos:prefLabel`), acronyms (`skos:altLabel`), and inflected forms (`ontolex:otherForm`). | Requires RDF/Turtle/SPARQL infrastructure rather than JSON Schema. |
| **Grammatical Framework (GF)** | Separation of one **Abstract Syntax** from host bindings. | Requires Haskell/GF grammars rather than CommonMark + JSON Schema. |
| **Alloy, TLA+, EARS & NASA FRET** | Declarative legal-state invariants, fronted conditions, and Z3 `unsat-core`. | FRET targets real-time temporal logic (`pmLTL`/Lustre) in an Electron database. |

---

## Unresolved questions

None.

---

## Future possibilities

- Automated Level 1–3 linting in CI pipelines, automatic anchor-link rendering from matched `Term`s in static site generators, on-demand `Reference` quote lookup for AI agents, and IDE Language Server Protocol (LSP) autocomplete and hover definitions backed by the `Glossary`.

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
