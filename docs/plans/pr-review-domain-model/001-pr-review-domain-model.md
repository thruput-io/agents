# Replace pr-review scripts with a schema-derived Zod domain model

## Implementing Agent Instructions

Each step below is atomic. Run the step's verification command before moving on. If any command produces an unexpected
result, stop and hand back to the human.

Before starting:

1. Read `GEMINI.md` or `CLAUDE.md`, whichever is in your instructions, and follow the reading sequence it names:
   `Definitions.yaml`, `Principles.yaml`, `Rules.yaml`, `WORKFLOW.md`.
2. Activate the `fulfill-rules` skill and load the Semgrep JavaScript rules from
   `/Users/Shared/workspace/semgrep/javascript/rules/`.
3. Follow `WORKFLOW.md`: verify the working tree is clean (`Clean before a large task`), pull `main`, and branch from
   `origin/main` (`Not on the main branch`). Never commit to `main`.

## Background

In [ADR 0005](../../adrs/0005-structure-is-described-in-json-schema.md), JSON Schema Draft 2020-12 was chosen as the
single contract language for every boundary shape in this repository. In
[ADR 0006](../../adrs/0006-diffs-are-described-in-a-schema-of-our-own.md) and PR #23, the review domain contracts were
extracted into 17 composable Draft 2020-12 schemas under `schemas/review/`:

- `pull-request.schema.json` (`PullRequest`, `Host`, `GitHub`, `AzureDevOps`, `Git`, and 10 domain primitives)
- `lines.schema.json` (`Lines`, `NumberedLines`, `RemovedLines`, `RemovedContent`, `Side`, `LineNumber`, `LineText`, `LineRange`)
- `change-set.schema.json` (`ChangeSet`, `Commit`, `Path`, `ChangedFile`)
- `fragment.schema.json` (`Fragment`, `SurfaceFragment`, `ContextFragment`)
- `surface.schema.json` (`Surface`)
- `checkout.schema.json` (`Checkout`)
- `review.schema.json` (`Review`, `LedgerFile`, `ReportCommand`)
- `rulebook.schema.json` (`Rulebook`, referencing `schemas/governance/Rules.schema.json`)
- `agent-instructions.schema.json` and `instructions/{context,dead-code,reuse,rules}.schema.json`
- `threads.schema.json` (`Threads`, `Thread`, `ThreadId`, `ThreadState`, `ThreadBody`)
- `violation.schema.json` (`Violation`, `Observation`, `Anchor`, `SurfaceAnchor`, `PullRequestAnchor`)
- `ledger.schema.json` (`Ledger`, `Row`, `RulesetUrl`, `Verdict`)
- `outcome.schema.json` (`Outcome`, `ReviewVerdict`, `Summary`, `InlineFinding`)

However, the existing scripts under `skills/pr-review/scripts/` (`lib.mjs`, `prepare.mjs`, `check.mjs`, `review.mjs`,
`github.mjs`, `azure-devops.mjs`, `git.mjs`, `shell.mjs`, and their `*.test.mjs` files) predate the domain schemas and
violate the repository's rules and principles across four axes:

1. **File size and mixed concerns (`[[File too large]]`, `[[Separation of Concerns]]`):** `lib.mjs` is 414 lines and
   `lib.test.mjs` is 379 lines, exceeding the 200-line ceiling enforced by Semgrep rule `max-file-lines`.
2. **Primitive Obsession and Loose Types (`[[No Primitive Obsession]]`, `[[Wrap primitives]]`, `[[Strong typing]]`,
   `[[Make illegal states unrepresentable]]`):** Every script operates on unencapsulated plain objects, raw strings,
   numbers, and arrays (`{ start, end }`, `{ headCommit, files }`, `wholeSurface`, `narrowSurface`, `fragments`,
   `outcome`). Domain concepts have no classes, no private constructors, no validating factories, and no domain methods.
3. **In-place Mutation (`[[Immutable by default]]`, `[[No mutators]]`, `[[Self-guarding aggregates]]`):** `lib.mjs`
   mutates objects and arrays in place (`last.end = line`, `last.content = ...`, `last.lines[number] = text`,
   `numbered[currentNewLine] = ...`), which violates `[[No mutators]]` and Semgrep rule `no-mutators`.
4. **Validation without Parsing (`[[Parse, don't validate]]`, `[[Fold at Perimeter]]`, `[[Shapes live in the contract]]`,
   `[[No second representation]]`):** `prepare.mjs`, `check.mjs`, and `review.mjs` spawn child processes running
   `npx --yes @sourcemeta/jsonschema@17.0.0 validate` against files on disk and then `JSON.parse(...)` raw data bags that
   flow unchecked through the application, instead of deriving Zod schemas from `schemas/review/*.schema.json` and
   folding raw inputs at the perimeter into immutable domain objects.

