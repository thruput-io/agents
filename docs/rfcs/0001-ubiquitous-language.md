# RFC 0001: Ubiquitous Language (`uql`)

- **Feature Name**: `ubiquitous-language` (`uql`)
- **Status**: Draft
- **Start Date**: 2026-11-21

---

## Summary

`Ubiquitous Language` (`uql`) is a controlled domain language that projects an independent axiomatic system (`Abstract Syntax`) onto human-readable text with `CommonMark`, `JSON Schema 2020-12`, and `SMT-LIB` bindings.

---

## Motivation

Communication fails whenever natural language passes back and forth without shared meaning. Humans and AI agents exchange words while attaching private, conflicting assumptions to each word. Sentences flow both ways, yet meaning is not conveyed.

In any domain, natural English does not separate true from false or good from bad. Conveying exact meaning requires a `Ubiquitous Language` (`uql`) where every domain `Term` carries one definition and every `Statement` is a falsifiable present-tense truth. In `uql`, any unmapped word, ambiguity, or contradiction is a `Diagnostic` error. Just as a programming language requires a specification before its parser, linter, and IDE exist, this RFC specifies `uql`.

---

## Guide-level explanation

### 1. Declarative Present-Tense Statements

Following `Alloy`, `TLA+`, and `ACE`, `uql` defines the valid state space of a domain using present-tense indicative `Statement`s:

- *"Every `Withdrawal` references an `Account`."*
- *"A settled `Invoice` is `Immutable`."*
- *"An `Account` contains no negative `Balance`."*

A target artifact complies when the artifact satisfies all `Statement`s and `Glossary` definitions in scope. Any counterexample where a `Statement` does not hold is a `Violation`.

### 2. Before and After

Before (unstructured `Prose` mixing redundant explanations, inline URLs, verbatim quotes, and modal imperatives):

```markdown
# Double-entry balance

Accounting is the measurement and communication of financial information. Every ledger entry must balance debits and credits ([Luca Pacioli](https://example.org/pacioli-1494)): "a person should not go to sleep at night until the debits equal the credits."

- You should record both the debit account and credit account on every transfer.
```

After (`uql` — redundant explanations are removed, clauses are present-tense truths, and citations with verbatim quotes move to `## References` via `CommonMark` `[Label]: <URI> "Quote"`):

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

### 1. Core `Glossary` of `uql`

| `Term.id` | `partOfSpeech` | `forms` | `definition` |
|---|---|---|---|
| `Ubiquitous Language` | `noun` | `Ubiquitous Language`, `uql`, `UQL` | Domain language where open-class spans resolve to `Term`s and `Statement`s satisfy Invariants 1–5. |
| `Prose` | `noun` | `Prose`, `prose` | Unconstrained `CommonMark` text for quotes and transcripts. |
| `Glossary` | `noun` | `Glossary`, `Glossaries` | Set of `Term` definitions in a `Bounded Context`. |
| `Term` | `noun` | `Term`, `Terms` | Open-class word or phrase with one definition, one `partOfSpeech`, and surface `forms`. |
| `Reference` | `noun` | `Reference`, `References` | Binding from an identifier to a `URI` and optional `Prose` quote. |
| `Statement` | `noun` | `Statement`, `Statements` | Present-tense sentence of `Clause`s narrowing the state space of its `Subject`. |
| `Clause` | `noun` | `Clause`, `Clauses` | Unit with `Subject`, `Predicate`, optional `Object` or `Complement`, and optional `Adverbial`s. |
| `Constituent` | `noun` | `Constituent`, `Constituents` | Part of a `Clause`: `Subject`, `Predicate`, `Object`, `Complement`, or `Adverbial`. |
| `CodeLiteral` | `noun` | `CodeLiteral`, `CodeLiterals` | `CommonMark` code span or block excluded from `Term` matching. |
| `UqlAst` | `noun` | `UqlAst` | Syntax tree of a `uql` document holding `Term`s, `Statement`s, `Reference`s, and `Diagnostic`s. |
| `Diagnostic` | `noun` | `Diagnostic`, `Diagnostics` | Lint error emitted when a `uql` document violates Invariants 1–5 (`UQL001`–`UQL007`). |
| `Violation` | `noun` | `Violation`, `Violations` | Counterexample where a target artifact falsifies a `Statement`. |

### 2. Lexical Rules (`SKOS` & `OntoLex-Lemon`)

