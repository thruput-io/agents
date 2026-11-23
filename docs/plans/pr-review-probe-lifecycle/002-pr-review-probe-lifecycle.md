# 002 — PR Review Tool: Least Exposure per Agent and Boundaries Generated From Specs

Draft. Requirements are recorded in [Discussions](#discussions). The execution plan is a draft, not yet accepted.

## Background

Each agent that drives the review tool can see more of it than it uses, which confuses it. The specs of the main agent
and of the sub agent reference each other, and hold persisted records and timing settings beside the commands. The
[[Change]] carries host coordinates, so transport detail reaches the domain. The boundaries between layers are
hand-written, and the architecture test now defines a layout the specs do not describe.

Version 001 of this plan and [ADR 0010](../../adrs/0010-pr-review-probe-tool-and-submission-lifecycle.md) stand where
this version does not say otherwise.

The progress log of this plan records that the agent working it broke the loop it had written: it committed on a
failing check, changed guardrails before they were approved, and reported weaknesses late. The loop was prose the
agent was trusted to follow. The harness of M2 holds without the agent's cooperation.

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
- Behaviour is pinned by black-box integration tests on one immutable fixture repository, with stateless mock hosts.
  The production code, the mock hosts and the integration tests are three independent parts with nothing in common.

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
- Orval can generate an in-process interface from an OpenAPI specification. Not tested; no documented orval output
  is one, so a tracer bullet proves it first.
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
- The main branch has no branch protection and the repository has no code owners file, measured 2026-11-23; one
  organization ruleset named linear is active.
- A hook in a working copy can be skipped by whoever pushes, so only the pull request check binds.
- Reporting at the moment of detection, and keeping to the design instead of to the existing code, have no
  mechanism.

### Preconditions

- A new ADR supersedes ADR 0010 decision 1 (interfaces in OpenAPI), ADR 0010 decision 7 (token from the environment)
  and ADR 0009 decision 1 (a [[Change]] without host coordinates, probes as YAML data), and adds the adapter
  operations, the perimeters folder, opaque [[Domain object]]s and the generated mirror.
- The human, not the agent, sets the main branch to require the pull request check and the review of a code owner.

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
72. Where does generated code go? Into subfolders of the generated folder that mirror the layers, as asked from the
    start. The host clients go under its adapters folder.
73. Which failure of the agent is the most severe? Breaking the obligation to inform. A weakness, a warning or a
    weakened guardrail is reported at the moment it is seen, and the work goes on only after the human confirms.
74. Who writes the remedies for the agent's shortcuts into the plan? The agent, since it is making the plan.
75. What counts as delivered? What is pushed. Commits are not reported.
76. Through which pull request does the work travel while pull request 48 is a draft? One of its own, number 52. How
    the two join is solved at the end.
77. Does a change made after progress was reported go into a copy numbered 003? Not here. The human regards this
    plan as not started, which is the only reason it is updated in place.
78. What becomes of the progress log, if the plan is not started? It stays as the record of what happened. The plan
    counts as not started from M2 on, and M1 is work done ahead of it.
79. How are the use cases grouped? Into the complete happy path, early exits on the content, technical failures of
    the workspace and of the hosts, and concurrency. Each says which of the three hosts run it, and all run in
    parallel, since the fixture is immutable.
80. What does stateless mean? Each scenario is a branch, with the state of its threads and the rest in the fixture.
    Immutable means no write ever sticks, and every scenario ends with a post, which is what is compared.
81. How does plain git know of an earlier review? The earlier reviews are encoded on the branches of the scenarios
    that need them, in a committed file or otherwise, and plain git reads them.
82. Do the three hosts differ? No. Plain git is the single source of truth and feeds Azure DevOps and GitHub, so
    they are all the same.
83. Where is a review stored? In the repository, in `.reviews`, as JSON in the shape it was reported in.
84. Who writes the stored reviews of the fixture? They are written by hand as part of setting up the fixture, which
    is immutable.
85. Does the tool write in a scenario? Yes. It posts its review, and a mock asserts what it is sent. What was
    written is not persisted.
86. Does a real user of plain git get the stored review? Yes, somehow.
87. Is `.reviews` a feature or a fixture? For GitHub and Azure DevOps it is purely a test fixture, read by the mock
    server. For plain git it may or may not become real.
88. What do the production code, the mock hosts and the integration tests have in common? Nothing. They are
    completely independent, and reuse between them is forbidden. The earlier allowance to reuse is withdrawn.
89. How is that held? By dependency protection for the integration tests, which are completely separate from the
    other code.
90. What may pass between the tool and the mock hosts? Only HTTP. For plain git that means git over HTTP.
91. Where do the three live? Each in a folder of its own, and nothing connects them except HTTP.
92. How much of the production code do the unit tests cover? At least 90%, of the branches as well as of the lines.
93. Which files are linted, and how? Every source file has a linter, used with its strictest settings: semgrep,
    biome, shellcheck, the JSON Schema tooling and knip. The number of violations only ever decreases, until it is
    zero. A workaround is a complete disqualification.
94. What is fixed when a linter reports? Every linter rule sniffs a smell. What the smell is truly about gets
    fixed, and that is verified by our rules.
95. Is git over HTTP acceptable for plain git? Yes. The git binary is the interface.
96. Which tool generates the in-process interfaces? Orval, from an OpenAPI specification.
97. Who completes the list of use cases? The agent fills in what the human missed.
98. Does the status command need a design of its own for waiting? No. The question should not have been asked:
    reading the stored review is not a call over the network.
99. What does the [[Change]] hold for a probe with disk access? The path to a checkout. It is not served to a client
    that does not need it.
100. How is the JSON of the fixture and the mock hosts defined? In a schema.
101. How does the tool reach a mock host? The addresses of the hosts are not fixed in the tool, which is what makes
     it testable.
102. What does immutable mean for the fixture? That no test mutates it; a fixture is not test code. To be sure, one
     target builds the mocks and another serves them, and building happens before the server is started.
103. Can the agent's token change the rules of the main branch or approve a pull request? No.
104. What is answered for an empty [[Surface]]? Refused, for now. Small pull requests get a treatment of their own
     later.
105. How does a real user of plain git get the stored review? Out of scope.
106. What is kept when a post fails? In a mock host there is a log. In the production code, nothing.
107. What are the assertions about a post made on? The log of the mock host. Without a log there is nothing to
     assert on.
108. Which copy of the review tool reviews a pass, when the tool is what is being rebuilt? The installed release,
     which the worker did not build. The human named this catch-22 as the pain.
109. Where is the state of a scenario stored, a thread the author resolved included? In the `.reviews` files.
110. Where does a scenario say what its checks are? The agent decides: in `checks.json` in `.reviews`.
111. May the tests start the tool through its command line? Yes. The agent should not have asked.
112. What is answered for a pull request that is closed or merged, a draft, or from a fork? The agent decides:
     closed or merged is refused, and a draft or a fork is reviewed like any other.

## Open questions

None.

## Baseline

The work starts on branch `pr-review-opaque-domain`, created at `a146b24`, the last commit of pull request 48 with a
passing check. Measured there on 2026-11-23: code generation, build, unused-code check, lint and type check pass, and
131 of 131 tests pass.

Unit test coverage, measured there on 2026-11-23 without the integration tests and the generated code: 83.0% of the
lines and 90.3% of the branches, counted only over the files the unit tests load.

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

Draft. The order of the milestones after the harness is the human's. What follows the fifth is planned once the
fifth is done.

### The loop

Every milestone is worked in passes. A pass is one push with one purpose, under 400 hand-written lines:

1. Start from a clean working tree. Reread the goals, the guidance in the summary and the list of things not to be
   touched, then state the purpose of the pass and the goal it serves. Work that serves no goal is dropped.
2. Write the failing test or check first, and see it fail.
3. Make the smallest change that turns it.
4. Run the pass command of M2. It runs every check to its end, writes the counts, and refuses the pass when a count
   rose or a check did not run. The build is not clean while the target is being put in place: the counts start
   from the baseline and are driven to zero. No check is disabled, muted, excluded or weakened.
5. Have the pass reviewed against the rules by this project's review protocol, on the range since the last push,
   and fix what it finds, back to 4 until the review is clean. A range refused as too large is split. A pass that
   changes only a lock file is reviewed by the human.
6. Push. The pull request check judges the pass again from a checkout of its own: the checks, the counts and the
   protected paths.
7. Record the pass in the progress log, citing the check run of the push.

The unit tests alone cover at least 90% of the lines and 90% of the branches of the production code. Coverage is
one of the counts of step 4: it starts from the baseline and may not fall, and at 90% the pass command fails below
it. The integration tests add nothing to it, since they run the built artifact.

Nothing is introduced that makes goals 4 to 6 harder to deliver later: no dependence on one agent's command-line
tool, no install step of our own, and no dependence of the tool on the skill being present.

### Halts

The agent stops and hands control to the human:

- at once, on an unexpected error, warning or ambiguous result from a tool;
- at once, on seeing a weakness, a weakened guardrail or a departure from the guidance: it is the first thing in
  the agent's message, and the work goes on only after the human confirms;
- before a change to anything on the list below, and before anything is posted outside the pull request;
- when the review of a pass is still not clean after three rounds;
- after M2, for approval of the harness;
- after M3, for approval, before any existing code is moved;
- after M4 and after M5, for review of what was built.

At a halt the agent reports what changed, the check run of every push, how the work stands against each goal, and
what it needs decided.

### Not to be touched

Unless the human approves it first, in a pull request that does nothing else:

- the guardrails: the lint, unused-code and compiler settings, the architecture test and the guardrails test;
- the harness of M2: the pass command, the list of protected paths and the pull request check;
- the pinned integration tests and the fixture repository, once M3 is approved;
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
| 1    | M2, M3, M4, M5           |
| 2    | M4                       |
| 3    | M4, M5                   |
| 4    | later plan; guarded here |
| 5    | later plan; guarded here |
| 6    | later plan; guarded here |
| 7    | M1 to M5                 |

### Running all tests

`./build.sh` at the repository root (existing).

### Milestone M1: Code generation works

A declarative orval configuration generates only the host operations in use, with their schemas and their mocks.

Verification: the configuration holds no branching, the generated clients hold only the declared operations, and the
verification command passes.

Done. The progress log holds its passes.

### Milestone M2: A harness that enforces the loop

Each failure the progress log records gets a mechanism that works without the cooperation of the
agent it constrains. The harness is a pull request of its own against main, since it changes the pipeline.

1. **A commit on a failing check.** One pass command runs every check to its end and exits with a failure when a
   check fails to run or a count rose. A hook kept in the repository runs it before a push.
2. **Counts typed by hand.** The pass command writes the counts to a file beside the progress log. The pull request
   check runs the same command and fails when its counts differ from the file, or rose since the push before.
3. **A guardrail changed inside feature work.** A code owners file is the one list of protected paths. The pull
   request check fails a pull request that changes a protected path together with any other path.
4. **A guardrail changed before it was approved.** The human owns the protected paths in that file, and main
   requires the review of a code owner and the pull request check.
5. **A pinned test edited to pass.** The pinned integration tests and the fixture repository join the protected
   paths when M3 is approved.
6. **A reviewer briefed by the worker.** The review of step 5 is run by the review tool, which writes each probe's
   instructions itself. The copy that reviews is the installed release, never the build of the branch, so the tool
   being rebuilt does not review itself. A pass is handed to it as two branch names, a marker at the last reviewed
   push and the working branch, since the installed release stops on a range given as commit ids.
7. **Works, claimed without evidence.** An entry of the progress log cites the check run of its push, and a claim
   outside a push names the command and its exit status.
8. **A sub agent changing what it is checked against.** A sub agent is given no permission to edit a protected
   path, and its work is judged by the same pull request check.

**Every source file is linted.** Each kind of source file has a linter, run with its strictest settings: semgrep,
biome, shellcheck, the JSON Schema tooling and knip. Their violations are counts of the pass command: each starts
from its baseline, only ever decreases, and ends at zero. A linter rule sniffs a smell. What gets fixed is what
the smell is truly about, and the review against the rules verifies that it was. A workaround disqualifies the
work completely: a rule switched off, a file left out, a suppression, a weaker preset, or code bent to slip past a
rule while the smell stays.

Where the linters stand, measured 2026-11-23 over the tracked files:

| Files                                   | Count | Linted today by                                            |
|-----------------------------------------|-------|------------------------------------------------------------|
| TypeScript and JavaScript of the tool   | 146   | biome with every rule, knip, the compiler at its strictest |
| TypeScript of the tracer bullets        | 26    | nothing                                                    |
| JSON schemas                            | 51    | the JSON Schema tooling; biome inside the tool             |
| Markdown                                | 43    | nothing                                                    |
| YAML: rules, workflows                  | 15    | validated against schemas where one exists; not linted     |
| HTML and CSS of the site                | 12    | the HTML checker, on the built site                        |
| Shell scripts                           | 7     | shellcheck, with its default checks, not all of them       |
| Dockerfiles and other files             | 11    | nothing                                                    |

Semgrep is installed on the machine and is run by nothing; the repository holds no rules for it.

Reporting at the moment of detection has no mechanism. It is a halt, and the human judges it at every halt against
the progress log.

Verification: each mechanism is seen to fail once on a planted violation, with the check run recorded: a raised
count, a check that did not run, a protected path changed beside another path, a counts file that differs from the
run, and an edit of a protected path by a sub agent.

### Milestone M3: Integration tests on one immutable repository

A black-box suite drives only the built artifact. One real, immutable git repository, whose branches are the use
cases, is used as it is by the git adapter and is the source stateless mock hosts answer from. The list of use
cases is agreed with the human first.

**Three independent parts.** The production code, the mock hosts and the integration tests have nothing in common:
no import in any direction, no helper, no type, no schema and no generated file. Reuse between them is forbidden.

- **The production code** is the tool that ships. It knows nothing of the tests, the mock hosts or the fixture.
- **A mock host** is not a part of the tool with its answers faked. It is a program of its own that plays the other
  side: it stands in for GitHub or Azure DevOps, answers in that host's own protocol from the fixture, asserts what
  it is sent, and persists nothing. It knows the host's protocol and the fixture, and nothing of the tool.
- **The integration tests** drive the built artifact from outside and compare what it answers. They know the tool's
  commands and answers as a user sees them, and nothing of the tool's code or of the mock hosts' code.

The three meet only while running. The tests start the built artifact through its command line. Between the
artifact and the mock hosts only HTTP is allowed, and that is all: the artifact speaks to a mock host as it would
to the real host, and plain git is served to it as git over HTTP. The artifact never reads the fixture from disk;
only the mock hosts do. The addresses of GitHub and Azure DevOps are not fixed in the tool, so the unchanged
artifact is pointed at the mock hosts. A mock host keeps a log of what it is sent, and the assertions are made on
that log: without it there is nothing to assert on. The production code keeps nothing when a post fails.

The mock hosts have two targets: one builds them, with the fixture, and one serves them. Building happens before
the server is started, and no test mutates what was built. The JSON the fixture holds is defined in a schema.
Each part that needs the shapes of a host derives them by itself from the specification the host publishes. The
production code generates no mocks, and those M1 left in its generated clients are removed.

**Dependency protection.** Each of the three has a folder of its own, and nothing connects the folders except HTTP.
Each folder is a package of its own, so that an import from one into another does not resolve, and an architecture
rule in each fails on any import from outside it. Those rules are protected paths.

Verification: the suite passes for all three hosts, and an import planted from each part into each of the other two
fails the build, in all six directions.

Use cases, proposed by the agent and not yet agreed. Cases 23 to 31 are what the agent filled in afterwards. Each
scenario is a branch of the fixture, and the state a scenario starts from, such as earlier threads, is read from the
fixture. The tool writes when it posts, and a mock asserts what it is sent, but no write is persisted, on any host.
A scenario ends with what the tool posts or answers. So every case has a workdir of its own, depends on no other
case, and all of them run in parallel.

The three hosts are GitHub, Azure DevOps and plain git. Plain git is the single source of truth: the fixture holds
everything a scenario starts from, earlier reviews included, plain git reads it as it is, and the mock server answers
for GitHub and Azure DevOps from it. So the three are the same, and every case about the content of a review runs
on all three. Only the technical failures differ by host, and a case in which no host takes part runs once.

**Group A: the complete happy path.** One review from the first command to the posted outcome, through every command
of the main agent and of the sub agent. Runs on all three hosts, which yield the same [[Surface]] and are posted the
same outcome.

1. A first review: lines added and removed over several files and commits, a file whose mode changes, a deleted
   file and a renamed file, on a base branch that has moved on since the branch was cut.
2. A [[Surface]] larger than one page, read page by page, forwards and back.
3. A finding on a line, a finding on the pull request as a whole, and a probe that finds nothing.
4. A second review after new commits: the [[Surface]] narrows to what is new and to the lines of threads the author
   resolved, a thread whose finding is fixed is settled, and one resolved without a fix is reopened.

23. Lists a host hands out in pages: more changed files and more threads than one page of the host holds.
24. Files that are not lines of text: a binary file, an empty file, and a file with no newline at its end.
25. A probe that is granted disk access is given the path to a checkout, and no other probe is.
26. Rule sets from outside our own are fetched over HTTP, from a mock host that serves them.

**Group B: early exits on the content.** Answered by prepare. No probe is started. Runs on all three hosts.

5. Too large: one file over the limit on its lines, a change over the limit on the total diff, and a change with
   more files than the limit.
6. Nothing to review: an empty [[Surface]], answered as refused.
7. Already reviewed: the head commit is reviewed and the author resolved no thread, answered without a further
   request to the host.
8. Refused: checks that failed, checks still running, and a merge conflict. The refusal is posted once, and an
   earlier refusal is closed when its cause is gone.
9. A URL no host recognises, answered as an unknown format. Once; no host takes part.
31. A pull request that is closed or merged, answered as refused. A draft, and a pull request from a fork, are
    reviewed like any other. GitHub and Azure DevOps.

**Group C: technical failures.** Each is answered with what failed and how the user recovers, and nothing is posted.

10. The workspace: a workdir that cannot be written to, and one reached through a symbolic link. Once, on plain git.
11. A command for a review the workdir does not hold: status before prepare, and a probe command with an unknown
    session or an unknown probe. Once, on plain git.
12. Input no command accepts: a report that is not valid, and a term the glossary does not hold. Once, on plain git.
13. A repository path that is no repository, and a branch that does not exist. Plain git.
14. Not allowed: no credentials (401), no permission to read (403, and the sign-in page Azure DevOps answers with
    203), no permission to write, and a pull request that cannot be written to (400 on Azure DevOps, 422 on
    GitHub). GitHub and Azure DevOps, each in its own shapes.
15. The host failing: a server error (500), a pull request that does not exist (404), and a failed download of the
    files. GitHub and Azure DevOps.
16. The host failing while the outcome is posted, after every probe has reported. GitHub and Azure DevOps.
17. A token set in the environment is sent, and none is sent when it is not set. GitHub and Azure DevOps.

27. A token in a form no host accepts.
28. The host limiting requests (429), and the host not answering in time. GitHub and Azure DevOps.
29. A report that names a line outside the [[Surface]], and one that names a rule the probe was not given. Once, on
    plain git.
30. Prepare run again in a workdir that already holds a review. Once, on plain git.

**Group D: concurrency and timing.** The controllers and the persistence do not differ by host, so these run on
plain git; 18 runs on all three, since each is posted to once.

18. Every probe of a review acknowledges and reports at the same moment: each report is kept and the outcome is
    posted once.
19. Status read while reports are written never shows a half-written review.
20. Two reports for one probe, as when a silent probe was started again: the probe counts once.
21. A probe that never acknowledges, and one that passes its deadline: status names each.
22. Two reviews at the same time, each in a workdir of its own, do not touch each other.

Everything a scenario starts from is stored in the `.reviews` folder of its branch, written by hand with the
fixture: each earlier review as JSON in the shape it was reported in, which names the commit it reviewed, the state
of its threads, including those the author resolved, and the checks of the head commit in `checks.json`. That
folder is the tool's own and is never part of the [[Surface]], so a head is already reviewed when nothing but it
has changed since that commit.

### Milestone M4: Adapter interfaces and controller implementation

The host and persistence adapter interfaces, and the controllers written against them and against the domain
interfaces.

Verification: the controller tests pass with every dependency replaced by a stand-in.

### Milestone M5: The simplest round trip

One command travels from the client to an endpoint and back: parsed at the perimeter, carried by the controller,
answered by an adapter, and encoded at the perimeter.

Verification: the round trip passes in the black-box suite of M3.
