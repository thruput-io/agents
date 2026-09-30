# 001 — Level criteria

|                |                                                     |
|----------------|-----------------------------------------------------|
| Plan           | `docs/plans/level-criteria/001-level-criteria.md`   |
| Branch         | `yaml-governance-documents`                         |
| Started        | 2026-09-26                                          |
| Supersedes     | —                                                   |
| ADRs consulted | ADR 0001, ADR 0002                                  |
| ADRs added     | —                                                   |
| Status         | draft                                               |

## Background

The taxonomy in `framework.yaml` has six levels. Levels 1 to 5 each carry one include criterion inherited from the old `rule` field, and no exclude. Only level 6 has criteria written against real content. Without sharp criteria, every statement from the old `RULES.md` is placed by taste, and the placements do not cohere.

### Goals

1. Every level has include and exclude criteria that decide, for any statement from the old `RULES.md`, exactly one level.
2. Every statement from the old `RULES.md` is placed at its level, linked to its parent, and validated.
3. The result is cohesive: every entry below the root has a parent that exists one level up.

## Execution Plan

1. Write the criteria for levels 1 to 5 into `framework.yaml`. Test them on ten statements sampled from `RULES.md`; adjust until each sample lands on exactly one level.
2. Classify every heading of `RULES.md` with the criteria into a table: statement, level, parent. No file changes yet.
3. Apply the table: move, rewrite, or split entries; set parents; standards get a context. Run `./build.sh validate` after each level.
4. Check cohesiveness: no entry points at a missing parent, no principle without a rule under it, no rule without a principle above it, nothing left at level 5 that names a technology.

Verification: `./build.sh validate` passes after every step.

## Placements decided

Verdicts given by the human during step 1. The criteria must reproduce these.

| Statement from RULES.md | Level | Note |
|---|---|---|
| Parse, don't validate | principle | |
| Immutability | principle | |
| No suppressed exit status | split | rule without the shell syntax; standard `\|\| true`, context Bash |
| No global lint changes | split | rule without the file names; standards per tool |
| No code over maybe-necessary (PREFER) | rationale | PREFER, "X over Y", is a trade-off |
| Respect layering | rule | nothing needs rephrasing |
| Refactor over mocking (SHOULD, "over") | rationale | confirmed; pushed down, the smell is faking to make code testable, not mocking itself, which in the best case is how one subject under test is reached |
| Domain primitives | principle | the word "Domain" may be dropped; a rule under it: No primitives in our signatures; needs a rationale under Simplicity |
| Parse, don't validate | principle | needs rework in both directions: a rationale above, rules below |
| Immutability | principle | a word alone is not a principle; needs a rationale under Simplicity |
| Optionality | principle | same as Immutability; belongs under Simplicity |
| Great software is easily tested | rationale or principle | asking why leads to Users Prove Correctness or Shift Left, so not an axiom |
| Great software is easy to maintain and extend | axiom, to retest | apply the same why test; stays only if the why is a value |
| Quality Uncompromised, the ten quality axes | to decide | axes are either a rationale about quality or, a few of them, axioms |
| Be pragmatic, not dogmatic | rationale, reworded | not a license; a weighing of simplicity against guardrails, decided by the parent above it. Example: three lines become a thousand once automated with pipelines and test dependencies; the linting this taxonomy generates will grow the same way, and the parent decides when a guardrail is dropped |
| A conflict between a principle and a result is a question asked wrong | rationale | either the principle or the definition of result is defective, or something else is; the conflict is a smell of the taxonomy itself |
| Dogmatic, with the trail of why intact | principle | every rule traces to a rationale and a value; the stance this taxonomy serves |
| Broken windows, the Pandora's box effect | rationale | why a rule is never loosened now and then; Wilson and Kelling 1982 |

## Rules of application

- Split: a statement that names a technology and still holds an instruction without it becomes a rule and a standard.
- Pairing: a principle without a rule under it, or a rule without a principle above it, is a gap.
- Reword before placing: a statement is placed as worded; if the wording hides what it means, it is reworded first.
- Reference material fills gaps and rewords existing definitions to be sharper. It does not widen the extent of the taxonomy. A statement from a reference is taken in only where a pairing gap calls for it, or lends its wording to an entry we already have.

## Step 2: all 83 rules placed by the criteria

Entries not listed stay rules (55).