1. **Normalization**: `Term.id` is unique in a `Glossary` after ASCII case-folding and whitespace normalization.
2. **Inflection**: Head-word suffixes (`-s`, `-es`, `-ies`, `-ed`, `-ing`) and acronyms expand into `Term.forms`.
3. **Maximal Munch**: Outside `CodeLiteral`s, the lexer matches `Term.forms` left-to-right by longest match; undeclared hyphenated words split on `-`.

### 3. Syntactic Specification (`ISO EBNF`)

```ebnf
Document        = { Heading | Paragraph | List }, [ ReferencesBlock ];
Heading         = "#", { "#" }, NounPhrase;
List            = "-", Statement, { "-", Statement };
Paragraph       = Statement, { Statement };
Statement       = [ Adverbial, "," ], Clause, { CoordConj, Clause }, ".";
Clause          = Subject, Predicate, [ ObjectOrComp ], { Adverbial }
                | ObjectOrComp, ",", Subject, Copula;
Subject         = NounPhrase;
ObjectOrComp    = NounPhrase | AdjectiveTerm | CodeLiteral;
Predicate       = Copula, [ Negation ], [ VerbTerm ]
                | [ AuxiliaryVerb, Negation ], VerbTerm, [ AdverbTerm ];
Adverbial       = ( Preposition, NounPhrase ) | ( SubConj, Clause );
NounPhrase      = [ Determiner ], { AdjectiveTerm }, ( NounTerm | Pronoun | CodeLiteral ),
                  { Preposition, NounPhrase };
ReferencesBlock = "## References", { "[", ReferenceId, "]:", URI, [ '"', Prose, '"' ] };

Determiner      = "a"|"an"|"the"|"this"|"that"|"these"|"those"|"each"|"every"|"any"|"no"
                | "all"|"both"|"either"|"neither"|"one"|"only"|"own"|"same"|"such"|"other"|"another";
Preposition     = "in"|"on"|"at"|"to"|"from"|"by"|"with"|"without"|"of"|"for"|"into"|"through"
                | "before"|"after"|"between"|"under"|"over"|"across"|"within"|"outside"|"above"
                | "below"|"against"|"per"|"via"|"as";
CoordConj       = "and"|"or"|"but"|"nor";
SubConj         = "when"|"whenever"|"if"|"unless"|"where"|"while"|"because"|"so"|"than"|"whether"|"as";
Pronoun         = "it"|"its"|"itself"|"they"|"them"|"their"|"theirs"|"themselves"|"who"|"whom"|"whose"|"which"|"what";
Copula          = "be"|"is"|"are"|"been"|"being";
AuxiliaryVerb   = "have"|"has"|"do"|"does";
Negation        = "not";

NounTerm        = ? surface form in D ∪ Σ with partOfSpeech = "noun" ?;
VerbTerm        = ? surface form in D ∪ Σ with partOfSpeech = "verb" ?;
AdjectiveTerm   = ? surface form in D ∪ Σ with partOfSpeech = "adjective" ?;
AdverbTerm      = ? surface form in D ∪ Σ with partOfSpeech = "adverb" ?;
CodeLiteral     = ? CommonMark inlineCode or fenced code node ?;
```

- **Right Association (`ACE`)**: A `Preposition` phrase in a `NounPhrase` attaches to the nearest preceding `Term`; a clause-wide `Adverbial` precedes `,` or attaches to `Predicate`.
- **Anaphora (`DRT`)**: A `Pronoun` binds to the nearest preceding `Term` matching in number (`UQL003` when 2 or more preceding `Term`s in the `Statement` match).

### 4. Authoritative Semantics (Five Invariants & Diagnostics)

Five invariants over ordered `Reference` scope `Σ = ⟨V₁, …, Vₖ⟩`, `Glossary` `D`, and `Statement`s `S` define `uql` semantics:

