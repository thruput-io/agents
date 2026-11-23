# 002 — PR Review Tool: Least Exposure per Agent and Boundaries Generated From Specs

Draft. Requirements are recorded in [Discussions](#discussions). The execution plan is a draft, not yet accepted.

## Background

Each agent that drives the review tool can see more of it than it uses, which confuses it. The specs of the main agent
and of the sub agent reference each other, and hold persisted records and timing settings beside the commands. The
[[Change]] carries host coordinates, so transport detail reaches the domain. The boundaries between layers are
hand-written, and the architecture test now defines a layout the specs do not describe.

Version 001 of this plan and [ADR 0010](../../adrs/0010-pr-review-probe-tool-and-submission-lifecycle.md) stand where
this version does not say otherwise.

### Goals

The cheapest passing interpretations and exclusions are the agent's proposals, not yet accepted.

1. The skill, with its tools, reviews a [[Change]] against all [[Rule]]s.
   - Cheapest passing interpretation: review against the rules that fit in one prompt.
   - Exclusion: the [[Ledger]] holds a row with a [[Verdict]] for every rule, and a review with a missing row is not
     posted.
2. The skill eliminates agent bias.
   - Cheapest passing interpretation: instruct the agent to be objective.
   - Exclusion: no agent chooses which rules apply, what the [[Surface]] is, or what the outcome is; the tool decides
     those in code, and each probe is boxed to its own rules and permissions.
3. The skill wastes no tokens on agents working out what to do.
   - Cheapest passing interpretation: hand every agent one complete manual to read.
   - Exclusion: an agent is handed its next command and only the shapes that command uses.
4. The skill is agent agnostic and supports the opencode, claude, copilot and agy command-line tools.
   - Cheapest passing interpretation: support one of them and document workarounds for the rest.
   - Exclusion: the same skill runs unchanged in all four, and nothing in it depends on one of them.
5. The skill is distributable through industry-standard mechanisms.
   - Cheapest passing interpretation: a bespoke install script that copies files into place.
   - Exclusion: it installs through a standard plugin or package mechanism with no step of our own.
6. The tool can be externalized and used by humans.
   - Cheapest passing interpretation: a person can run it only by imitating an agent's session.
   - Exclusion: the tool is a package of its own with a command line a person can drive from its help alone.
7. The code is maintainable and readable.
   - Cheapest passing interpretation: the linters pass because failing checks were switched off.
   - Exclusion: every check passes with none disabled, muted or weakened, and a review by this project's review
     protocol finds no [[Violation]].

### Non-goals

- Delivering goals 4 to 6. They are stated so that nothing here works against them.
- Staying compatible with the existing hand-written code, or using it as an input to the design.
- Editing ADR 0009 or ADR 0010.
- Renumbering other plan directories.

## Summary

The goals are reached by holding the code to the guidance below, each point decided in [Discussions](#discussions).

- Each agent has its own generated surface and sees nothing it does not use. A probe is YAML data inside the tool, with
  one rule group and no more permissions than it needs.
- The domain is closed. Its objects are transport agnostic, opaque, [[Immutable]] and have only methods. They are
  created only in the perimeters or by a method on another [[Domain object]], and leave only there, through zod
  codecs; nothing is parsed anywhere else.
- A [[Domain object]] is its generated data and its methods in one frozen object, seen outside its package only as an
  interface with methods. A [[Domain primitive]] is such an object too. The interfaces, the friend module that reads
  the data back, and the codecs are one package whose entry points keep the friend module private; a second package
  re-exports the interfaces as types for the controller.
- A result and its failure travel in an Effect, folded only at the perimeter.
- Every boundary is generated from a spec, with interfaces in OpenAPI: the controller and client APIs, the host adapter
  (get the [[Change]] for an opaque URL, post the outcome), the persistence adapter (in memory and on disk), and a
  generated folder for each layer.
- Behaviour is pinned by black-box integration tests on one immutable fixture repository, with a stateless mock server
  on orval-generated mocks.

The integration tests are pinned first. The specs, the architecture test and the guardrails then define the target, at
which point every tool reports errors against the old code. Iterations move the code, inside out, with every check
enabled, until every count is zero and the pinned tests pass.

## Assumptions, risks and preconditions

### Assumptions

- A zod codec can have an opaque [[Domain object]] with only methods as its domain side, with no cast. Tested in
  `tracer-bullets/opaque-by-interface`.
- A package's entry points keep its friend module out of reach of other packages at compile time and at runtime.
  Tested in `tracer-bullets/package-visibility`, which also shows that package declarations do not keep a package away
  from an entry point it did not declare.
- Effect, fp-ts and neverthrow can each carry the typed failure of prepare. Tested in `tracer-bullets/either-library`.
- An in-process interface can be generated from an OpenAPI document. Not tested; no documented orval output does it.
- The generator accepts references from OpenAPI documents to the JSON Schema files of the domain. Not tested.

### Risks

- The glossary defines [[Head commit]] as the commit every inline comment resolves against. Without it in the
  [[Change]], commits pushed between reading and posting can shift lines; pinning falls to the adapter.
- The integration tests cannot load on this branch, so they cannot be shown green here before they are pinned.
- With a stateless mock server, scenario history has to be readable from the fixture's branches.
- Generated code is not ignored by git today, so the linters read it.
- Nothing validates the folder configuration against its schema.
- The hiding of a [[Domain object]]'s data is at compile time; at runtime the fields are on the object.
- The unused-code checker stops in the container with an allocation failure, so it has not been shown to report an
  import of a package that was not declared.
- Packages replace part of the folder layout the architecture test describes.

### Preconditions

- A new ADR supersedes ADR 0010 decision 1 (interfaces in OpenAPI), ADR 0010 decision 7 (token from the environment)
  and ADR 0009 decision 1 (a [[Change]] without host coordinates, probes as YAML data), and adds the adapter
  operations, the perimeters folder, opaque [[Domain object]]s and the generated mirror.

## References

- Opaque domain primitives in C#, the model for the perimeters folder:
  [ADR](https://dev.azure.com/NavistarCollection/NavistarProduction/_git/DS-DD-DataIntegration-Platform/pullrequest/62339),
  [hide the value outside the perimeter](https://dev.azure.com/NavistarCollection/NavistarProduction/_git/DS-DD-DataIntegration-Platform/pullrequest/62348).
- [ADR 0009](../../adrs/0009-pr-review-is-governed-by-isolated-controllers-and-boxed-subagents.md) decisions 3 and 4
  already hold least exposure per agent and the permissions of a probe.
- [ADR 0010](../../adrs/0010-pr-review-probe-tool-and-submission-lifecycle.md) decision 2 already holds parsing only
  through zod and conversion only through codecs, and decision 6 holds that the last report posts the review.
- [Zod codecs](https://zod.dev/codecs): decode runs inward and behaves like parse; encode runs outward.
- [Zod branded types](https://zod.dev/api): a brand is a static-only construct.
- [Orval output](https://orval.dev/docs/reference/configuration/output): zod-only client, mock output folders.
- [Orval input](https://orval.dev/docs/reference/configuration/input): tag filters, external references are refused
  unless allow-listed.
- [openapi-typescript](https://openapi-ts.dev/introduction): runtime-free operation types from OpenAPI.

## Discussions

The decider of every row is the human. At the human's request the answers are restated in plain English and are not
quotations.

1. What are the goals of this plan? The seven under [Goals](#goals). The points the agent first listed as goals are
   guidance for how the code is built.
2. What is the restructure for? A new architecture test defines how the code is to be restructured, and the host
   clients are generated with orval as part of it.
3. How much of a host API is generated? Only the operations the adapters need.
4. How does the design treat existing code? It is ignored completely as an input, and the design is not adapted to it.
5. How does the existing code reach the target? In iterations, with every linter enabled and blocking, each closed by
   a review with this project's review protocol against the rules.
6. What state are the checks in at the start? Every tool reports errors.
7. What comes before the iterations? The integration tests are pinned.
8. How is black box held for the integration tests? It is enforced.
9. What do the integration tests and mocks run on? One real, immutable git repository whose branches make up all use
   cases. The git adapter uses it as is, it is the source for the other hosts' mocks, and the mocks are stateless.
10. Where do the host mocks come from? Orval generates them.
11. What may an agent see? No more than it needs; more causes confusion. What each agent needs is read from the two
    entry points.
12. Which agent posts the review? The sub agent only reports; the last report posts.
13. What is generated? The domain model, the controller APIs, the client APIs and the adapter interface. Interfaces
    are described in OpenAPI, and the generated folder mirrors the folders the architecture test covers.
14. What is redone? All schemas.
15. May transport detail enter the domain model? No. The current [[Change]] is not a domain object, because it holds
    three transport details; it is redefined without host coordinates.
16. What goes into and comes out of the host adapter? A URL goes in and a [[Change]] comes out. The URL is opaque in
    the domain. A delegating adapter passes it to its implementing adapters, each of which answers unknown format, one
    of the existing domain error objects, or the [[Change]]. Each implementing adapter builds the [[Change]] through
    its generated client. A token set in the environment is read there by the adapter.
17. Is unknown format decided from the shape of the URL alone? Yes; that should be enough.
18. What does the [[Change]] carry? Everything the review needs, and no head commit.
19. What is the second adapter operation? Posting the outcome.
20. Is the committed `PullRequestRepository` the adapter interface? No; the interface is the one in rows 16 to 19.
21. Is the guardrails test, which pins that interface, updated? Yes.
22. Which domain values are opaque? All objects in the domain.
23. What does a [[Domain object]] expose? Only methods.
24. May a [[Domain object]] change after it is created? No; it is immutable.
25. Where may a [[Domain object]] be created? In the perimeter, or by a method on another [[Domain object]].
26. How are API objects and [[Domain object]]s converted? Only with zod codecs.
27. Where do parsing and the codecs live? In the perimeter, modelled on the C# series in the platform repository.
28. How many perimeter folders are there? One, holding only the parse calls and the outward calls.
29. May the client read a value back out at the perimeter? Yes; it needs to for the objects it returns.
30. What are the codec calls named? Zod's own names: parse or decode inward, encode outward.
31. How is input parsed? Only with zod parse, and only for command inputs, responses from hosts and reads from the
    filesystem.
32. Where are filesystem reads parsed? In a persistence adapter, which exists in memory and on disk.
33. How is the persistence adapter laid out? Two subfolders.
34. Are probes types? No. They are provided as YAML, as the rules are.
35. Where do the probes live? Inside the tool.
36. Which rules is a probe handed? Those of its group; a probe names exactly one group.
37. Which permissions does a probe get? No more than it needs; a normal probe needs no disk access.
38. Are these requirements already decided elsewhere? Most are believed to be in the ADRs already.
39. How is this plan numbered? The number is the plan's version: the earlier plan is 001 and this one 002, updated in
    place. Only this plan directory is renumbered.
40. Are folders created during planning? Yes, as they are decided, because it is easier to review.
41. Does this plan deliver goals 4 to 6? No, they are not addressed yet. Nothing may be done here that would make them
    problematic to realize in a later pull request.
42. How is an opaque [[Domain object]] built in TypeScript? Not done before by the human; to be researched. A state
    transition is the easy case: when the last report comes in, a pending ledger becomes a complete ledger, which is
    what the host adapter accepts. The interesting case is one [[Domain object]] taking another as an argument and
    returning a third.
43. Which tool generates the in-process interfaces? OpenAPI tooling is expected to provide this.
44. Where does the fixture repository live? It will be created outside this repository later; first it is built here.
45. How is the pin on the integration tests enforced? The tests have to stay true for every way a review needs to
    support; the review process is well known.
46. How is a [[Domain object]] built in TypeScript? As a class; friends is the notion for one object reading another.
47. Which object owns the outcome? The change: it is asked for the outcome of a complete ledger.
48. Where does the code start? Perhaps with all controller code for the main agent, written against empty interfaces.
49. Where may a [[Primitive]] appear in a signature? Only parse takes a primitive.
50. How does the host adapter state its outcomes? Its resolution holds every typed error path, as an either.
51. Is the either written by hand? No. A real library is used; it goes hand in hand with the rules and simplifies
    some of them. Effect is chosen, and the mapping from rules to the library is recorded in
    [ADR 0011](../../adrs/0011-results-and-failures-travel-in-effect.md).
52. Where is the either folded? Only at the perimeter, with no ifs before it.
53. Where is branching forbidden? In test code and in configuration code. Configuration holds no choices.
54. What does the generator produce for a [[Domain object]]? The exposed object with all its fields, with default
    settings. The domain has only the interface with methods.
55. How do the two meet? The object is the exposed type, and the interface is assigned to it; only the interface is
    used in the domain.
56. What keeps the exposed type out of reach? Package visibility.
57. Is a [[Domain primitive]] a plain value or an object? Not a question: it is wrapped, as the rules say.
58. What happens to pull request 48? It is made a draft and used as reference.
59. Where does the work start? At the commit the agent recommended: the last one of pull request 48 with a passing
    check.
60. In what order is the existing code moved? First code generation is made to work. Then proper integration tests
    are created on the mock with one immutable repository, with git backing it all. Then the agent halts for approval.
    Then the adapter interfaces and the controller implementation. Then the simplest round trip from the client to an
    endpoint and back.
61. How does the agent work through it? It defines the loop and when it halts for review.
62. May the agent change what the work needs, such as a dependency version? Yes, whatever it needs.
63. Which things may the work not touch? The agent lists them.
64. Is the build clean on every pass? No. A baseline is saved, and failing tests and architecture errors are then
    reduced until they reach zero.
65. How are sub agents kept from cheating? By not allowing changes to the things on the list.
66. Does the agent reread the goals as it works? It has to, now and then.
67. How is a pass reviewed while the review tool stops on a range of commit ids? By sub agents.
68. What does the agent do with a decision it has recommended an answer to? It stops stalling and goes on, keeps
    the plans saved, and reports.
69. Does the green commit of pull request 48 get a pull request of its own? No. Pull request 48 is the pull request
    this work lands through.
70. Is a lock file over the size limit a defect of the review tool? No. The refusal is the code doing its job.
71. Does the Azure policy specification stay, kept for the one operation that lists the policy evaluations of a pull
    request? It stays for now, and it is removed if that simplifies. It needs no permission beyond reading the pull
    request, and its API version is a preview.

## Open questions

1. How do the commits of this branch join the branch of pull request 48, which has 19 commits of its own after
   `a146b24` and uncommitted work in a stash?
2. Which OpenAPI tool generates the in-process interfaces? No documented orval output does; openapi-typescript emits
   operation types. M3 settles it.
3. Which use cases make up every way a review needs to support? The agent drafts the list, as the branches of the
   fixture repository, for the human to check.
4. How does the status command wait for acknowledgements, probe deadlines and host submission without iterating over
   reads of the stored review?
5. Where does the checkout come from for a probe that is granted disk access, now that the host adapter returns only
   the [[Change]]?
6. Orval writes the import in a separate mock file without a file extension, which native modules cannot resolve.
   Until that is solved the mocks stay inside the generated client files. Versions 8.47.0 to 8.49.0 do not solve it,
   with or without a named tsconfig, as the tracer bullet `orval-mock-folder` records.

## Baseline

The work starts on branch `pr-review-opaque-domain`, created at `a146b24`, the last commit of pull request 48 with a
passing check. Measured there on 2026-11-23: code generation, build, unused-code check, lint and type check pass, and
131 of 131 tests pass.

For reference, the head of pull request 48, measured 2026-11-23 with its working tree as it was:

| Check                           | Result                                                          |
|---------------------------------|-----------------------------------------------------------------|
| Type check                      | 60 errors, 39 of them missing modules for the removed clients   |
| Lint, hand-written code         | 40 errors, 4 warnings                                           |
| Lint, including generated code  | 1988 errors, 4167 warnings                                      |
| Unused code                     | 1940 unused files, all generated                                |
| Architecture test               | 4 of 6 rules fail                                               |
| Guardrails test                 | 4 of 5 rules fail                                               |
| Integration tests               | 9 of 9 fail to load                                             |
| All tests                       | 84 of 111 pass                                                  |

## Execution Plan

Draft. The order of the milestones is the human's. What follows the fourth is planned once the fourth is done.

### The loop

Every milestone is worked in passes. A pass is one commit with one purpose, under 400 hand-written lines:

1. Start from a clean working tree. Reread the goals, the guidance in the summary and the list of things not to be
   touched, then state the purpose of the pass and the goal it serves. Work that serves no goal is dropped.
2. Write the failing test or check first, and see it fail.
3. Make the smallest change that turns it.
4. Run every check to its end and record its count in the progress log. The build is not clean while the target is
   being put in place: the baseline is saved first, no count rises above it without the reason being recorded, and
   the counts are driven to zero. No check is disabled, muted, excluded or weakened.
5. Review the diff of the pass with this project's review protocol against the rules and fix what it finds, back to
   4 until the review is clean.
6. Confirm the diff of the pass touches nothing on the list below. A pass that does is rejected, whoever wrote it,
   so that a sub agent cannot pass by changing what it is checked against.
7. Commit. Nothing is pushed.

Nothing is introduced that makes goals 4 to 6 harder to deliver later: no dependence on one agent's command-line
tool, no install step of our own, and no dependence of the tool on the skill being present.

### Halts

The agent stops and hands control to the human:

- at once, on an unexpected error, warning or ambiguous result from a tool;
- before a change to a guardrail, a lint setting, a pinned test or a published ADR, and before anything is pushed or
  posted;
- when the review of a pass is still not clean after three rounds;
- after M2, for approval, before any existing code is moved;
- after M3 and after M4, for review of what was built.

At a halt the agent reports what changed, the result of every check, how the work stands against each goal, and
what it needs decided.

### Not to be touched

Unless the human approves it first, in a pass that does nothing else:

- the guardrails: the lint, unused-code and compiler settings, the architecture test and the guardrails test;
- the pinned integration tests and the fixture repository, once M2 is approved;
- published ADRs, and frozen plans with their progress logs;
- the governance documents and their schemas;
- the downloaded host specifications, which are replaced only by a fresh download;
- generated code, which is never edited by hand;
- the build and release pipeline: the build and verify scripts, the workflows, the release and install
  configuration;
- pull request 48, its branch, the stash holding its working tree, and main.

### Goal coverage

| Goal | Milestones               |
|------|--------------------------|
| 1    | M2, M3, M4               |
| 2    | M3                       |
| 3    | M3, M4                   |
| 4    | later plan; guarded here |
| 5    | later plan; guarded here |
| 6    | later plan; guarded here |
| 7    | M1 to M4                 |

### Running all tests

`./build.sh` at the repository root (existing).

### Milestone M1: Code generation works

A declarative orval configuration generates only the host operations in use, with their schemas and their mocks.

Verification: the configuration holds no branching, the generated clients hold only the declared operations, and the
verification command passes.

### Milestone M2: Integration tests on one immutable repository

A black-box suite drives only the built artifact. One real, immutable git repository, whose branches are the use
cases, is used as it is by the git adapter and is the source a stateless mock server derives the other hosts'
responses from, in the shapes orval generates. The list of use cases is agreed with the human first.

Verification: the suite passes for all three hosts, and an architecture rule holds it to itself, the mock server and
the generated mocks.

Use cases, proposed by the agent from the names of the existing integration tests and not yet agreed. Each is one
branch against `main`, reviewed through all three hosts unless it says otherwise:

1. A first review: lines added in several files and in several commits, with a file whose mode changes. The three
   hosts yield the same [[Surface]], and the same outcome is posted to each.
2. A review whose finding applies to the pull request as a whole and sits on no line.
3. A [[Surface]] larger than one page, read page by page.
4. Removed lines, a deleted file and a renamed file.
5. A second review after new commits: the [[Surface]] narrows to what is new and to the lines of threads the author
   resolved.
6. A second review that settles a thread whose finding is fixed, and reopens one the author resolved without fixing.
7. A head commit already reviewed, with no thread resolved by the author: answered as already reviewed without any
   further request to the host.
8. A change over the limit on the lines of one file, and one over the limit on the total diff: answered as too large.
9. Checks that failed or are still running, a merge conflict, and an empty [[Surface]]: answered as refused, with the
   refusal posted once, and an earlier refusal closed when the cause is gone.
10. A URL no host recognises: answered as an unknown format.
11. The host refusing: no credentials, missing permission to read, missing permission to write, a pull request that
    cannot be written to, and a failed download of the files. Hosts only.
12. A token set in the environment is sent, and none is sent when it is not set. Hosts only.
13. The status command waiting while probes acknowledge and report, and the last report posting the review.

What a host knows beyond the branch itself (author, purpose, checks, earlier threads, and the fault to answer with) is
kept in the same repository, on a branch of its own that no review reads, so that the mock server stays stateless.

### Milestone M3: Adapter interfaces and controller implementation

The host and persistence adapter interfaces, and the controllers written against them and against the domain
interfaces.

Verification: the controller tests pass with every dependency replaced by a stand-in.

### Milestone M4: The simplest round trip

One command travels from the client to an endpoint and back: parsed at the perimeter, carried by the controller,
answered by an adapter, and encoded at the perimeter.

Verification: the round trip passes in the black-box suite of M2.

