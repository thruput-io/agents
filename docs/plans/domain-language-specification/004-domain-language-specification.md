# 004 — Domain Language Specification (`uql`)

## Implementing Agent Instructions

Read this section first, and in full, before touching any code.

**No authoring of this plan.**
Once implementation begins and progress is recorded under `progress/`, this plan is frozen: executing agents **MUST NOT** author, edit, rewrite, or amend `docs/plans/domain-language-specification/004-domain-language-specification.md`. If any conflict, ambiguity, or unexpected error arises during execution, stop immediately and return control to the human.

**Read before starting.**
This repository's rules, [`rules/Rules.yaml`](../../../rules/Rules.yaml), with the principles ([`rules/Principles.yaml`](../../../rules/Principles.yaml)) and definitions ([`rules/Definitions.yaml`](../../../rules/Definitions.yaml)) they rest on, published at <https://thruput.se/agents/>, [ADR 0002](../../adrs/0002-schema-validated-yaml-governance-documents.md), [ADR 0004](../../adrs/0004-schemas-and-taxonomy-published-to-the-web.md), [ADR 0005](../../adrs/0005-structure-is-described-in-json-schema.md), the research reports in [`research/uql-rfc/README.md`](research/uql-rfc/README.md), [`research/pl-rfc-comparison/README.md`](research/pl-rfc-comparison/README.md), [`research/prior-art-audit/README.md`](research/prior-art-audit/README.md), [`research/ast-and-markdown-references/README.md`](research/ast-and-markdown-references/README.md), and [`research/json-schema-content-and-ast-validation/README.md`](research/json-schema-content-and-ast-validation/README.md), and this plan end to end. The rules outrank this plan; raise any conflict with the human instead of resolving it yourself.

