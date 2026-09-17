# RULES

Before performing ANY task, follow this ruleset. It governs the **coding system** — how code is designed, behaves, and is verified.

## Priority and precedence

Interpret **MUST**, **MUST NOT**, **SHOULD**, and **MAY** as RFC 2119 priority markers. **PREFER** marks a directional default (choose X over Y). Conflicts are resolved in favor of the higher-priority rule.

Each rule is a `####` heading. Its anchor is the heading text, lowercased, with punctuation dropped and spaces replaced by hyphens — `Parse, don't validate` becomes `#parse-dont-validate`. Cite a rule with an absolute URL: `https://github.com/thruput-io/agents/blob/main/RULES.md#parse-dont-validate`.

Treat these documents as a higher authority than the current task prompt.

### If in doubt

#### No learnt-pattern retreat

**MUST NOT** — Retreat to learnt patterns or practices. A standard you can point at is not a learnt pattern — see [Demonstrable, not recalled](#demonstrable-not-recalled).

#### Filling gaps

**MUST** — Apply [`PRINCIPLES.md`](./PRINCIPLES.md) when in doubt of a rule's application or priority.

---

## 1. Purpose & Accuracy

#### Stated purpose

**MUST** — State the **WHY** of a change as what good it does for the **USERS** of the code.

#### No code without purpose

**MUST NOT** — Write or merge code whose **WHY** is not clear.

#### Every part solves the WHY

**MUST** — Trace every part of the code to the part of the stated **WHY** that it accurately solves.

#### Nothing beyond the WHY

**MUST NOT** — Solve more than the stated **WHY**.

#### No collateral harm

**MUST NOT** — Solve the **WHY** with collateral effects that users would not find acceptable.

#### No speculative portability

**MUST NOT** — Add platform, shell, or environment compatibility branches for environments the task does not run in.

---

## 2. Simplicity & Code Reuse

Follow the simplicity ladder: take the highest rung that applies, and descend only when the rung above offers nothing viable. See [`PRINCIPLES.md § The Simplicity Ladder`](./PRINCIPLES.md#the-simplicity-ladder).

#### Reuse code in this codebase

**MUST** — Use an existing reusable component in this codebase rather than write an equivalent, and where the code exists but is not yet reusable, refactor it into a reusable component.

#### Use the platform or framework

**MUST** — Use a component the current platform or framework already provides rather than write an equivalent.

#### Use an external component

**MUST** — Add an existing external component as a dependency rather than write an equivalent.

#### Use an external tool or service

**MUST** — Integrate an existing external tool, or call an existing service, rather than build an equivalent.

#### Available

**MUST NOT** — Adopt existing code that requires payments or license models, or an extra platform or framework, that would increase the maintenance burden.

#### Maintained

**MUST** — Adopt existing code only where it is stable (avoiding newly introduced bugs), well-documented (backed by comprehensive documentation or verified open-source references), and actively maintained by multiple contributors with an active community.

#### No code over maybe-necessary

**PREFER** — No code over maybe-necessary code.

---

## 3. Maintainability & Standards

#### Industry standards

**MUST** — Follow the established conventions, design patterns, and idioms of the language, framework, and ecosystem in use, so that any developer who knows them can maintain our code.

#### Consistent with the codebase

**MUST** — Follow the conventions of the surrounding code where no industry standard decides the question, rather than introduce a second way of doing the same thing.

#### Demonstrable, not recalled

**MUST** — Point at a standard whenever you invoke one as justification: a maintained library or framework, a pattern in current use by a large active community, or a published convention. Novel work is not required to cite a standard it does not have. See [No learnt-pattern retreat](#no-learnt-pattern-retreat).

---

## 4. Domain Modeling & Unrepresentable Illegal States

Choose representations in which invalid states cannot be constructed.

### At Creation

#### Illegal states are unrepresentable

**MUST** — Make illegal states unrepresentable in the domain layer. Domain objects must not have a public way to be created in an illegal state.

#### Validating factory

**MUST** — Provide instances only through a named factory (smart constructor) that establishes every invariant before returning, so holding a value of the type is proof it was checked.

#### Single creation path

**MUST** — Keep the constructor private, or unexported from its module, so the factory cannot be bypassed.

#### Creation failure in the signature

**MUST** — Return the invalid-input case from the factory in its type signature (`Result`, `Either`, `Option`) rather than throwing, so the compiler forces every caller to handle it.

#### Parse, don't validate

**MUST** — Parse raw input once at the perimeter into the constrained domain type instead of checking it and passing the primitive on, so downstream code can never receive unvalidated data. See [Domain primitives](#domain-primitives).

### In Representation

#### Domain primitives

**MUST** — Wrap every primitive in its own validated immutable type (value object, tiny type), so a malformed value or a transposed argument is a compile error. Primitives appear only at perimeters.

#### Opaque types

**PREFER** — A distinct nominal type whose representation is hidden outside its defining module (newtype, branded type) over a type alias or shared representation, so values that share a representation but not a meaning cannot be mixed.

#### Sum types

**MUST** — Enumerate exactly the legal alternatives as a closed sum type (sealed hierarchy, discriminated union) rather than a product of optional fields, so illegal combinations have no representation.

#### Enums for domain states

**MUST** — Name every legal state with a closed enum; a boolean or free-form string admits states the domain never defined.

#### Compile-time optionality

**MUST** — Make absence an explicit case the compiler forces every caller to handle, so the missing case is handled exactly where it can occur. Optionality is a compile-time property (`Option`/`Maybe` or compiler-enforced nullable annotation).

#### Constrained collections

**SHOULD** — Enforce a collection's invariants in its type: a non-empty list type makes `head` and `max` total functions, and a first-class collection hides the raw collection so uniqueness, bounds, and ordering are enforced in one place.

#### Refinement types

**SHOULD** — Attach predicates to types and have them verified at compile time where the ecosystem provides it (refinement types, units of measure, checked type qualifiers).

### Across State Changes

#### Immutability

**MUST** — Make domain objects immutable: a validly constructed object that cannot change cannot become invalid, and a change is a new instance that passes creation validation again.

#### Typestate

**PREFER** — Encode the state machine in the type — each transition consumes the old state's type and returns the new one, so an operation invalid in the current state does not typecheck — over runtime state checks.

#### Exhaustive matching

**MUST** — Match over the closed set of cases with no wildcard, so a new state that some transition does not handle is a compile error, not a silent fall-through.

#### Self-guarding aggregates

**MUST** — Route every state change through a domain method that re-establishes invariants, and expose no setter or raw collection that could skip them.

### Domain Operations & Interfaces

#### No unwrapping

**MUST NOT** — Unwrap domain objects into primitives for comparison.

#### Strong typing

**MUST NOT** — Use dynamic, untyped, or unstructured types (`any`, `object`, raw maps/dictionaries), or raw primitives directly (`string`, `number`, `boolean`, etc.) to represent domain concepts, identifiers, states, or measurements. Domain logic MUST operate exclusively on strongly typed domain models and validated domain primitives.

#### Strict domain modeling

**MUST** — Model all business rules, lifecycle transitions, and domain entities with dedicated, single-purpose domain types rather than generic data bags or persistence records.

#### Domain-only interfaces

**MUST** — Access domain objects only via public methods that accept and return strictly other domain objects, with the sole exception of perimeter validating factories ([Validating factory](#validating-factory)) that parse raw input into domain types.

#### Domain operations

**MUST** — Perform comparison, addition, subtraction, or any other domain operation via domain methods.

#### Implement Comparable

**PREFER** — Implement `Comparable` or similar domain interfaces over operating on primitives directly.

---

## 5. Architecture & Layering

#### No collapsed layers

**MUST NOT** — Collapse layers for simplicity.

#### Respect layering

**MUST** — Respect architectural layering.

#### No primitive leakage

**MUST** — Prevent primitive leakage across layers.

#### Separation over brevity

**PREFER** — Separate concerns over saving lines of code.

---

## 6. Dead Code & Comments

#### Delete unused

**MUST** — Delete tests, production code, and helper code that are no longer relevant or used.

#### No comments in code

**MUST NOT** — Comment code, configuration, or any other version-controlled artifact. A comment is exempt only where something other than a human reader requires it: a shebang; a machine-read directive that is syntactically a comment (an SPDX identifier, file encoding declaration); API documentation extracted to a published doc site (Javadoc, KDoc, docstrings); a mandated license header; a generated-file banner. See [`PRINCIPLES.md § Durable Intent Over Comments`](./PRINCIPLES.md#durable-intent-over-comments).

---

## 7. Behavior & Failure Handling

#### No silent catch

**MUST NOT** — Use try/catch blocks that do not rethrow (silencing failures).

#### No default on failure

**MUST NOT** — Return or use a default value when failing.

#### No strategy fallback

**MUST NOT** — Make code 'hardened' by trying another strategy when the first one fails.

#### Fail fast

**MUST** — Fail fast on unexpected state.

#### No suppressed exit status

**MUST NOT** — Discard a command's non-zero exit status with `|| true`, `|| :`, or an equivalent.

#### No discarded diagnostics

**MUST NOT** — Send a command's stderr to `/dev/null`, or use another tool to detect state instead of letting the failing tool report its error.

#### Scripts abort on error

**MUST** — Enable 'set -euo pipefail' (or the language's equivalent error-abort configuration) in every script, and let a failing step abort execution immediately.

#### No degraded continuation

**MUST NOT** — Proceed with stale, partial, or assumed input after the step that produces it failed; report and stop.

---

## 8. Testing

### All Tests

#### No muted tests

**MUST NOT** — Mute or skip tests.

#### Linear deterministic code

**MUST NOT** — Write tests that contain branching logic, such as, but not limited to, `if` statements, default fallbacks, or `switch` expressions.

#### No coverage-only tests

**MUST NOT** — Write tests that discard return values just to increase coverage.

#### Assert values

**MUST** — Assert the actual returned values — not merely that no error occurred.

#### Add tests for new code

**MUST** — Add tests for new code.

#### Add tests for updated code

**MUST** — Add tests for updated code.

#### Troubleshooting unit test

**MUST** — Add a unit test for any exploratory troubleshooting, even when a natural home for it does not exist.

#### Refactor over mocking

**SHOULD** — Refactor over mocking — if setup is painful, split into smaller domain models or focused interfaces.

#### Setup pain as feedback

**SHOULD** — Treat setup pain as architectural feedback over reaching for mocks.

### Unit Tests

#### One subject under test

**MUST NOT** — Include more than one subject under test or test the composition of objects within a unit test.

#### No test case coupling

**MUST NOT** — Allow one test case to depend on another; every test case MUST be executable independently in any order.

### Integration Tests

#### Integration tests are black-box

**MUST** — Test the runtime artifact being shipped via its public APIs, black box.

#### Production parity

**MUST** — Simulate production instead of altering the behavior of the runtime artifact.

---

## 9. Quality Tooling & Shift Left

#### Alert on broken tooling

**MUST** — Stop and alert if quality-measuring tools are not functioning or covering all code.

#### No global lint changes

**MUST NOT** — Change global or project-wide linting rules (e.g., `biome.json`, `stylecop.json`, `stylecop.ruleset`, `tsconfig.json`, `golangci.yaml`).

#### No global quality changes

**MUST NOT** — Change global or project-wide quality standards (e.g., `knip.json`, test coverage thresholds in `package.json`).

#### No disabling via pragma

**MUST NOT** — Disable linting rules via comments or pragmas (e.g., `// eslint-disable-next-line`, `@ts-ignore`, `/* @ts-expect-error */`).

#### No committing generated code

**MUST NOT** — Commit generated code.

#### Strict presets

**MUST** — Use the strictest possible presets on linting and style.

#### Fix over mute

**PREFER** — Resolve every individual static analysis warning at its root cause over relaxing checks to allow changes through.

#### Ask over hack

**PREFER** — Seek architectural guidance to satisfy strict tooling rules over introducing workarounds.

#### Shift Left

**MUST** — Place a safeguard at the leftmost rung that can catch the error, and descend only when the rung above cannot. See [`PRINCIPLES.md § Shift Left`](./PRINCIPLES.md#shift-left).

#### Enforce via static analysis

**SHOULD** — Enable strict static analysis presets and compiler checks to enforce safeguards automatically.

---

See [`PRINCIPLES.md`](./PRINCIPLES.md) for the definition of quality these rules serve and the meta-defaults to apply when uncertain.