| Invariant | Mathematical Definition | Projection & `Diagnostic` |
|---|---|---|
| **1. Well-Definedness** | `\|R(w)\| = 1 ∧ \|A(p)\| = 1 ∧ \|T(s)\| = 1` | `\|R(w)\| = 0` emits `UQL001`; `> 1` emits `UQL002`, `UQL003`, or `UQL004`. |
| **2. Propositional Form** | `∀x ∈ S : C(x) ⇒ P(x, O)` | Present-tense clause (`≤ 35` words, `≤ 220` bytes, `≤ 1` subordinate `Adverbial`). |
| **3. Independence & Minimality** | `∀s ∈ S : (S \ {s}) ∪ D ⊭ s ∧ ∀c ∈ s : truth(s \ {c}) ≠ truth(s)` | Entailed `Statement` emits `UQL005`; non-narrowing `Constituent` emits `UQL006`. |
| **4. Satisfiability** | `S ∪ D ⊭ ⊥` | Overlapping `Subject`/`Adverbial` domains with opposite `Predicate`s emit `UQL007`. |
| **5. Finite Closure** | `\|V\| < ∞` in graph `G = (V, E)`, terminating at `Σ` leaves or `V_root` | Traversal from any `Term` with a visited set terminates in `≤ \|V\|` steps. |

### 5. Ordered `References` and `JSON Schema 2020-12` Binding

1. **Precedence**: Lookup `R(w)` returns the first entry in `Σ` where `w ∈ forms(T)`.
2. **Disambiguation**: Placing `[Contract]: <uri>` above `[Glossary]` binds `Contract` to that `Bounded Context`; binding `[Schema contract]: <uri>` disambiguates both contexts without brackets in the body.
3. **Schema**:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "Prose": { "type": "string", "minLength": 1, "contentMediaType": "text/markdown" },
    "UbiquitousLanguage": { "type": "string", "minLength": 1, "contentMediaType": "text/markdown", "contentSchema": { "$ref": "#/$defs/UqlAst" } },
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

### 6. The 5-Step `uql` Algorithm