- To principle: Illegal states are unrepresentable; Parse, don't validate; Domain primitives; Immutability; Strict domain modeling; Industry standards; Fail fast; No collateral harm.
- To rationale: No code over maybe-necessary; Opaque types; Typestate; Separation over brevity; Fix over mute; Ask over hack; Implement Comparable (also a standard for Java); Refactor over mocking; Setup pain as feedback.
- Split into rule and standards: No suppressed exit status; No discarded diagnostics; Scripts abort on error; No global lint changes; No global quality changes; No disabling via pragma; Strong typing; Compile-time optionality; Creation failure in the signature; No comments in code (its exemption list).
- Merge as duplicates: No learnt-pattern retreat into Demonstrable, not recalled; Shift left verifications into Shift Test Left; Setup pain as feedback into Refactor over mocking.
- No collapsed layers: no one can name the smell it forbids, so it is not a rule. Either rejected, or reworded to state its smell, in which case the conflict with "reject layers that hide no complexity" dissolves: one forbids removing a layer that hides something, the other forbids adding a layer that hides nothing.
- Thin criteria: Sum types, Enums for domain states, Consistent with the codebase stay rules by "visible in a small context"; to be challenged.

## The axiom level, decided

Kept. Our axioms are the stone tablets: fundamental truths held beyond argument, which cannot be moved down the ladder. The criteria that failed them were wrong and are replaced: an axiom may state the mechanism that makes it true, and being arguable with a trade-off is not an exclude. Great software is easy to maintain and extend still takes the why test, since "follows from another axiom" remains an exclude.

## Cohesiveness checks

- A principle with no rule under it marks a gap in the framework. A rule with no principle above it marks the same gap from below.
- A rationale whose weighing its parent cannot decide marks a defect in the parent: the level above must state what we are after abstractly enough to decide it.

## Reference material to consume

- The "Who We Are" document, https://thruput.se/how-we-work.html. The four core values are consumed as level 1. Still to place: the manifesto items (Test-First Mandate, Radical Reproducibility, Own the Runtime) and the five daily commitments. The sentence cut from Speed Through Discipline, "skipping tests, security, or rigor in automation and reproducibility is technical debt", is the rationale under it.
- The handbook repository's `references/` directory, which holds the interface design statements placed during step 1, among others.
- `PHILOSOPHY.md`, placed by the criteria: "quality is always the highest priority" is an axiom with its "because" as a rationale; the ten quality axes are glossary definitions; each "X over Y" pair is a rationale and each right-hand side a smell wanting a rule; "Strictness" is a glossary term and its paragraph the rationale for principle, smell, rule; the seven excuses are one principle, a stance with its cases enumerated, beside Durable Intent Over Comments, which has the same shape. Gaps: no value above the axiom; Quality Uncompromised holds axiom, rationale, and glossary in one body; ten smells without rules; Strictness undefined.

## Definitions needed

Terms used by entries above that have no glossary entry yet, or whose entry must be revisited.

- Purpose
- WHY, exists, revisit together with Purpose
- Domain primitive, exists, decide whether it becomes Primitive
- Signature
- Core value: the four level 1 entries are core values, and the level Value's specification does not say so; sharpen it. Speed Through Discipline was Efficiency Through Discipline, renamed for an unwanted association; the homepage texts are for another audience and are replaced by the value statements.
- Code smell: needs a place to live. Smells are the only way of making principles detectable via rules.
- Framework smell: a felt conflict between a principle and a result, pointing at a defect in the taxonomy. Needs a name once "framework" is renamed.
- Common sense: a weighing left unstated because it felt self-evident. The antithesis of this taxonomy. An entry justified by common sense has a missing rationale; a framework smell.

### Core Quality Definitions

#### Purpose
The stated reason for a change, component, or system, expressed as the benefit it delivers to [[Users]]. Purpose is measured in benefit to users, not to developers. Code is a subset of its Purpose: every part of the code traces to a part of the Purpose, and no part of the code reaches outside it.

#### WHY
Alias for [[Purpose]].

#### Users
Whoever consumes the software or system to fulfill a need: human end users, operators, external systems, or AI agents. Developers who write, call, or maintain the code are not users.

#### Great Code
Code that avoids a [[System Failed State]].

#### Bad Code
Code that drives the system toward a [[System Failed State]].

#### Accuracy
The degree to which the system does what [[Users]] need.

#### Inaccurate
The state where system behavior, calculations, or outputs diverge from what [[Users]] need, failing to fulfill their intended outcome.

#### System Decay
The progressive transition of a software system from a healthy state into one or more [[System Failed State]]s, caused by the accumulation of [[Bad Code]].

#### System Failed State
A non-operational state the software transitions into when bad code accumulates.

##### Velocity Stagnation
A [[System Failed State]] where the codebase becomes so complex or fragile that the team can no longer deliver value at a sustainable pace.

