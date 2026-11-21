# 004 — Domain Language Specification

## Implementing Agent Instructions

Read this section first, and in full, before touching any code.

**No authoring of this plan.**
This plan is editable during planning until the human resolves all [Open questions](#open-questions) and approves the [Execution Plan](#execution-plan). Once implementation begins and progress is recorded under `progress/`, this plan is frozen: executing agents **MUST NOT** author, edit, rewrite, or amend `docs/plans/domain-language-specification/004-domain-language-specification.md`. If any conflict, ambiguity, or unexpected error arises during execution, stop immediately and return control to the human.

**Read before starting.**
This repository's rules, [`rules/Rules.yaml`](../../../rules/Rules.yaml), with the principles ([`rules/Principles.yaml`](../../../rules/Principles.yaml)) and definitions ([`rules/Definitions.yaml`](../../../rules/Definitions.yaml)) they rest on, published at <https://thruput.se/agents/>, [ADR 0002](../../adrs/0002-schema-validated-yaml-governance-documents.md), [ADR 0004](../../adrs/0004-schemas-and-taxonomy-published-to-the-web.md), [ADR 0005](../../adrs/0005-structure-is-described-in-json-schema.md), the research reports in [`research/ast-and-markdown-references/README.md`](research/ast-and-markdown-references/README.md) and [`research/json-schema-content-and-ast-validation/README.md`](research/json-schema-content-and-ast-validation/README.md), and this plan end to end. The rules outrank this plan; raise any conflict with the human instead of resolving it yourself.

**Scope.**
Implement only the milestones in the Execution Plan (to be drafted in Phase 3 after all Phase 2 open questions are closed), in order, with verification and git commit checkpoints at each milestone. Anything not in this plan is out of scope — stop and ask rather than extending it.

**Definition of done.**
Implementation is complete when every milestone's verification test passes, `./build.sh` at the repository root succeeds with zero warnings or errors, and every goal in [Goals](#goals) is delivered.

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

Everything in software development boils down to communication, and the introduction of AI makes this even more obvious. Natural English going back and forth creates the illusion of communication while conveying no shared meaning ([D3](#discussions)). To distinguish good software engineering from bad without ambiguity, our governance documents (`rules/Definitions.yaml`, `rules/Rules.yaml`, `rules/Principles.yaml`, `rules/Rationales.yaml`, `rules/CodingPyramid.yaml`) must be written in an explicit **domain language** where words carry formally defined meanings.

Today, we do not have a formal specification for that domain language ([D4](#discussions)):

1. **No formal grammar or lexical specification for `Prose`**:
   - Unlike a programming language (where every token is classified as a reserved keyword/operator, a literal, or a declared symbol, and any unmapped word is an `Undefined symbol` error), our `Prose` and `DefinedProse` schemas treat text as arbitrary English strings containing at least one `[[Id]]` substring.
   - As a result, a rule can contain a single `[[Term]]` while the rest of its sentence is written in unmapped, ambiguous English and still pass validation.
2. **Homegrown `[[Id]]` syntax and regex machinery**:
   - Instead of a language specification that defines how declared symbols (`Definitions.yaml` and taxonomy `Id`s), inflections, reserved grammar glue words, and code literals compose into valid statements, we invented a custom `[[Id]]` wiki-link syntax and a 200-branch regex alternation in `scripts/declared-ids.schema.sh`.
   - That regex machinery is blind to Markdown code spans (`inlineCode` / `code`), forces awkward suffixing (`[[Compatibility branch]]es`) or duplicate plural entries in `rules/Definitions.yaml` (`User`/`Users`, `Developer`/`Developers`, `Domain object`/`Domain objects`), and cannot tell whether a word outside `[[...]]` is mapped or unmapped.

### Goals

In priority order:

1. **Specify the Domain Language (`Prose`) formally in JSON Schema and an ADR**:
   - Define the lexical and structural specification of a valid statement in our domain language so that every token in `Prose` is deterministically classified into:
     1. **Declared Domain Symbols** (entries in `rules/Definitions.yaml` and taxonomy `Id`s, including how inflections/forms map to a symbol),
     2. **Reserved Grammar Keywords & Operators** (the closed set of normative RFC 2119 markers and structural English function words), or
     3. **Literals** (inline code spans `` `...` ``, fenced code blocks, numbers, and URLs),
     such that any token outside those three categories is specified as an **unmapped / undefined symbol**.
   - Express the domain language structure in JSON Schema Draft 2020-12 (`schemas/governance/definitions.schema.json` and `schemas/governance/rules.schema.json`) per [ADR 0005](../../adrs/0005-structure-is-described-in-json-schema.md).

#### Cheapest passing interpretation

| Goal | Cheapest way to "pass" while missing the point | How the goal excludes it | Accepted by |
|---|---|---|---|
| 1 | Write a prose essay or add `"contentMediaType": "text/markdown"` to `Prose` without specifying the closed grammar keyword set, symbol-mapping rules, and decoded AST/token schema that make an unmapped word an invalid instance | The specification is declared as JSON Schema (`contentMediaType` + `contentSchema` and supporting schema definitions) plus an ADR, where the closed set of reserved grammar glue words, literal node types, and symbol reference resolution against `#Id` / `#DefinitionId` are enumerated so every token has a deterministic classification | Pending human acceptance |

### Non-goals

- Implementing the domain language compiler, linter, or IDE integration (Problem 2 — explicitly deferred to a separate plan per [D4](#discussions) and [D5](#discussions)).
- Rewriting all existing governance prose in `rules/*.yaml` to pass the new compiler (belongs with Problem 2).
- Changing PR review runtime behavior in `tools/pr-review/`.

## Summary

Establish the formal specification for our domain language (`Prose`) in JSON Schema Draft 2020-12 and an ADR—defining how statements decompose into declared domain symbols (`Definitions.yaml` and taxonomy `Id`s), a closed set of reserved grammar keywords/operators, and code literals, and how explicit references are represented in Markdown—without building the compiler/linter tooling (Problem 2) in this plan.

## Assumptions, risks and preconditions

### Assumptions

| Assumption | Tested |
|---|---|
| JSON Schema Draft 2020-12 (`contentMediaType` and `contentSchema` together with `$dynamicRef: "#Id"` and `$dynamicRef: "#DefinitionId"`) can express the parsed structure of a domain-language statement without regex alternations | Verified in [`research/json-schema-content-and-ast-validation/README.md`](research/json-schema-content-and-ast-validation/README.md) |
| Markdown AST (`mdast` / CommonMark) cleanly separates `inlineCode` and `code` literals from natural-language text nodes | Verified in [`research/ast-and-markdown-references/README.md`](research/ast-and-markdown-references/README.md) |

### Risks

- If the specification of how inflected words map to `Definitions.yaml` symbols is either too implicit (relying on heuristic NLP guesswork) or too rigid (requiring duplicate definitions for every plural/verb form), the future compiler/linter will either have false positives or bloat `Definitions.yaml`.

### Preconditions

- Branch `004-domain-language-specification` is created from `origin/main` with a clean working tree.

## References

### Research questions

| Question | Answer | Evidence | Report |
|---|---|---|---|
| Why do flat-string regular expressions fail as a language specification for Markdown prose, and how does an AST representation solve it? | CommonMark gives `inlineCode` and `code` blocks higher precedence than links and text. Flat-string regexes have no lexical tokens and cannot distinguish literals, grammar glue words, and domain symbols. An AST separates literals (`inlineCode`, `code`), explicit references (`link` / `linkReference`), and word tokens. | CommonMark Spec §6; `mdast` specification | [`research/ast-and-markdown-references/README.md`](research/ast-and-markdown-references/README.md) |
| How does JSON Schema Draft 2020-12 (`contentMediaType` and `contentSchema`) specify the structure of parsed `Prose` without regex alternations? | `Prose` uses `contentMediaType: "text/markdown"` and `contentSchema` to specify the decoded AST/token structure, validating symbol references directly against `$dynamicAnchor: "Id"` and `$dynamicAnchor: "DefinitionId"` enums. | JSON Schema Draft 2020-12 Validation §8.4–8.5 | [`research/json-schema-content-and-ast-validation/README.md`](research/json-schema-content-and-ast-validation/README.md) |

## Rejected alternatives

| Alternative | Evidence | Reason for rejection | Discussion |
|---|---|---|---|
| Keep `[[Id]]` regex alternations in `declared-ids.schema.sh` and `DefinedProse` | `schemas/governance/rules.schema.json` only requires one `[[Id]]` per rule while leaving all other words unmapped; `declared-ids.schema.sh` generates 4,000-character regexes | Does not specify a domain language—allows arbitrary undefined English outside the single `[[Id]]` while forcing manual brackets and regex maintenance | [D1](#discussions), [D3](#discussions), [D4](#discussions) |
| Combine the language specification (Problem 1) and the compiler/linter implementation (Problem 2) in one plan | `# PLANNING` ("Name the problem, not the solution ... and cover one problem per plan") | Mixing specification and compiler/linter tooling in one plan violates single-problem focus | [D4](#discussions), [D5](#discussions) |

## Discussions

| Row | Decider | Question | Answer |
|---|---|---|---|
| D1 | Human | Why replace `[[Id]]` and the current `Prose` mechanism? | "we invented th [[]] and prose in order to be able to create refrences to text inside text, i believe we missed out on existing tooling to do this esecially if later json-schema provides a mechanism for doing this cleaner" |
| D2 | Human | What parsing model should be researched alongside JSON Schema? | "i want you to research that matter and want you to also researsd asd parser in this regard" |
| D3 | Human | What is the fundamental communication problem our governance documents are solving? | "Let me give it a try´: 1. Our documentation on our craft needs a very precise language. Everythign in software development boils down to communication. Introduction of AI makes this even more obvious. We waste years trying to make them follow our wishes but we all fail, productivity never reached but during short glimpses. The potence of productiviity is enourmous only blocker is communication. These documents are my take on being able to describe good from bad. I know how effective good is and how ineffective bad is. We believe we can communicate since english goes back and fourth but is all just faked. Meaning is not conveyed at all. In order to convey meaning we need a languga. English is not the lnaguage. It is the domain language we need to establish here. A domain language where we need to bring meaning to our words so that we understand each other." |
| D4 | Human | How does that break down into distinct problems? | "Ibelieve you just did a little of it. The practically of it. If i write a rule somehow it has to be translated and i need to knwo if something is not "mapped". Just like when i write code i want everything to "syntax" an undefined variable shuold give an error an IDE should help me select from lists etc. We cannot reached there today. So problem 1 is that we dont have a spec for our language. Like we did not decide on javascript or python. Atfger that we need a compiler, linter etd as well that problem 2." |
| D5 | Human | Should Plan `004` cover only the specification (Problem 1)? | "Lets follow our rules, breaking them will make this effort blow up and dissapear, focus is my weak point and you are constructed to lead astray, lets follow them, only specification" |

## Open questions

1. **How are domain symbols recognized in the language specification?**
   - **Option 1A (Explicit syntax on every symbol)**: Every domain symbol in `Prose` is written with explicit Markdown link/reference syntax (e.g. `[Purpose]` or `[domain objects][Domain object]`), and everything outside brackets must belong to the closed list of reserved grammar glue words or backtick code literals.
   - **Option 1B (Implicit symbol recognition from `Definitions.yaml` declarations)**: Words and multi-word phrases in `Prose` are matched directly against declared symbols in `Definitions.yaml` (and taxonomy `Id`s) without brackets in the source text, leaving only unmapped words that are neither declared symbols nor reserved grammar glue words as `Undefined symbol` errors.
2. **How does the specification handle inflections (plurals, verb tenses) of a declared symbol?**
   - **Option 2A (Explicit forms declared on the symbol in `Definitions.yaml`)**: Each definition in `Definitions.yaml` has its canonical `id` (e.g. `Domain object`) and an optional `forms` / `aliases` array (or standard English plural/verb inflection rules specified deterministically) so there are never duplicate definitions (`Domain object` vs `Domain objects`) and zero ambiguity about which forms map to which symbol.
   - **Option 2B (Explicit reference syntax `[inflected text][Canonical Id]`)**: Inflections are written in the text and mapped explicitly to the canonical `Id`.
3. **Should the reserved grammar glue words (closed-class English connectors like `a`, `the`, `is`, `in`, `must`, `not`) be declared in a schema/YAML file in the repository (`schemas/governance/` or `rules/`), or specified in the `Prose` schema itself?**
4. **How strictly must `Prose` vs. `DefinedProse` be mapped?**
   - Does **every** `Prose` string across the repository require 100% of its non-glue, non-literal words to map to a declared symbol, or does `DefinedProse` (normative rule/definition bodies) require 100% symbol mapping while descriptive fields (like `rationale`, `examples`, or plan prose) allow free text with validated symbol references?