## Goals

1. **Derive Zod validators from the JSON Schema contracts (`[[Shapes live in the contract]]`,
   `[[No second representation]]`, `[[No committing generated code]]`):** Generate/derive Zod v4 (`zod@4.6.7`) contract
   schemas directly from `schemas/review/*.schema.json` and `schemas/governance/Rules.schema.json` during `build.sh`
   into a gitignored directory (`skills/pr-review/scripts/.generated/`), eliminating duplicate shape definitions in code
   and eliminating runtime `npx @sourcemeta/jsonschema` subprocess calls.
2. **Replace raw data bags with an immutable domain model (`[[Domain object]]`, `[[Encapsulated type]]`,
   `[[Domain primitive]]`, `[[Validating factory]]`, `[[Private constructor]]`, `[[Creation failure in the signature]]`,
   `[[Immutable by default]]`, `[[No mutators]]`, `[[No unwrapping]]`, `[[Domain-only interfaces]]`,
   `[[Domain operations]]`, `[[Sum types]]`, `[[Enums for domain states]]`, `[[Exhaustive matching]]`):** Model every
   review concept in `schemas/review/` as an immutable, frozen domain type with private fields (`#...`), an unexported
   constructor guarded by a module-private `Symbol`, a named factory (`fromRaw` / `create`) returning a closed `Result`
   sum type (`Ok` / `Err`) in its signature via Zod `.safeParse()`, exhaustive `.match()` pattern matching without
   `default:` branches, and `toContract()` only for outbound perimeter serialization.
3. **Enforce strict layering and perimeter folding (`[[Respect layering]]`, `[[Fold at Perimeter]]`,
   `[[No primitive leakage]]`, `[[No optionality]]`, `[[Forced optionality at perimeter]]`, `[[Fail fast]]`,
   `[[Scripts abort on error]]`):** Organize `skills/pr-review/scripts/` into `domain/` (pure domain objects and
   primitives), `contracts/` (Zod perimeter codecs derived from `.generated/`), `adapters/` (`github.mjs`,
   `azure-devops.mjs`, `git.mjs`, `shell.mjs`, `fs-store.mjs`), and thin CLI entrypoints (`prepare.mjs`, `check.mjs`,
   `review.mjs`).
4. **Pass all 82 Thruput rules and all 19 Semgrep JavaScript rules (`[[The Toolchain Is the Guardrail]]`,
   `[[Test Pyramid]]`, `[[One subject under test]]`, `[[Linear deterministic code]]`, `[[Assert values]]`,
   `[[File too large]]`):** Every `.mjs` and `.test.mjs` file is `<= 200` lines, has zero comments, zero mutators, zero
   optional parameters, zero `??` operators, zero `default:` branches, and passes `semgrep-javascript`, `node --test`,
   and `scripts/verify.sh` with 0 errors and 0 warnings.

## Cheapest passing interpretation of the goals

Use Node 22 native ESM (`.mjs`) with `zod@4.6.7` and `yaml@2.8.3` declared in `package.json`. In `build.sh`, a small
build script (`scripts/generate-zod-contracts.mjs`, `< 100` lines) runs `@sourcemeta/jsonschema@17.0.0 bundle
--without-id -r schemas` on the 17 review schemas and `Rules.schema.json`, dereferences RFC 6901 `#/$defs/...` JSON
Pointers in memory so nested `$defs` are flattened, and writes gitignored `.mjs` modules under
`skills/pr-review/scripts/.generated/` that export `z.fromJSONSchema(...)` validators. Each domain module in
`skills/pr-review/scripts/domain/` wraps its contract validator in a named factory returning `Result.ok(domainObject)`
or `Result.err(zodError)`, keeping every file under 150 lines. Wire `/Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript`
into `scripts/verify.sh` so static analysis guards the entire JavaScript codebase on every build.

## Non-goals

- Changing the CLI flags or external behavior of `prepare.mjs`, `check.mjs`, or `review.mjs` documented in
  `skills/pr-review/SKILL.md`.
- Introducing a TypeScript compiler (`tsc`) build step; native Node 22 `.mjs` with Zod v4 runtime contracts and
  encapsulated ES2022 classes (`#private` fields + `Object.freeze`) requires no transpilation.
- Modifying the governance rule definitions in `rules/Rules.yaml`, `rules/Principles.yaml`, or `rules/Definitions.yaml`.