Rewriting loose `Prose` into `uql` discards the loose `Prose`; linting parses `uql` into `UqlAst` and checks Invariants 1–5 (see [Appendix A](#appendix-a-error-recovery)):

1. **Step 1** moves every inline `URI` and verbatim quote from the body into `## References` as `[Label]: <URI> "Quote"`.
2. **Step 2** removes every redundant `Statement` (`UQL005`) and non-narrowing `Constituent` (`UQL006`).
3. **Step 3** expresses each clause as a present-tense `Statement` (`≤ 35` words) conforming to §3 `ISO EBNF`.
4. **Step 4** matches every open-class span outside `CodeLiteral`s against `D ∪ Σ` and replaces synonyms, declares `Term`s, or emits `UQL001`.
5. **Step 5** checks cardinality `1` (`UQL002`–`UQL004`) and satisfiability (`UQL007`).

### 7. Conformance Levels

1. **Level 1 (Lexical)**: Checks maximal-munch `Term` resolution against `D ∪ Σ` (`UQL001`, `UQL002`).
2. **Level 2 (Syntactic)**: Parses into `UqlAst` per §3 `ISO EBNF` and checks `DRT` anaphora (`UQL003`, `UQL004`).
3. **Level 3 (Semantic)**: Lowers `UqlAst` to `SMT-LIB` predicates and checks Invariants 3–5 (`UQL005`–`UQL007`).

---

## Drawbacks

- Authoring a `Statement` with a new domain concept requires adding the `Term` to the `Glossary` or `References` before Level 1 linting passes.

---

## Rationale and alternatives

| Alternative | Rejection Reason |
|---|---|
| Validate only bracketed `[[Term]]` substrings with regular expressions | Leaves unbracketed words unmapped, corrupts `CodeLiteral`s, and forces duplicate plural definitions. |
| Require `[Term]` brackets around every `Term` in `uql` | Bracket markup around most words makes `uql` uncomfortable for humans to read and write. |
| Inline `[Contract][Context]` brackets inside sentences | Deferring disambiguation and aliasing to `References` keeps the body free of brackets. |

---

## Prior art

| Prior Art | Adopted Concept | Gap Filled by `uql` |
|---|---|---|
| `DDD` | `Ubiquitous Language` and `Bounded Context` boundaries | Adds formal `ISO EBNF` syntax and `SMT-LIB` semantics. |
| `ACE` & `DRT` | Open/closed word split, present-tense FOL mapping, Right-Association, and `DRT` anaphora | Replaces the Prolog runtime with `CommonMark` and `JSON Schema 2020-12` bindings. |
| `SBVR` | *Noun Concepts* (`Term`), *Fact Types* (`VerbTerm`), and vocabulary imports | Replaces MOF/XMI XML and modal prefixes with present-tense `CommonMark`. |
| `SKOS` & `OntoLex-Lemon` | Canonical lemma (`id`), acronyms (`altLabel`), and inflected `forms` (`otherForm`) | Replaces RDF/SPARQL with `JSON Schema 2020-12` objects. |
| `GF` | Separation of one `Abstract Syntax` from host bindings | Uses `CommonMark` and `JSON Schema 2020-12` instead of Haskell/GF modules. |
| `Alloy`, `TLA+`, `EARS` & `FRET` | Declarative state-space invariants, fronted conditions, and `SMT-LIB` conflict cores | Applies declarative invariants to domain `Glossary` governance in `CommonMark`. |

---

## Unresolved questions

None.

---

## Future possibilities

- Automated Level 1–3 linting in CI, anchor-link rendering from matched `Term`s, on-demand `Reference` quote lookup for agents, and IDE LSP support backed by the `Glossary`.

---

## Appendix A: Error Recovery

To continue past the first error, each failure in Steps 2–5 inserts a placeholder node in `UqlAst` and appends a `Diagnostic`:

| `Diagnostic` Code | Placeholder Node in `UqlAst` |
|---|---|
| `UQL001 UndefinedTerm` | `?Term(w)` |
| `UQL002 AmbiguousTerm` | `?AmbiguousTerm(w, candidates)` |
| `UQL003 AmbiguousPronoun` | `?AmbiguousPronoun(p, antecedents)` |
| `UQL004 AmbiguousAttachment` | Right-associated tree + alternative trees |
| `UQL005 RedundantStatement` | `Statement` `s` marked redundant |
| `UQL006 NonMinimalConstituent` | `Constituent` `c` marked non-narrowing |
| `UQL007 Contradiction` | Both `Statement`s `(s₁, s₂)` marked |

---

## References

[CommonMark]: https://spec.commonmark.org/0.31.2/ "John MacFarlane: CommonMark Specification, Section 4.7 Link reference definitions."
[JSON Schema 2020-12]: https://json-schema.org/draft/2020-12/json-schema-validation "Wright, Andrews, Hutton, Dennis: JSON Schema Validation: A Vocabulary for Structural Validation of JSON, Section 8."
[ISO EBNF]: https://www.iso.org/standard/26153.html "ISO/IEC 14977:1996 Information technology — Syntactic metalanguage — Extended BNF."
[SMT-LIB]: https://smt-lib.org/papers/smt-lib-reference-v2.6-r2021-05-12.pdf "Barrett, Fontaine, Tinelli: The SMT-LIB Standard: Version 2.6."
[DDD]: https://www.domainlanguage.com/ddd/ "Eric Evans: Domain-Driven Design: Tackling Complexity in the Heart of Software (2003)."
[ACE]: http://attempto.ifi.uzh.ch/site/pubs/papers/fuchs_reasoningweb2008.pdf "Norbert E. Fuchs, Kaarel Kaljurand, Tobias Kuhn: Attempto Controlled English for Knowledge Representation (2008)."
[DRT]: https://plato.stanford.edu/entries/discourse-representation-theory/ "Hans Kamp and Uwe Reyle: From Discourse to Logic (1993)."
[SBVR]: https://www.omg.org/spec/SBVR/1.5/ "Object Management Group: Semantics of Business Vocabulary and Business Rules (SBVR), Version 1.5."
[SKOS]: https://www.w3.org/TR/skos-reference/ "W3C Recommendation: SKOS Simple Knowledge Organization System Reference (2009)."
[OntoLex-Lemon]: https://www.w3.org/2016/05/ontolex/ "W3C Community Group Final Report: Lexicon Model for Ontologies (OntoLex-Lemon, 2016)."
[GF]: https://www.grammaticalframework.org/ "Aarne Ranta: Grammatical Framework: A Type-Theoretical Grammar Formalism (2004)."
[Alloy]: https://softwareabstractions.org/ "Daniel Jackson: Software Abstractions: Logic, Language, and Analysis (MIT Press, 2006)."
[TLA+]: https://lamport.azurewebsites.net/tla/tla.html "Leslie Lamport: Specifying Systems: The TLA+ Language and Tools for Hardware and Software Engineers (2002)."
[EARS]: https://ieeexplore.ieee.org/document/5328509 "Alistair Mavin et al.: Easy Approach to Requirements Syntax (EARS), IEEE RE 2009."
[FRET]: https://github.com/NASA-SW-VnV/fret "Giannakopoulou et al.: Formal Requirements Elicitation with FRET (NASA Ames Research Center)."