##### Regression Cascades
A [[System Failed State]] where fixing one bug consistently introduces new, unrelated bugs elsewhere in the application.

##### Knowledge Dissipation
A [[System Failed State]] where the codebase can still run, but no active team member understands how or why the core logic works.

##### Deployment Paralysis
A [[System Failed State]] where code changes are complete, but the system cannot be safely or reliably shipped to production due to brittle infrastructure, flaky tests, or massive merge conflicts.

##### Value Failure
A [[System Failed State]] where the system becomes [[Inaccurate]], failing to do what [[Users]] need. Code defects and wrong state transitions are classified as bugs, whereas Value Failure is inaccuracy in serving user needs.

## Decided on 2026-09-27

- Every entry shares one base, `schemas/entry.schema.json`: a value is a root entry with id and body; every other entry has id, body, and parent, and each level narrows its parent to the level above.
- A principle's parent is always a rationale, never an axiom.
- Every axiom's parent is a value; the values are complete, so there is no placeholder value. Single Source of Truth and Shift Left under Speed Through Discipline; Simplicity and Users Prove Correctness under Outcome Over Output; Great software is easy to maintain and extend under Joy Through Craft.
- Not Yet Decided Axiom and Not Yet Decided Principle are removed. The rule Filling gaps is retired: it describes how to read the taxonomy and cannot be checked in a diff.
- The glossary lives in `definitions.yaml`, apart from the taxonomy. Great Code is an alias for Great Code; ADRs is an alias for Architectural Direction.

## References checked by the schemas

Decided on 2026-09-27, to be done by [[Shift Left]]: a reference that names no entry, or an entry of the wrong level, fails at the leftmost rung, in the schemas themselves.

- Generic entry: `entry.schema.json` types `parent` as `$dynamicRef: "#ParentId"`, and each level schema binds `$dynamicAnchor: ParentId` to the id type of the level above, replacing the per-level override of `parent`.
- Concrete id types: each level's id type is the closed set of ids it declares, an `enum`, so a parent that is not an existing entry of the level above fails.
- Ids declared once: each document is keyed by id and constrained by `propertyNames` referring to its level's id type, so a key outside the declared set fails and a key cannot repeat. Decide how an id declared without an entry is caught.
- `[[Id]]` references in prose resolve against the declared ids.
- First prove it in the pinned Sourcemeta image with a generic entry, two levels, one valid and one broken parent, and check whether the CLI supports anything newer than 2020-12.

Evidence gathered: [learnjsonschema.com on `$dynamicRef`](https://www.learnjsonschema.com/2020-12/core/dynamicref/), [`propertyNames`](https://www.learnjsonschema.com/2020-12/applicator/propertynames/), [`uniqueItems`](https://www.learnjsonschema.com/2020-12/validation/uniqueitems/), and the [Sourcemeta resolution guide](https://github.com/sourcemeta/jsonschema/blob/main/docs/guides/resolution.markdown).

## Principles awaiting a rationale

Thirteen principles point at a rationale drafted from [research/rationale-sources](research/rationale-sources/rationale-sources.md); each rationale carries `solutions`, SHOULD or MAY only, positively phrased, never restating a principle. A weak solution is left out.

- Quality Uncompromised (Not Yet Decided Axiom): dissolves in the split of level 4 into an axiom candidate, glossary axes, and value pairs.

Weighing between principles does not belong in the taxonomy: it happens per case, with named strategies, in the review of the review, and its outcome is a decision recorded in a PR or an ADR.

## Parked

Ideas raised during the pass, to be taken after it. Add, do not act.

- One sentence settling how `Generic parameters, specific returns` coexists with `Domain-only interfaces`.
- Reword README's "When a rule's application or priority is in doubt, apply the principle it guards": priority involves two rules, and the parent chain decides.
- Repository schema in use: project a repository's file tree onto `schemas/repository.schema.json` and validate it in a PR check; filter ADRs written before the check by date.
- Move the schemas to the central schema repository.
- Break recurring terms in rule bodies, such as Code We Cannot Control, into `[[glossary]]` references.
- Rename the ADR 0002 file to match its title.
- Rename `framework.yaml`: "framework" is taken by software frameworks, named in rules and in the term framework smell.
- Enable GitHub Pages in repository settings, source GitHub Actions.
- Levels as real data: levels read from `framework.yaml`, to remove the singleton trap. The shared entry schema is in place.
- Whether `context` on standards becomes a closed set of technologies.
- Decide on `.idea/`.
- A formatter for the YAML documents in the build, so every document has one layout, blank lines between entries included, and a deviation fails validation.