## Summary

`skills/pr-review/scripts/lib.mjs` (414 lines) and the raw-object scripts `prepare.mjs`, `check.mjs`, `review.mjs`,
`github.mjs`, `azure-devops.mjs`, and `git.mjs` are replaced by:

1. A build-time contract generator (`scripts/generate-zod-contracts.mjs`) invoked by `build.sh` that bundles and
   dereferences `schemas/review/*.schema.json` via `@sourcemeta/jsonschema@17.0.0 bundle --without-id` into gitignored
   Zod v4 contract modules (`skills/pr-review/scripts/.generated/*.contract.mjs`).
2. A pure, immutable domain layer (`skills/pr-review/scripts/domain/*.mjs`) where each schema concept (`Result`,
   `Primitives`, `PullRequest`, `Lines`, `Fragment`, `Surface`, `ChangeSet`, `Checkout`, `Rulebook`,
   `AgentInstructions`, `Threads`, `Violation`, `Ledger`, `Review`, `Outcome`) is an encapsulated class (`<= 200` lines)
   constructed exclusively via a validating factory that returns `Result` in its signature.
3. Perimeter adapters (`skills/pr-review/scripts/adapters/*.mjs`) that fold `gh`, `az`, `git`, and filesystem YAML/JSON
   data into domain objects at the exact statement of invocation.
4. Thin CLI entrypoints (`prepare.mjs`, `check.mjs`, `review.mjs`) that compose domain methods and perimeter adapters.

## Assumptions, risks and preconditions

- **Precondition 1 — Clean working tree and feature branch (`WORKFLOW.md` § 1):** The workspace currently has 7 modified
  tracked files on `main` (`rules/Rules.yaml` and 6 files in `schemas/review/` left over from before commit `28054c7`).
  Before Milestone 1 begins, those working-tree modifications must be discarded (`git checkout -- rules/Rules.yaml
  schemas/review/`) and a dedicated branch (`pr-review-domain-model`) must be created from `origin/main`.
- **Precondition 2 — `additionalProperties: false` on discriminated `oneOf` branches in `schemas/review/`:**
  `pull-request.schema.json`, `fragment.schema.json`, and `violation.schema.json` use `additionalProperties: false` on
  their `oneOf` branches to make branches mutually exclusive. Because `z.fromJSONSchema()` interprets
  `additionalProperties: false` inside JSON data at runtime rather than emitting `.strict()` in source code, Semgrep
  rule `accept-unknown-properties` passes on all `.mjs` files while preserving `z.xor()` branch discrimination.

## References

### Rejected alternatives

| Alternative | Why it was rejected |
|---|---|
| `json-schema-to-zod@2.8.1` | Archived and deprecated in March 2026 (violates `[[Maintained]]`); does not resolve `$ref` or `$defs` (silently emits `z.any()`); emits invalid TypeScript generic syntax `reduce<{...}>` in `parseOneOf.ts` that crashes Node 22 `.mjs` with `SyntaxError` on `pull-request`, `fragment`, and `violation` schemas; emits `.strict()` which violates Semgrep `accept-unknown-properties`. |
| `x-to-zod@0.10.9` | Emits `.strict()` in generated code on `additionalProperties: false` branches (violating Semgrep `accept-unknown-properties`) and adds an external dependency where core `zod@4.6.7` `z.fromJSONSchema()` already meets the need (`[[No dependency where the platform serves]]`). |
| Committing generated `.zod.mjs` files to git | Violates `[[No committing generated code]]`, `[[No second representation]]`, and Semgrep rule `no-committing-generated-code`. Generating into gitignored `skills/pr-review/scripts/.generated/` during `build.sh` keeps the JSON Schema as the sole committed representation. |
| Patching `skills/pr-review/scripts/lib.mjs` in place | `lib.mjs` is a 414-line procedural bag of raw-primitive helpers that mutates objects in place. Incremental patching leaves primitive obsession across all callers (`prepare.mjs`, `check.mjs`, `review.mjs`, `github.mjs`, `azure-devops.mjs`, `git.mjs`). |

## Discussions

None open.

## Open questions

None.

---

## Execution Plan

### Target Architecture & File Budget (`<= 200` lines per file)