**Scope.**
Implement the milestones in [Execution Plan](#execution-plan), in order, with verification and git commit checkpoints at each milestone. Anything not in this plan is out of scope — stop and ask rather than extending it.

**Definition of done.**
Implementation is complete when every milestone's verification test passes, `./build.sh` at the repository root succeeds with zero warnings or errors, and every goal in [Goals](#goals) is delivered per the [Goal coverage](#goal-coverage) table.

**Verification.**
Run `./build.sh` at the repository root at each milestone checkpoint. Do not treat a milestone as done on inspection alone.

### Progress log

Keep an append-only progress log for this attempt:

- Open `docs/plans/domain-language-specification/progress/004-attempt-1-<YYYY-MM-DD>.md` before the first code change.
- Append at each milestone checkpoint: what was implemented, what verification showed, and the commit hash.
- **MUST NOT** rewrite, condense, or delete an existing entry. Corrections are new entries.
- **MUST NOT** amend or force-push a commit that contains progress-log entries.
- Commit the log alongside the milestone work it describes.

---

## Background

Everything in software development boils down to communication, and the introduction of AI makes this even more obvious. Natural English going back and forth creates the illusion of communication while conveying no shared meaning ([D3](#discussions)). To distinguish good software engineering from bad without ambiguity, our governance documents (`rules/Definitions.yaml`, `rules/Rules.yaml`, `rules/Principles.yaml`, `rules/Rationales.yaml`, `rules/CodingPyramid.yaml`) must be written in an explicit **Ubiquitous Language (`uql`)** where words carry formally defined meanings.

Today, we do not have a formal specification for that language ([D4](#discussions)):

1. **No formal grammar, lexical rules, or semantic invariants for `Prose`**:
   - Our `Prose` and `DefinedProse` schemas treat text as arbitrary English strings containing at least one `[[Id]]` substring.
   - A rule can contain a single `[[Term]]` while the rest of its sentence is written in unmapped, ambiguous English and still pass validation.
2. **Homegrown `[[Id]]` syntax, regex machinery, and context bloat**:
   - Instead of a language specification that defines how `Term`s, inflections, closed-class function words, and code literals compose into declarative present-tense statements, we invented a custom `[[Id]]` wiki-link syntax and a 200-branch regex alternation in `scripts/declared-ids.schema.sh`.
   - That regex machinery is blind to Markdown code spans (`inlineCode` / `code`), forces awkward suffixing (`[[Compatibility branch]]es`) or duplicate plural entries in `rules/Definitions.yaml` (`User`/`Users`, `Domain object`/`Domain objects`), embeds raw URLs and external author quotes directly inside `Principles.yaml` and `Rationales.yaml` bodies (bloating PR review agent context), and inverts `MUST NOT` rules by separating `marker:` from `body`.

### Goals

In priority order:

1. **A `UbiquitousLanguage` (`uql`) `Statement` is a declarative present-tense clause (`Subject`, `Predicate`, `Object`/`Complement`, optional `Adverbial`) governed by ISO/IEC 14977 EBNF and five formal invariants (Well-Definedness $\|R\| = 1$, Propositional Form, Logical Independence & Minimality / SSOT, Satisfiability / No Contradiction, and Finite Closure), where every open-class word or phrase (`Noun`, `MainVerb` *Fact Type*, `Adjective`, `Adverb`) outside a `CodeLiteral` resolves to a `Term` and concrete indicators (`Smells`) are `uql` `Statement`s that narrow `Subject` $S' \subset S$.**
2. **A `Term` in `UbiquitousLanguage` (`uql`) is written as plain prose and matches its canonical `Id` (`skos:prefLabel` / `ontolex:canonicalForm`) and its inflected or alternative surface `forms` (`skos:altLabel` / `ontolex:otherForm`), which the build compiles into the generated schema artifact (`*.g.schema.json`).**
3. **A `Term` resolves against the document's ordered `References` section (expressed at the bottom of a Markdown document via CommonMark `[Label]: <URI> "Verbatim quote"` and as `anyOf` / `$ref` in JSON Schema), where declaration order and local `Term` bindings disambiguate cross-context terms and verbatim quotes (`Prose`) live in `References` outside the `uql` body.**
4. **The `uql` specification (`docs/rfcs/0001-ubiquitous-language.md`, `docs/adrs/0011-ubiquitous-language.md`, `schemas/repository/rfc.schema.json`, and `schemas/governance/ubiquitous-language.schema.json`) uses domain-neutral examples, is self-hosted in `uql` within hard size/complexity budgets ($\le 1,200$ words normative core, $\le 2,500$ words total, $\le 35$ words per `Statement`), and enables a less-capable subagent given only the RFC to transform both our governance corpus and large unstructured prose texts within token/turn budgets.**

#### Cheapest passing interpretation

| Goal | Cheapest way to "pass" while missing the point | How the goal excludes it | Accepted by |
|---|---|---|---|
| 1 | Validate only that at least one `Term` appears in a sentence while leaving other open-class words unresolved, allowing redundant restatements ("babble") or noun-phrase `Smells` that merely negate the parent rule, or leaving `Ambiguity` and `Contradiction` undefined | Pins the open-class and closed-class parts of speech, the ISO/IEC 14977 EBNF grammar, the 5 mathematical invariants, the 5-step algorithm, and concrete specialization ($S' \subset S$) for indicators in `docs/rfcs/0001-ubiquitous-language.md` | [D21](#discussions), [D22](#discussions), [D23](#discussions), [D26](#discussions) |
| 2 | Require bracket markup (`[[Term]]`) in prose, separate glossary entries for plurals (`User` and `Users`), or runtime NLP stemmers in downstream schema consumers | `Term`s are written as plain prose, `forms` are specified on `Definition`, and the generated schema artifact (`*.g.schema.json`) contains the pre-expanded enumeration of surface `forms` | [D6](#discussions), [D7](#discussions) |
| 3 | Duplicate externally defined entities as prose in `rules/Definitions.yaml`, inline URLs, quotes, or disambiguation brackets inside sentences, or leave cross-reference precedence unspecified | External vocabularies, schemas, and literature (including verbatim quotes typed as `Prose`) are declared in an ordered `References` section (at the bottom of Markdown and via `anyOf` / `$ref` in JSON Schema), where order and local `Term` bindings disambiguate collisions without brackets in the body text | [D12](#discussions), [D18](#discussions), [D19](#discussions), [D22](#discussions) |
| 4 | Bake translated examples from `rules/*.yaml` into the RFC so the subagent copies them, or write a bloated RFC that exceeds smaller agents' context budgets on unstructured text | The RFC uses only domain-neutral examples (none from `rules/*.yaml`), stays $\le 1,200$ words for the normative core ($\le 2,500$ words total), is verified in M1 by a subagent transforming the entire `rules/*.yaml` corpus using only the RFC, in M2 on large unstructured prose texts, and in M3 against hard size/self-hosting thresholds | [D24](#discussions), [D26](#discussions) |

### Non-goals

- Implementing the production `uql` compiler, CLI linter, or IDE extension (Problem 2 — explicitly deferred to a separate plan per [D4](#discussions) and [D5](#discussions)).
- Changing PR review runtime behavior in `tools/pr-review/`.

## Summary

Formalize the **Ubiquitous Language (`uql`)** specification in `docs/rfcs/0001-ubiquitous-language.md` (governed by `schemas/repository/rfc.schema.json` and `schemas/repository/repository.schema.json`), `docs/adrs/0011-ubiquitous-language.md`, and `schemas/governance/ubiquitous-language.schema.json` + `schemas/governance/definitions.schema.json`; verify the RFC in M1 by having a subagent given only the RFC transform our entire governance corpus (allowing iterative tweaks to `Term`s/definitions and calling exit if new fundamental concepts are needed); stress-test the RFC in M2 with smaller/cross-brand agents on large unstructured texts; and audit/iterate the RFC in M3 against hard size, complexity, and self-hosting (`uql`) thresholds.

## Assumptions, risks and preconditions

### Assumptions

| Assumption | Tested |
|---|---|
| JSON Schema Draft 2020-12 (`contentMediaType`, `contentSchema`, and `anyOf`/`$ref`) can express the structure and ordered `References` scope of `uql` without regex alternations | Verified in [`research/json-schema-content-and-ast-validation/README.md`](research/json-schema-content-and-ast-validation/README.md) |
| CommonMark (§4.7) link reference definitions (`[Label]: <URI> "Verbatim quote"`) natively parse URLs and verbatim quotes at the bottom of `.md` files | Verified in [`research/ast-and-markdown-references/README.md`](research/ast-and-markdown-references/README.md) and [`research/uql-rfc/README.md`](research/uql-rfc/README.md) |
| Established CNL rules (ACE Right-Association attachment, DRT pronoun resolution, SBVR *Fact Types*, and SKOS/OntoLex-Lemon `forms`) close the grammatical and prior-art gaps in `uql` | Verified in [`research/pl-rfc-comparison/README.md`](research/pl-rfc-comparison/README.md) and [`research/prior-art-audit/README.md`](research/prior-art-audit/README.md) |

### Risks

- Transforming the entire `rules/*.yaml` corpus in M1 may surface missing relational *Fact Type* verbs or domain nouns in `Definitions.yaml`; mitigated in M1 by explicitly allowing iterative `Term` additions/tweaks in `Definitions.yaml` and requiring the agent to halt and call upon the human if a new fundamental concept is needed.
- If the RFC exceeds ~1,200 words in its normative core, smaller models suffer attention degradation on large unstructured inputs in M2; mitigated by hard word/byte caps and the M3 iteration gate.

### Preconditions

- Branch `004-domain-language-specification` is created from `origin/main` with a clean working tree.

## References

### Research questions

| Question | Answer | Evidence | Report |
|---|---|---|---|
| Why do flat-string regular expressions fail as a language specification for Markdown prose, and how does an AST representation solve it? | CommonMark gives `inlineCode` and `code` blocks higher precedence than links and text. Flat-string regexes have no lexical tokens and cannot distinguish literals, closed-class function words, and `Term`s. | CommonMark Spec §6; `mdast` specification | [`research/ast-and-markdown-references/README.md`](research/ast-and-markdown-references/README.md) |
| How does JSON Schema Draft 2020-12 (`contentMediaType`, `contentSchema`, `anyOf`/`$ref`) specify `uql` and ordered `References` without regex alternations? | `UbiquitousLanguage` uses `contentMediaType: "text/markdown"`, `contentSchema`, and ordered `anyOf` `$ref` URIs together with pre-expanded `Term` `forms` in `declared-ids.g.schema.json`. | JSON Schema Draft 2020-12 Validation §8.4–8.5 | [`research/json-schema-content-and-ast-validation/README.md`](research/json-schema-content-and-ast-validation/README.md) |
| How does our `uql` RFC compare against standard programming-language RFCs (Rust, Swift, IETF, W3C/OMG), and what size budgets apply for smaller models? | Needed an ISO/IEC 14977 EBNF grammar, maximal-munch lexical rules, conformance levels (Levels 1–3), and a normative core $\le 1,200$ words ($\le 8$ KB) / total RFC $\le 2,500$ words ($\le 18$ KB). | Rust RFC template, Swift Evolution, W3C QA Framework | [`research/pl-rfc-comparison/README.md`](research/pl-rfc-comparison/README.md) |
| What existing standards solve parts of this problem ("reinvented the wheel" check), and why did they fail in day-to-day developer/LLM workflows? | ACE/DRT (open/closed word split, right-association, anaphora), OMG SBVR (*Fact Types*, namespaces), W3C SKOS/OntoLex-Lemon (`prefLabel`/`altLabel`/`otherForm`), GF (Abstract vs. Concrete syntax), and EARS/FRET/Alloy/TLA+ (declarative legal-state invariants + Z3 `unsat-core`). They failed in Git/LLM workflows due to MOF/XMI XML, Prolog runtimes, RDF/SPARQL stacks, and modal boilerplate. | OMG SBVR v1.5, ACE/DRT, W3C SKOS & OntoLex-Lemon, GF, EARS, NASA FRET | [`research/prior-art-audit/README.md`](research/prior-art-audit/README.md) |
| What happened when a `flash` subagent was given only the initial RFC draft (before the 5-step algorithm and EBNF) and told to apply it to `rules`? | It transformed `Rules.yaml` into declarative present-tense truths and extracted `References` in `.md` examples, but took a regex shortcut on `Principles.yaml`/`Rationales.yaml`, left unmapped open-class words (`producer`, `consumer`), and exposed `Smells` as noun-phrase fragments. | Subagent `3a4d2733` output | [`research/rfc-subagent-test/`](research/rfc-subagent-test/) & [`research/uql-rfc/README.md`](research/uql-rfc/README.md) |

## Rejected alternatives

| Alternative | Evidence | Reason for rejection | Discussion |
|---|---|---|---|
| Keep `[[Id]]` regex alternations in `declared-ids.schema.sh` and `DefinedProse` | `schemas/governance/rules.schema.json` only requires one `[[Id]]` per rule while leaving all other words unmapped; `declared-ids.schema.sh` generates 4,000-character regexes | Does not specify a domain language—allows arbitrary undefined English outside the single `[[Id]]` while forcing manual brackets and regex maintenance | [D1](#discussions), [D3](#discussions), [D4](#discussions) |
| Combine the language specification (Problem 1) and the compiler/linter implementation (Problem 2) in one plan | `# PLANNING` ("Name the problem, not the solution ... and cover one problem per plan") | Mixing specification and compiler/linter tooling in one plan violates single-problem focus | [D4](#discussions), [D5](#discussions) |
| Require explicit brackets (`[[Term]]` or `[Term]`) around every domain symbol in `Prose` (Option 1A) | [`research/ast-and-markdown-references/README.md`](research/ast-and-markdown-references/README.md) | In a language where most words are domain symbols, bracket markup around every symbol makes prose uncomfortable for humans to read and write | [D6](#discussions) |
| Maintain separate top-level `Definition` entries for plurals/inflections in `rules/Definitions.yaml` (Option 2C) or manually list every regular inflection by hand in source YAML (hand-maintained Option 2B) | `rules/Definitions.yaml` (`User` vs `Users`, `Developer` vs `Developers`, `Domain object` vs `Domain objects`, `Illegal state` vs `Illegal states`) | Pollutes the source glossary with duplicate stub entries; standard inflections belong in the specification (+ optional `forms` override in source) and expand into an explicit `forms` table as a build artifact | [D7](#discussions) |
| Enumerate a static whitelist of allowed English grammar glue words or keep RFC 2119 markers (`Marker`, `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`) | `rules/Definitions.yaml` lines 2–25 | Word lists drift and RFC 2119 markers invert `MUST NOT` rule bodies; pinning Parts of Speech, EBNF clause structure, and declarative present-tense truths is finite and unambiguous | [D8](#discussions), [D16](#discussions), [D20](#discussions) |
| Include examples from `rules/*.yaml` inside the `uql` RFC | [`research/uql-rfc/README.md`](research/uql-rfc/README.md) | Contaminates the M1 test subject (`rules/*.yaml`) by giving subagents pre-translated answers inside the RFC | [D26](#discussions) |

## Discussions

| Row | Decider | Question | Answer |
|---|---|---|---|
| D1 | Human | Why replace `[[Id]]` and the current `Prose` mechanism? | "we invented th [[]] and prose in order to be able to create refrences to text inside text, i believe we missed out on existing tooling to do this esecially if later json-schema provides a mechanism for doing this cleaner" |
| D2 | Human | What parsing model should be researched alongside JSON Schema? | "i want you to research that matter and want you to also researsd asd parser in this regard" |
| D3 | Human | What is the fundamental communication problem our governance documents are solving? | "Let me give it a try´: 1. Our documentation on our craft needs a very precise language. Everythign in software development boils down to communication. Introduction of AI makes this even more obvious. We waste years trying to make them follow our wishes but we all fail, productivity never reached but during short glimpses. The potence of productiviity is enourmous only blocker is communication. These documents are my take on being able to describe good from bad. I know how effective good is and how ineffective bad is. We believe we can communicate since english goes back and fourth but is all just faked. Meaning is not conveyed at all. In order to convey meaning we need a languga. English is not the lnaguage. It is the domain language we need to establish here. A domain language where we need to bring meaning to our words so that we understand each other." |
| D4 | Human | How does that break down into distinct problems? | "Ibelieve you just did a little of it. The practically of it. If i write a rule somehow it has to be translated and i need to knwo if something is not "mapped". Just like when i write code i want everything to "syntax" an undefined variable shuold give an error an IDE should help me select from lists etc. We cannot reached there today. So problem 1 is that we dont have a spec for our language. Like we did not decide on javascript or python. Atfger that we need a compiler, linter etd as well that problem 2." |
| D5 | Human | Should Plan `004` cover only the specification (Problem 1)? | "Lets follow our rules, breaking them will make this effort blow up and dissapear, focus is my weak point and you are constructed to lead astray, lets follow them, only specification" |
| D6 | Human | Do you want Option 1B (unbracketed symbols) or Option 1A (explicit brackets)? | "We want the language to readable as any prose so that humans feel comfortable reading and writing it" |
| D7 | Human | Do you prefer Option 2A (standard English inflection rules + optional `forms` override), Option 2B (explicit `forms: [...]` list on each definition), or Option 2C? | "Yes 2A is of cource nicest the 2B can be a build artifact" |
| D8 | Human | Should we list reserved grammar glue words in a schema/YAML whitelist, and what about RFC 2119 keywords? | "...Then we do not impose natural language tooling on downstream consumers. I really hate the 2119. It has no meaning since everything is MUST, we even externalixed it. It has no purpose. Restricting wording i am not sure we need. Disamiguition must somehow happen and if wording then either makes it ambigues or are 'not needed' we should have a linter remove and replacing them. It's more a ambiguity rule we let linter take care of. Im afraid listing words will be a never ending story. Can that be defined somehow, between defined (we need a word here) only unambity expressions are allowed" |
| D9 | Human | Does `Term` (Option 4A) fit as the word, or do you prefer `Concept`, `Symbol`, or another word? | "lol now you added \"defined\" in \"Option 4A (Term)\" that is superflous and should be removed :-) I say 4A, also Concept we should keep for a larger construct" |
| D10 | Human | Should we keep `Prose` as plain Markdown prose and replace `DefinedProse` with `UbiquitousLanguage`? | "Prose and UbiquitousLanguage it is, anything inside UbiquitousLanguage means 'linted and compiled and linked with (definitions?)" |
| D11 | Human | Should `UbiquitousLanguage` replace `DefinedProse` / `Prose` across `schemas/governance/*.schema.json` (leaving `schemas/repository/*.schema.json` on `Prose` for now), and is `uql` a good short term? | "Yes, and would uql be a good short term?" |
| D12 | Human | Does Option 7A (schemas and imported Bounded Context URIs count as `Term` definitions) + Option 8A (ordered imports decide precedence; Markdown reference disambiguates cross-context collisions) solve both problems? | "yes, this adresses another problem, today our principles and rationales are pulloted with external links a global import with references would be much better, our uql can stay compact and readably and imports order decideds cardinality" |
| D13 | Human | How should ordered imports and references be represented, and what should be the primary deliverable of this plan? | "Pergaps it is already part of jsonschema" / "you need to start rfc fro uql it sohuld be the outcome of this plan" |
| D14 | Human | Between Option 1 (`docs/rfcs/` + `rfc.schema.json`) and Option 2 (ADR + `schemas/governance/ubiquitous-language.schema.json`), which do you prefer? | "latter, special case for this repo, former should be \"normal\" update repositoy schemas with ahtat  i believe it is in scope" |
| D15 | Human | How should ADR 0011 and the `uql` RFC relate? | "I belive ADR should just refer RFC" |
| D16 | Human | How should `uql` replace RFC 2119 and imperative phrasing using open-class vs. closed-class grammar? | "We are definetly going to use them. So MUST MAY SHUOLD are a way of bringing open-class words into terms?" / "Easy now \"forbid rfc 21219\" i said i hated it. Still we need to come up with uql strategy... I belive you just did: present-tense truth . Then language is not needed to be imperative, that is considered rude" |
| D17 | Human | How should `uql` and its goals be stated? | "'go easy with never'" / "And dont add what uql is not, defining what it is not is eternal task" |
| D18 | Human | How should the ordered scope and bridge between JSON Schema (`uql-json`) and Markdown (`.md`) be expressed in plain English? | "Nice of you stick in swedish there but dont do that in written docs ok? Okay, the JSON Schema URI in an ordered JSON Schema (anyOf / $ref) scope, where declaration order decides precedence is not very \"plain english\", uql inside json (uql-json) but the bridge to .md i gues need an plain english equviloaveent probably like academic world does it or is there another way?" |
| D19 | Human | Can cross-context disambiguation (such as `Contract`) be deferred entirely to the glossary/references at the bottom of the document? | "Given that i can defer the contract ambiquity to a glossary at the bottom of the docuemnt?" |
| D20 | Human | How should verbs and grammar rules be pinned in the `uql` RFC? | "And verbs should be treated as we treat the rest we just need pin them in the rfc, ev ery possible word has to pinned there, looping back to waht we allow in uql" / "NO NO, with poinned i mean the rules you gave, not enumerating them, we will not have any other enumeration in our documents but the ordklasser och satsdelar" |
| D21 | Human | How do we define a `Statement` in `uql` and eliminate "babble" using Single Source of Truth without fixing constituent word order? | "Lol you tell me, the SSOT rule applied to this. How do we remove 'babble' ? I gueess we can define that every sentence should bare meaening with therse constructs. We should be abble to define waht makes a statenment?" / "We do not need to define \"order\" of sstrucutre, i can talk yoda if i want, but just what parts makes up a statement? And your ssot rule iis awesome" |
| D22 | Human | How should external quotes in `References` and `Ambiguity` / `Contradiction` be specified in the `uql` RFC? | "pick a rationale and apply it to that one and we can wee how that md file would look, also I wonder whether it is possible to create a 'bounded context' where all defintions loops back or if it will explode into enternity?" / "Not sure of how rfc are structured but i believe questions like these have a place in them?" / "We never said somethign about contradiction or ambiquity and how thoes are evaluated?" / "I believe our pyramids should be regarded as an implmenation of uql. When evaluating uql and an contradiction is found (compiling) it only stays contradiction until we resolve it. Tiers are not in uql. This is 'runtime' resovemnt of Contradiction. Ambiguity and Contradiction needs to be defined in rfc and that those are not allowed (compile time error)." |
| D23 | Human | How do the mathematical formulations of `uql` relate to Single Source of Truth (SSOT)? | "You sneked in math there. Would math be a complementary way of describing alll this?" / "if it will help our future tooling or agents absolutely, what it makes of ssot? is our defintion just a projection of math?" |
| D24 | Human | How should the authoring/compilation algorithm for agents and the mechanical validation of the mathematical invariants be included in the `uql` RFC? | "I guess transforming our corpus to uql will be the test, before i do it with only our rfc as information with a less capably agent. Perhaps you sohuld make some efforts at with 'unit tests' with minial intruction to a sub agent : \"Apply rfc to rules\" write output to x" / "An algorithm for these poor guys need to be provided as well i believe" / "Do you know how we can validate all math in a good way, perhaps that algorith aso?" / "You document these thisng in rfc as you go i hope" |
| D25 | Human | How should the `uql` algorithm handle compile-time errors (and should `Smells` be in `uql`)? | "Smells do not belong in uql. Your algorithm has to have a way fo dealing with 'compile time' errors without baling out completely at first occurence, i mean ide's are really ood at that" / "if it turns complex make the exit version in rfc and keep the nice one as appendix" / "\"for IDEs and multi-error passes\" skip it" |
| D26 | Human | How should `Smells` be recontextualized, how should the RFC be benchmarked against PL RFCs and prior art without contaminating the `rules/*.yaml` test subject, and how should Milestones M1, M2, and M3 be structured? | "for instance smells where added as duplication by design meant for lesser agent to be able to dig large code looking for hard to evaluate things. Smells has a place how should they be expressed? As prose defats the prupose what then, can we recontext them? in claen plain english way ? Compare our rfc with a programming language rfc out on the web. See what sections are there and compare it ours then come bakc with the gaps. Dsipatch agents looking for 'invented the wheel' out here. Make sure you dont make a fool out of me when collegoues review this. Then we can make a plan formalizing the the iteration we just did, allowing for tweaks on the conepts we and defintion we have already done, cal upon exit if new conepts of deifntions will be needed. Yau name those things better. When assigned agent believe they can transform our entire corpus M1 is done. M2 should stipulate much harder tests. It cannot be too consty for agent of ohter brands to read the rfc and execute on large texts that has no structure. M3 We need to evaluate what we achieved if the rfc is too large or compolex we need to iterate again. You can setup thresholds alredeady RFC should probly be in oql as well," / "Not much of unti test if you fix our test subject beforehand" |
| D27 | Human | How should taxonomy levels, axiom selection, and placement work when evaluated with `uql`? | "Also i believe it was really hard to place rules correctly in our taxanomy and structure it right, how many levels, does principle, rratinoale, axiom manke sence , are axioms correctly shoosen, where does stuff belong? given our new tool could we test thi as well?" / "Actually there are more sublevels we just want to stop where where we had something close to testable and hard stop is (semgrep can enforce)" |

## Open questions

All open questions from Phase 2 are closed ([D6](#discussions)–[D26](#discussions)).

---

## Execution Plan

### Goal coverage

| Goal | Delivered by |
|---|---|
| 1 Declarative present-tense `uql` `Statement` grammar (EBNF), 5 mathematical invariants, 5-step algorithm, and concrete specialization ($S' \subset S$) for `Smells` | M1, M3 |
| 2 Plain-prose `Term`s with canonical `Id` and inflected/alternative `forms` compiled into `*.g.schema.json` | M1 |
| 3 Ordered `References` section (`[Label]: <URI> "Quote"` in `.md`, `anyOf`/`$ref` in JSON Schema) for cross-context disambiguation and offloaded verbatim quotes | M1, M2 |
| 4 Domain-neutral RFC examples, self-hosted `uql` within hard size/complexity budgets, full corpus transformation by subagent (M1), hard unstructured-text cross-model stress tests (M2), and complexity/self-hosting threshold audit (M3) | M1, M2, M3 |

### Running all tests

`./build.sh` at the repository root (existing script running `scripts/verify.sh` and `scripts/build_site.sh`).

### Milestone M1: Formalize `uql` RFC, Repository/Governance Schemas, and Full Governance Corpus Transformation by Subagent

Delivers: Goals 1, 2, 3, and M1 of Goal 4 (`schemas/repository/rfc.schema.json`, `schemas/repository/repository.schema.json`, `schemas/governance/ubiquitous-language.schema.json`, `schemas/governance/definitions.schema.json`, `docs/rfcs/0001-ubiquitous-language.md`, `docs/adrs/0011-ubiquitous-language.md`, and blind subagent transformation of `rules/*.yaml`).

Steps:

1. Open `docs/plans/domain-language-specification/progress/004-attempt-1-<YYYY-MM-DD>.md`.
2. Create `schemas/repository/rfc.schema.json` and add `rfcs` (`docs/rfcs/`) to `schemas/repository/repository.schema.json`.
3. Create `schemas/governance/ubiquitous-language.schema.json` and update `schemas/governance/definitions.schema.json` (`Prose`, `UbiquitousLanguage`, `Term` `forms`, and ordered `References`), updating `scripts/declared-ids.schema.sh` to emit expanded `Term` `forms` in `declared-ids.g.schema.json`.
4. Author `docs/rfcs/0001-ubiquitous-language.md` (using only domain-neutral examples, with zero examples from `rules/*.yaml`) and `docs/adrs/0011-ubiquitous-language.md` referring to `docs/rfcs/0001-ubiquitous-language.md`.
5. Dispatch a less-capable subagent (`flash`) given **only** `docs/rfcs/0001-ubiquitous-language.md` with the minimal instruction to transform our governance corpus (`rules/Definitions.yaml`, `rules/Rules.yaml`, `rules/Principles.yaml`, `rules/Rationales.yaml`, `rules/CodingPyramid.yaml`, `rules/Axioms.yaml`) into `uql`:
   - Refine existing `Term`s and `forms` in `rules/Definitions.yaml` as surfaced by the transformation.
   - **Exit condition**: If transforming the corpus requires introducing a new fundamental architectural concept not already in our taxonomy, halt immediately and return control to the human.

Checkpoint M1 verification: The delegated subagent transforms the entire governance corpus using only `docs/rfcs/0001-ubiquitous-language.md` with zero `UQL001`–`UQL007` diagnostics, and `./build.sh` exits 0.

### Milestone M2: Unstructured-Text Stress Tests and Cross-Model Cost/Efficiency Verification

Delivers: Goal 4 cross-model unstructured prose verification.

Steps:

1. Prepare three hard, unstructured prose test fixtures (under `docs/plans/domain-language-specification/tracer-bullets/unstructured-prose-stress/`):
   - Fixture A: A multi-page unstructured architecture essay containing heavy babble (restated definitions, throat-clearing clauses, and non-narrowing modifiers) plus inline URLs and quotes.
   - Fixture B: A requirements prose dump containing seeded lexical polysemy (`UQL002`), ambiguous pronouns (`UQL003`), and PP-attachment ambiguity (`UQL004`).
   - Fixture C: A multi-author policy document containing hidden logical contradictions (`UQL007`) across overlapping `Subject` and `Adverbial` conditions.
2. Dispatch a small/cheap subagent (`flash`) given **only** `docs/rfcs/0001-ubiquitous-language.md` and the unstructured fixtures, measuring:
   - Total tokens and turns consumed reading the RFC and executing the 5-step algorithm.
   - Recall and precision on stripping babble (`UQL005`, `UQL006`), extracting `References`, and reporting all seeded `UQL001`–`UQL007` diagnostics.
   - **Taxonomy Specialization & Stopping-Boundary Test**: Given a shuffled, unlabelled set of statements from our corpus (with `parent:` and tier labels stripped), test whether the subagent and `Term` specialization graph ($S_{\text{child}} \subset S_{\text{parent}}$) reconstruct the `parent` hierarchy, verify whether `Axioms` are independent and span all branches, and identify which branches need additional specialization sublevels to reach the **Agent-Testable Boundary** or cross the **Semgrep Static-Analysis Hard Stop**.
3. Refine `docs/rfcs/0001-ubiquitous-language.md` until the small subagent completes all unstructured and taxonomy-reconstruction fixtures in a single pass without looping.

Checkpoint M2 verification: The small subagent processes all three unstructured prose fixtures in a single pass ($\le 5$ tool turns, zero loops), detects 100% of seeded `UQL001`–`UQL007` errors, and reduces unstructured prose byte size by $\ge 50\%$ while preserving all falsifiable truth conditions.

### Milestone M3: Complexity, Size, and Self-Hosting (`uql`) Threshold Audit

Delivers: Goal 4 self-hosting and complexity gate on `docs/rfcs/0001-ubiquitous-language.md`.

Steps:

1. Audit `docs/rfcs/0001-ubiquitous-language.md` against four hard thresholds:
   - **Threshold 1 (Normative Core Size)**: `Reference-level explanation` (§§1–7) is $\le 1,200$ words and $\le 8,192$ bytes.
   - **Threshold 2 (Total RFC Size)**: Full `docs/rfcs/0001-ubiquitous-language.md` is $\le 2,500$ words and $\le 18,432$ bytes.
   - **Threshold 3 (Per-Statement Complexity)**: Every normative `Statement` in `docs/rfcs/0001-ubiquitous-language.md` is $\le 35$ words ($\le 220$ bytes) with $\le 1$ subordinate `Adverbial` clause.
   - **Threshold 4 (Self-Hosting in `uql`)**: `docs/rfcs/0001-ubiquitous-language.md` is itself written in valid `uql-md` (with its own bottom `## References` section and zero `UQL001`–`UQL007` diagnostics) and its 5 mathematical invariants are verified by a self-contained Z3 (`smt2`) tracer bullet in Docker (`docs/plans/domain-language-specification/tracer-bullets/z3-invariants/`).
2. If any of Thresholds 1–4 fails, iterate on `docs/rfcs/0001-ubiquitous-language.md` (and re-run M1/M2 verification) until all four thresholds pass.
3. Run `./build.sh` at the repository root and record the final checkpoint in the progress log.

Checkpoint M3 verification: All four thresholds (Normative Core $\le 1,200$ words / $\le 8$ KB, Total RFC $\le 2,500$ words / $\le 18$ KB, Per-Statement $\le 35$ words, and 100% self-hosted `uql-md` + Docker Z3 invariant proof) and `./build.sh` pass with zero warnings or errors.