```text
scripts/
  generate-zod-contracts.mjs              (~95 lines)  Bundles & dereferences schemas/review/*.schema.json -> .generated/
skills/pr-review/scripts/
  .generated/                             (gitignored) Generated ESM modules exporting z.fromJSONSchema() contracts
  domain/
    result.mjs                            (~65 lines)  Closed Result sum type (Ok / Err) with exhaustive .match()
    primitives.mjs                        (~140 lines) Domain primitives (RepositoryPath, Ref, CommitSha, ChangedPath,
                                                       LineNumber, LineText, RulesetUrl, ThreadId, Identifier, etc.)
    line-range.mjs                        (~90 lines)  LineRange domain object (start, end, span, contains, overlaps)
    lines.mjs                             (~140 lines) Side enum, NumberedLines, RemovedLines, Lines domain objects
    fragment.mjs                          (~110 lines) SurfaceFragment, ContextFragment, Fragment closed sum type
    surface.mjs                           (~155 lines) Surface domain object (fromUnifiedDiff, fromWholeFile,
                                                       extractContextFragments)
    pull-request.mjs                      (~135 lines) GitHubHost, AzureDevOpsHost, GitHost, Host sum type, PullRequest
    change-set.mjs                        (~105 lines) Commit, ChangedFile, ChangeSet domain objects
    checkout.mjs                          (~80 lines)  Checkout domain object
    rulebook.mjs                          (~95 lines)  Rule, RuleGroup, Rulebook domain objects
    agent-instructions.mjs                (~120 lines) Context/DeadCode/Reuse/RulesInstructions & AgentInstructions sum type
    threads.mjs                           (~100 lines) ThreadState enum, Thread, Threads domain objects
    violation.mjs                         (~120 lines) Observation, SurfaceAnchor, PullRequestAnchor, Anchor, Violation
    ledger.mjs                            (~125 lines) Verdict enum, Row, Ledger domain objects (completeness verification)
    review.mjs                            (~95 lines)  LedgerFile, ReportCommand, Review domain objects
    outcome.mjs                           (~135 lines) ReviewVerdict enum, Summary, InlineFinding, Outcome domain object
                                                       (fromReviewVerification pure domain transition)
  adapters/
    shell.mjs                             (~45 lines)  ExecFile wrapper (no optional params: runCommand / runCommandInDir)
    fs-store.mjs                          (~95 lines)  Perimeter YAML/JSON file reader/writer folding via domain factories
    git.mjs                               (~135 lines) Git CLI perimeter adapter returning ChangeSet, Surface, Checkout
    github.mjs                            (~145 lines) GitHub gh CLI/API adapter accepting/returning PullRequest, Threads, Outcome
    azure-devops.mjs                      (~155 lines) Azure DevOps az CLI/API adapter accepting/returning PullRequest, Threads, Outcome
  prepare.mjs                             (~145 lines) CLI entrypoint for workspace preparation
  check.mjs                               (~110 lines) CLI entrypoint for rule/check recording into Ledger & Violation files
  review.mjs                              (~120 lines) CLI entrypoint for verifying Ledger completeness & posting Outcome
```

Every production `.mjs` module has a 1-to-1 unit test file `<name>.test.mjs` (`<= 200` lines) exercising that single
subject under test (`[[One subject under test]]`).

---

### Milestone 1: Branch Setup, Toolchain Dependencies, and Contract Code Generator

Create the feature branch from a clean `origin/main`, declare `zod@4.6.7`, `yaml@2.8.3`, and
`@sourcemeta/jsonschema@17.0.0` in `package.json`, gitignore `skills/pr-review/scripts/.generated/` and `node_modules/`,
and implement `scripts/generate-zod-contracts.mjs` wired into `build.sh`.

1. **Clean working tree and create branch `pr-review-domain-model`.**
   Discard the 7 leftover working-tree edits on `main`, pull `origin/main`, and create the branch `pr-review-domain-model`.

   Verify:
   ```sh
   git status --short --branch
   ```
   Expected: `## pr-review-domain-model` with no modified tracked files.

2. **Add `package.json`, update `.gitignore`, and install pinned dependencies.**
   Create `package.json` at repository root with `"type": "module"`, `dependencies` (`"zod": "4.6.7"`, `"yaml": "2.8.3"`),
   and `devDependencies` (`"@sourcemeta/jsonschema": "17.0.0"`). Add `node_modules/` and
   `skills/pr-review/scripts/.generated/` to `.gitignore`.

   Verify:
   ```sh
   npm install --no-audit --no-fund && node -e "import('zod').then((m) => console.log(typeof m.z.fromJSONSchema))"
   ```
   Expected: prints `function` and exits `0`.

3. **Write failing test for `scripts/generate-zod-contracts.mjs` (`[[Test-Driven Development]]`).**
   Create `scripts/generate-zod-contracts.test.mjs` (`<= 120` lines, linear deterministic tests using `node:assert/strict`)
   verifying that `generateZodContracts()` produces `.generated/*.contract.mjs` for all 17 schemas in `schemas/review/`
   and `schemas/governance/Rules.schema.json`, and that each generated contract validates a conforming payload and
   rejects an invalid payload via `.safeParse()`.

   Verify (must fail before implementation):
   ```sh
   node --test scripts/generate-zod-contracts.test.mjs
   ```
   Expected: exits non-zero (`ERR_MODULE_NOT_FOUND`).

4. **Implement `scripts/generate-zod-contracts.mjs` and wire into `build.sh`.**
   Implement `scripts/generate-zod-contracts.mjs` (`<= 100` lines, zero comments, zero mutators, zero optional parameters):
   - Invokes `./node_modules/.bin/jsonschema bundle --without-id -r schemas <schemaPath>`
   - Dereferences RFC 6901 `#/$defs/...` JSON Pointers recursively into a pure self-contained JSON Schema object
   - Writes `skills/pr-review/scripts/.generated/<name>.contract.mjs` exporting `contract = z.fromJSONSchema(...)`
   - Wire `node scripts/generate-zod-contracts.mjs` into `build.sh`.

   Verify:
   ```sh
   ./build.sh && node --test scripts/generate-zod-contracts.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript scripts/generate-zod-contracts.mjs scripts/generate-zod-contracts.test.mjs
   ```
   Expected: exits `0` with 0 test failures and 0 Semgrep findings.

---

### Milestone 2: Core Domain Foundation (`Result`, `Primitives`, `LineRange`, `Lines`, `Fragment`, `Surface`)

Build the foundational domain types in `skills/pr-review/scripts/domain/` using strict TDD (`Red -> Green -> Verify` for
each module).

1. **Test and implement `domain/result.mjs` (`Result` closed sum type).**
   - Write `domain/result.test.mjs` first (`Ok` and `Err` construction via `Result.ok(value)` and `Result.err(error)`,
     exhaustive `.match({ ok, err })`, `.map(fn)`, `.flatMap(fn)`, `Result.collect(results)`, private constructor guard,
     `Object.isFrozen`).
   - Run `node --test skills/pr-review/scripts/domain/result.test.mjs` and observe failure.
   - Implement `domain/result.mjs` (`<= 75` lines).

   Verify:
   ```sh
   node --test skills/pr-review/scripts/domain/result.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript skills/pr-review/scripts/domain/result.mjs skills/pr-review/scripts/domain/result.test.mjs
   ```
   Expected: exits `0`.

2. **Test and implement `domain/primitives.mjs` (`RepositoryPath`, `Ref`, `CommitSha`, `ChangedPath`, `LineNumber`, `LineText`, `RulesetUrl`, `ThreadId`, `Identifier`, `NonEmptyText`).**
   - Write `domain/primitives.test.mjs` testing valid creation, invalid input rejection in signature (`Result.err`),
     immutability, domain equality (`.equals(other)`), and `toContract()` perimeter serialization.
   - Run `node --test skills/pr-review/scripts/domain/primitives.test.mjs` and observe failure.
   - Implement `domain/primitives.mjs` (`<= 150` lines) backed by the generated Zod contracts.

   Verify:
   ```sh
   node --test skills/pr-review/scripts/domain/primitives.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript skills/pr-review/scripts/domain/primitives.mjs skills/pr-review/scripts/domain/primitives.test.mjs
   ```
   Expected: exits `0`.

3. **Test and implement `domain/line-range.mjs` (`LineRange`) and `domain/lines.mjs` (`Side`, `NumberedLines`, `RemovedLines`, `Lines`).**
   - Write `domain/line-range.test.mjs` and `domain/lines.test.mjs` first, testing invariant enforcement (`end >= start`),
     distance/adjacency domain methods (`isWithinLinesOf(other, margin)`, `mergeWith(other)`), `NumberedLines` lookup by
     `LineNumber`, and `Lines` sum type (`NumberedLines` vs `RemovedLines`).
   - Run tests and observe failure.
   - Implement `domain/line-range.mjs` (`<= 95` lines) and `domain/lines.mjs` (`<= 145` lines) with zero in-place
     mutation.

   Verify:
   ```sh
   node --test skills/pr-review/scripts/domain/line-range.test.mjs skills/pr-review/scripts/domain/lines.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript skills/pr-review/scripts/domain/line-range*.mjs skills/pr-review/scripts/domain/lines*.mjs
   ```
   Expected: exits `0`.

4. **Test and implement `domain/fragment.mjs` (`SurfaceFragment`, `ContextFragment`, `Fragment`) and `domain/surface.mjs` (`Surface`).**
   - Write `domain/fragment.test.mjs` and `domain/surface.test.mjs` first, testing:
     - `Surface.fromRaw(raw)` and `Surface.toContract()` against `surface.contract.mjs`
     - `Surface.fromWholeFile(path, content)` (pure functional construction of `wholeSurface` with `RIGHT` `NumberedLines`)
     - `Surface.fromUnifiedDiff(path, patchText)` (pure `reduce`-based unified diff parser producing `SurfaceFragment`s
       with `RIGHT` `NumberedLines` and `LEFT` `RemovedLines`, with zero in-place mutation)
     - `Surface.extractContextFragments(wholeSurface, margin)` (pure functional extraction of `ContextFragment`s around
       changed ranges, merging ranges within `margin` and renumbering continuous `RIGHT` lines without mutating any
       object or array).
   - Run tests and observe failure.
   - Implement `domain/fragment.mjs` (`<= 115` lines) and `domain/surface.mjs` (`<= 165` lines).

   Verify:
   ```sh
   node --test skills/pr-review/scripts/domain/fragment.test.mjs skills/pr-review/scripts/domain/surface.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript skills/pr-review/scripts/domain/fragment*.mjs skills/pr-review/scripts/domain/surface*.mjs
   ```
   Expected: exits `0`.

---

### Milestone 3: Review Aggregate Domain Types (`PullRequest`, `ChangeSet`, `Checkout`, `Rulebook`, `AgentInstructions`, `Threads`, `Violation`, `Ledger`, `Review`, `Outcome`)

Implement the remaining domain objects in `skills/pr-review/scripts/domain/` using TDD (`Red -> Green -> Verify`).

1. **Test and implement `domain/pull-request.mjs`, `domain/change-set.mjs`, and `domain/checkout.mjs`.**
   - Write `pull-request.test.mjs`, `change-set.test.mjs`, and `checkout.test.mjs` testing:
     - `PullRequest.fromUrlOrSpec(spec)` and `PullRequest.fromRaw(raw)` with `Host` sum-type exhaustive `.match({ github, ado, git })`
     - `ChangeSet.fromRaw(raw)` with `ChangedFile` and `Commit` domain objects
     - `Checkout.fromRaw(raw)` mapping `ChangedPath` to `Surface` paths (`narrowSurface` and `wholeSurface`).
   - Run tests to observe failure, then implement `pull-request.mjs` (`<= 145` lines), `change-set.mjs` (`<= 110` lines),
     and `checkout.mjs` (`<= 85` lines).

   Verify:
   ```sh
   node --test skills/pr-review/scripts/domain/pull-request.test.mjs skills/pr-review/scripts/domain/change-set.test.mjs skills/pr-review/scripts/domain/checkout.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript skills/pr-review/scripts/domain/pull-request*.mjs skills/pr-review/scripts/domain/change-set*.mjs skills/pr-review/scripts/domain/checkout*.mjs
   ```
   Expected: exits `0`.

2. **Test and implement `domain/rulebook.mjs`, `domain/agent-instructions.mjs`, and `domain/threads.mjs`.**
   - Write `rulebook.test.mjs`, `agent-instructions.test.mjs`, and `threads.test.mjs` testing:
     - `Rulebook.fromGovernanceRules(rawRules, baseRulesetUrl)` grouping rules by `group` and computing each rule's
       canonical `RulesetUrl` (`https://thruput.se/agents/#<slug>`)
     - `AgentInstructions` sum type (`RulesInstructions`, `ReuseInstructions`, `DeadCodeInstructions`,
       `ContextInstructions`) validated against `agent-instructions.contract.mjs` and `instructions/*.contract.mjs`
     - `Threads` (`Thread`, `ThreadId`, `ThreadState` closed enum) validated against `threads.contract.mjs`.
   - Run tests to observe failure, then implement `rulebook.mjs` (`<= 105` lines), `agent-instructions.mjs` (`<= 125`
     lines), and `threads.mjs` (`<= 100` lines).

   Verify:
   ```sh
   node --test skills/pr-review/scripts/domain/rulebook.test.mjs skills/pr-review/scripts/domain/agent-instructions.test.mjs skills/pr-review/scripts/domain/threads.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript skills/pr-review/scripts/domain/rulebook*.mjs skills/pr-review/scripts/domain/agent-instructions*.mjs skills/pr-review/scripts/domain/threads*.mjs
   ```
   Expected: exits `0`.

3. **Test and implement `domain/violation.mjs`, `domain/ledger.mjs`, `domain/review.mjs`, and `domain/outcome.mjs`.**
   - Write `violation.test.mjs`, `ledger.test.mjs`, `review.test.mjs`, and `outcome.test.mjs` testing:
     - `Violation` with `Observation` and `Anchor` closed sum type (`SurfaceAnchor` with `ChangedPath` + `LineRange`,
       and `PullRequestAnchor`)
     - `Ledger` (`Row`, `Verdict.PASS` / `Verdict.VIOLATION`) with immutable `withRecordedRow(row)` domain method returning
       a new validated `Ledger` instance
     - `Review` (`LedgerFile`, `ReportCommand`) validated against `review.contract.mjs`
     - `Outcome.fromVerifiedReview(rulebook, ledger, violations, pullRequest)` verifying that every rule in `Rulebook`
       plus `reuse` and `dead-code` has a recorded `Row` in `Ledger`, that every `VIOLATION` row has a corresponding
       `Violation` with non-empty observations, and folding each `Observation`'s `Anchor` into either an `InlineFinding`
       (with formatted markdown body citing the `RulesetUrl`) or a pull-request summary bullet under `Summary`.
   - Run tests to observe failure, then implement `violation.mjs` (`<= 125` lines), `ledger.mjs` (`<= 130` lines),
     `review.mjs` (`<= 95` lines), and `outcome.mjs` (`<= 145` lines).

   Verify:
   ```sh
   node --test skills/pr-review/scripts/domain/violation.test.mjs skills/pr-review/scripts/domain/ledger.test.mjs skills/pr-review/scripts/domain/review.test.mjs skills/pr-review/scripts/domain/outcome.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript skills/pr-review/scripts/domain/violation*.mjs skills/pr-review/scripts/domain/ledger*.mjs skills/pr-review/scripts/domain/review*.mjs skills/pr-review/scripts/domain/outcome*.mjs
   ```
   Expected: exits `0`.

---

### Milestone 4: Perimeter Adapters (`shell.mjs`, `fs-store.mjs`, `git.mjs`, `github.mjs`, `azure-devops.mjs`)

Replace the perimeter adapters so they contain zero optional parameters (`[[No optionality]]`,
`[[Overload per option combination]]`), fold foreign CLI/API/filesystem shapes immediately into domain objects
(`[[Fold at Perimeter]]`, `[[Forced optionality at perimeter]]`), and stay under 200 lines each.

1. **Test and implement `adapters/shell.mjs` and `adapters/fs-store.mjs`.**
   - Write `adapters/shell.test.mjs` and `adapters/fs-store.test.mjs` first:
     - `shell.mjs` exposes two explicitly named functions without optional parameters: `runCommand(command, args)` and
       `runCommandInDir(command, args, cwd)` (`[[Overload per option combination]]`).
     - `fs-store.mjs` exposes `readDomainYaml(filePath, factory)`, `writeDomainYaml(filePath, domainObject)`, and
       `readDomainJson(filePath, factory)` that parse/stringify YAML/JSON at the perimeter and validate via the domain
       factory.
   - Run tests to observe failure, then implement `adapters/shell.mjs` (`<= 45` lines) and `adapters/fs-store.mjs`
     (`<= 95` lines).

   Verify:
   ```sh
   node --test skills/pr-review/scripts/adapters/shell.test.mjs skills/pr-review/scripts/adapters/fs-store.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript skills/pr-review/scripts/adapters/shell*.mjs skills/pr-review/scripts/adapters/fs-store*.mjs
   ```
   Expected: exits `0`.

2. **Test and implement `adapters/git.mjs`, `adapters/github.mjs`, and `adapters/azure-devops.mjs`.**
   - Write `adapters/git.test.mjs`, `adapters/github.test.mjs`, and `adapters/azure-devops.test.mjs` first (injecting a
     command runner so each adapter is tested in isolation as a single subject under test without network calls).
   - Verify that:
     - `git.mjs` folds `git log` / `git diff` / worktree files into `PullRequest`, `ChangeSet`, and `Surface` domain
       objects
     - `github.mjs` folds `gh api` responses into `PullRequest`, `ChangeSet`, `Threads`, and `Surface` domain objects,
       and folds `Outcome` into the single batched GitHub review POST payload
     - `azure-devops.mjs` folds `az devops invoke` responses into `PullRequest`, `ChangeSet`, `Threads`, and `Surface`
       domain objects, and folds `Outcome` into Azure DevOps thread payloads.
   - Run tests to observe failure, then implement `adapters/git.mjs` (`<= 140` lines), `adapters/github.mjs` (`<= 150`
     lines), and `adapters/azure-devops.mjs` (`<= 160` lines).

   Verify:
   ```sh
   node --test skills/pr-review/scripts/adapters/git.test.mjs skills/pr-review/scripts/adapters/github.test.mjs skills/pr-review/scripts/adapters/azure-devops.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript skills/pr-review/scripts/adapters/git*.mjs skills/pr-review/scripts/adapters/github*.mjs skills/pr-review/scripts/adapters/azure-devops*.mjs
   ```
   Expected: exits `0`.

---

### Milestone 5: CLI Entrypoints (`prepare.mjs`, `check.mjs`, `review.mjs`) and Removal of Legacy `lib.mjs`

Replace `prepare.mjs`, `check.mjs`, and `review.mjs` with thin orchestrators over `domain/` and `adapters/`, and delete
the legacy procedural files (`lib.mjs`, `lib.test.mjs`, and the old root-level `github.mjs`, `azure-devops.mjs`,
`git.mjs`, `shell.mjs` and their tests) per `[[Delete unused]]`.

1. **Test and implement `prepare.mjs`, `check.mjs`, and `review.mjs` and delete `lib.mjs`.**
   - Update `prepare.test.mjs`, `check.test.mjs`, and `review.test.mjs` so each test is linear, deterministic, under 200
     lines, and exercises the entrypoint against domain objects and fake adapters.
   - Implement `prepare.mjs` (`<= 150` lines), `check.mjs` (`<= 115` lines), and `review.mjs` (`<= 125` lines).
   - Delete `skills/pr-review/scripts/lib.mjs` and `skills/pr-review/scripts/lib.test.mjs` (and old unlayered adapter
     files moved into `adapters/`).

   Verify:
   ```sh
   node --test skills/pr-review/scripts/**/*.test.mjs && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript skills/pr-review/scripts/
   ```
   Expected: all unit tests pass and Semgrep reports 0 findings across `skills/pr-review/scripts/`.

---

### Milestone 6: Skill Prose Alignment (`skills/pr-review/SKILL.md`) and End-to-End Verification Gate (`scripts/verify.sh` and `build.sh`)

Align `skills/pr-review/SKILL.md` so it addresses the reviewing agent directly, folds `CODE_REVIEW.md` into `SKILL.md` (deleting `CODE_REVIEW.md` and updates to stale references in `references/`), and grounds every review concept in its schema under `schemas/review/`; then wire the full Node test suite and Semgrep gate into `scripts/verify.sh` and `build.sh`.

1. **Align `skills/pr-review/SKILL.md`, delete `skills/pr-review/CODE_REVIEW.md`, and run full verification.**
   - Ensure `skills/pr-review/SKILL.md` contains the schema-grounded instructions for the reviewing agent and delete `skills/pr-review/CODE_REVIEW.md`.
   - Ensure `build.sh` runs `node scripts/generate-zod-contracts.mjs` before running `scripts/verify.sh`.
   - Ensure `scripts/verify.sh` runs `node --test` across `scripts/*.test.mjs` and `skills/pr-review/scripts/**/*.test.mjs`.

   Verify:
   ```sh
   ./build.sh && /Users/Shared/workspace/semgrep/javascript/bin/semgrep-javascript scripts/ skills/pr-review/scripts/
   ```
   Expected: `build.sh` and `semgrep-javascript` both exit `0` with 0 errors and 0 warnings.

---

### Goal coverage

| Goal | Covered by |
|---|---|
| 1. Derive Zod validators from JSON Schema contracts (`[[Shapes live in the contract]]`, `[[No second representation]]`, `[[No committing generated code]]`) | Milestone 1 Steps 2–4 |
| 2. Immutable, encapsulated domain model (`[[Domain object]]`, `[[Encapsulated type]]`, `[[Domain primitive]]`, `[[Validating factory]]`, `[[Private constructor]]`, `[[Creation failure in the signature]]`, `[[Immutable by default]]`, `[[No mutators]]`) | Milestone 2 Steps 1–4, Milestone 3 Steps 1–3 |
| 3. Strict layering and perimeter folding (`[[Respect layering]]`, `[[Fold at Perimeter]]`, `[[No primitive leakage]]`, `[[No optionality]]`) | Milestone 4 Steps 1–2, Milestone 5 Step 1 |
| 4. Pass all 82 Thruput rules and all 19 Semgrep JavaScript rules (`<= 200` lines, linear deterministic tests, `node:assert/strict`) | Milestone 1 Step 4, Milestone 2, Milestone 3, Milestone 4, Milestone 5, Milestone 6 |
