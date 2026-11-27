# 003 — PR Review Tool: Least Exposure per Agent and Boundaries Generated From Specs

Draft, not yet accepted. Version 003 of this plan. The goals are those of version 002, unchanged.

## Background

Version 002 planned how the old review tool would be moved to a new design, and listed the 65 [[Violation]]s a
review found in that old code. Since then the old tool was replaced by a skeleton built to the design, and one spike
through it works: a [[Change]] is read from a plain git repository, each probe is handed the [[Rule]]s of its group
and a glossary, the review is kept on disk between commands, and a sub agent acknowledges and reports.

The tool cannot yet finish a review. Posting the outcome and starting and stopping sub agents are stand-ins that
stop the program, the adapters for GitHub and Azure DevOps are empty, and no test drives the built tool from
outside. Most of the files the 65 [[Violation]]s cite no longer exist, so they no longer describe the work.

The guardrails changed as well. Version 002 planned checks that hold without the agent's cooperation; they were
built, in part differently from what it describes.

This version plans the rest of the work from the skeleton: each stand-in is replaced by what it stands for, under
the guardrails as they are. Versions 001 and 002, their progress logs, and
[ADR 0010](../../adrs/0010-pr-review-probe-tool-and-submission-lifecycle.md) stand where this version does not say
otherwise.

### Goals

The cheapest passing interpretations and exclusions are the [[AI agent]]'s proposals, not yet accepted.

1. The skill, with its tools, reviews a [[Change]] against all [[Rule]]s.
   - Cheapest passing interpretation: review against the [[Rule]]s that fit in one prompt.
   - Exclusion: the [[Ledger]] holds a row with a [[Verdict]] for every [[Rule]], and a review with a missing row is
     not posted.
2. The skill eliminates [[AI agent]] bias.
   - Cheapest passing interpretation: instruct the [[AI agent]] to be objective.
   - Exclusion: no [[AI agent]] chooses which [[Rule]]s apply, what the [[Surface]] is, or what the outcome is; the
     tool decides those in code, and each probe is boxed to its own [[Rule]]s and permissions.
3. The skill wastes no tokens on [[AI agent]]s working out what to do.
   - Cheapest passing interpretation: hand every [[AI agent]] one complete manual to read.
   - Exclusion: an [[AI agent]] is handed its next command and only the shapes that command uses.
4. The skill is [[AI agent]] agnostic and supports the opencode, claude, copilot and agy command-line tools.
   - Cheapest passing interpretation: support one of them and document workarounds for the rest.
   - Exclusion: the same skill runs unchanged in all four, and nothing in it depends on one of them.
5. The skill is distributable through industry-standard mechanisms.
   - Cheapest passing interpretation: a bespoke install script that copies files into place.
   - Exclusion: it installs through a standard plugin or package mechanism with no step of our own.
6. The tool can be externalized and used by humans.
   - Cheapest passing interpretation: a person can run it only by imitating an [[AI agent]]'s session.
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

The skeleton shows how every part is built, and the rest is built the same way.

- A value of the domain is generated from the tool's schemas as a frozen class with a private constructor. It is
  created and read back only through its zod codec, and only the perimeters parse.
- The domain holds the ports the controllers work against: the host, the sub agents and the store of reviews. A
  result and its failure travel in an Effect and are folded at the perimeter.
- The main agent and the sub agent each have an entry point, a client and a controller of their own, and neither
  depends on the other's. Their commands, arguments and help are generated from one schema each.
- A probe is YAML data inside the tool and names exactly one rule group.
- Only the entry points connect adapters to controllers. An adapter that does not exist yet is a stand-in that
  stops the program, and the build counts the stand-ins in use.

The work is done one stand-in at a time. Each milestone replaces stand-ins by real adapters, proves the result
from outside with black-box tests against stateless mock hosts, and lowers the count. The plan is executed when the
count is zero, the stand-ins are deleted, and none of the 65 [[Violation]]s of version 002 is present in the code.

## Assumptions, risks and preconditions

### Assumptions

- A zod codec can have an opaque [[Domain object]] as its domain side, with no cast. Tested: every generated value
  of the skeleton is built so, and the unit tests of the build create and read them back.
- A plain git repository can be served to the tool as git over HTTP by a mock host of its own. Tested: the narrow
  tests of the git adapter run against it in the build.
- Orval generates checked shapes for the named arguments, the answer and the refusal of a command from an OpenAPI
  document, and follows a reference from it into the domain schema. Tested in `tracer-bullets/orval-client-shapes`,
  which is built and run with docker and fails when the document changes or the reference is not allowed.
- An agent's command-line tool can be started by the tool with only the permissions of one probe, and stopped by
  it. Not tested; a tracer bullet proves it before M3 starts.
- A client that holds only the operations in use can be generated from the specification a host publishes. Tested
  in M1 of version 002 with orval; the build of the skeleton no longer holds that generator, so it is proven again
  at the start of M5.

### Risks

- The glossary defines [[Head commit]] as the commit every inline comment resolves against. Without it in the
  [[Change]], commits pushed between reading and posting can shift lines; pinning falls to the adapter.
- With stateless mock hosts, scenario history has to be readable from the fixture's branches.
- A hook in a working copy can be skipped by whoever pushes, so only the pull request check binds. The pull
  request check runs the build; it does not hold the limit on the size of a push.
- The hook refuses every push that changes a guardrail, with no message. Such a change can only be pushed past the
  hook, which is the same act as skipping it.
- The count of stand-ins is a ceiling the build compares with. It stands at 12 while the code holds 8, so four
  stand-ins can be added unseen.
- The main branch has no branch protection and the repository has no code owners file.
- Starting an agent's command-line tool from the tool is where a dependence on one agent can enter, against goal 4.
- Reporting at the moment of detection has no mechanism.
- One unit test of the entry points failed once in a build and passed in every build since. The cause is unknown.

### Preconditions

- A new ADR supersedes ADR 0010 decision 1 (interfaces in OpenAPI), ADR 0010 decision 7 (token from the environment)
  and ADR 0009 decision 1 (a [[Change]] without host coordinates, probes as YAML data), and adds the adapter
  operations, the perimeters folder, opaque [[Domain object]]s and the generated mirror.
- The human, not the agent, pushes a change to a guardrail.
- The open questions below are closed.

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

The decider of every row is the human. Rows 1 to 118 are those of
[version 002](002-pr-review-probe-lifecycle.md#discussions) and stand as they are written there. The rows below
continue their numbering and quote the human.

119. Is a new version of the plan made? Yes: "i want to make a new version on plan, objectvies tays the same, our
     skeleton shows how stuff should be built, gueardrails are much better now".
120. What does the new version start from? "we did the skeleton and you implmented one spike".
121. May the goals change in it? No: "plz do it, do not touch objectives".
122. Text is turned into values and back in the code with no schema behind it: "completely missing the point in
     haveing schemas". Is that fixed before the rest? Yes: "Ye skeletong has to be perfect before we start".
123. Where is the answer of a command defined? With the command, not in a file of answers: "answers.schema.json
     seems completely wrong, it should be incosporated in the other schemas".
124. What defines a client, and what does its help answer? "The help tool should only return what should already
     be a desciption of the clients method in an openapi spec".
125. Is the whole package file of the tool a guardrail? No: "group the invoication of guardrails in it and only
     restrict that part", and of the install permissions: "ok add allowScripts as wel".

## Open questions

Each has the agent's recommendation. None is decided.

1. Rows 13 and 96 decide that the adapter interfaces are generated from OpenAPI by orval. The skeleton writes its
   ports by hand in the domain. Which stands? Recommendation: the skeleton, since the ports take and return only
   [[Domain object]]s and no shape crosses a boundary there; a new row then replaces rows 13 and 96 for the ports.
2. What does posting the outcome mean on plain git? Rows 83, 87 and 105 leave it open. Recommendation: the outcome
   is written into the workdir of the review and answered to the main agent, and nothing is written to the
   repository.
3. Which agent's command-line tool is the first the tool starts sub agents with? Recommendation: claude, behind
   the port, so that each of the other three is one more adapter.
4. How is a change to a guardrail delivered, given that the hook refuses it? Recommendation: in a push that holds
   nothing else, made by the human past the hook, and the plan names that as the one governed use of it.
5. Version 002 promised a code owners file, a file of counts compared by the pull request check, and a linter for
   Markdown, YAML and Dockerfiles. None exists. Are they built or dropped? Recommendation: build the linters in M1,
   and drop the other two, since the checksum list and the hook now do their work.
6. Do the use cases of version 002 that the human has not agreed, 23 to 31, stand? Recommendation: each is agreed
   or dropped when the milestone it belongs to starts.

## Baseline

Measured 2026-11-27 on branch `pr-review-plan-002` at commit `a5a17e4`, with the build command at the repository
root, which exits 0:

| Check                                   | Result                                      |
|-----------------------------------------|---------------------------------------------|
| Unused code, anywhere and in production | passes                                      |
| Lint, at the tightened limits           | passes                                      |
| Semgrep                                 | 0 findings                                  |
| Type check                              | passes                                      |
| Unit tests                              | 167 of 167 pass                             |
| Unit test coverage                      | 92.85% of the lines, 97.88% of the branches |
| Narrow tests of the adapters            | 5 of 5 pass                                 |
| Black-box integration tests             | none exist                                  |
| Stand-ins in use                        | 8, under a ceiling of 12                    |
| Adapters with no code                   | GitHub, Azure DevOps                        |

The pull request check passed on the commit before it, `f00ebd7`.

## Execution Plan

Draft. The milestones are worked in order.

### The guardrails as they are

- One build command runs every check and stops at the first that fails: generation, the build of the two entry
  points, unused code anywhere and in production, lint, semgrep, the type check, the unit tests with their
  coverage, and the narrow tests. The pull request check runs the same command.
- Lint holds a function to 30 lines, a file to 200, a line to 120 characters, a function to 3 parameters, nesting
  to 2 levels and cognitive complexity to 10.
- The unit tests cover at least 90% of the lines and of the branches of the production code, or the build fails.
- The architecture test holds the layout: what each layer may depend on, that the two agents' sides never meet,
  that the mock host and the integration tests share nothing with the production code, and that every file lives
  in a folder of the layout.
- Semgrep rules of our own hold what lint cannot: only the perimeter parses, the domain and the controllers
  neither serialize nor tag themselves, no input is ignored, and only a stand-in stops the program.
- A list of checksums names every guardrail file. The build fails when a file differs from its checksum.
- A hook refuses a push that changes a guardrail, and a push of more than 400 written lines.

### The loop

Every milestone is worked in passes. A pass is one push with one purpose, under 400 written lines:

1. Start from a clean working tree, level with the branch on the host. State the purpose of the pass and the goal
   it serves. Work that serves no goal is dropped.
2. Write the failing test first, and see it fail.
3. Make the smallest change that turns it.
4. Run the build command and read its exit status. A pass is not pushed on a failing build.
5. Push through the hook. The human reviews the push. The agent runs no review of its own.
6. Record the pass in the progress log of this version, citing the check run of the push.

No check is disabled, muted, excluded or weakened, and no code is bent to slip past a rule while the smell stays.
A stand-in is never added. Nothing is introduced that makes goals 4 to 6 harder to deliver later: no dependence on
one agent's command-line tool outside its adapter, no install step of our own, and no dependence of the tool on
the skill being present.

### Halts

The agent stops and hands control to the human:

- at once, on an unexpected error, warning or ambiguous result from a tool;
- at once, on seeing a weakness, a weakened guardrail or a departure from this plan: it is the first thing in the
  agent's message, and the work goes on only after the human confirms;
- before a change to anything on the list below;
- after every milestone, for review of what was built.

At a halt the agent reports what changed, what is still wrong, and what it needs decided.

### Not to be touched

Unless the human approves it first:

- the guardrails: every file in the list of checksums, and the list itself;
- the fixture repository and the black-box tests of a milestone, once the human has reviewed that milestone;
- published ADRs, and versions 001 and 002 of this plan with their progress logs;
- the governance documents and their schemas;
- generated code, which is never edited by hand;
- the main branch. No pull request goes to it until the plan is executed.

### Goal coverage

| Goal | Milestones               |
|------|--------------------------|
| 1    | M2 to M7                 |
| 2    | M3, M4                   |
| 3    | M2, M3, M4               |
| 4    | later plan; guarded here |
| 5    | later plan; guarded here |
| 6    | later plan; guarded here |
| 7    | M1 to M7                 |

### Running all tests

`./build.sh` at the repository root (existing).

### Milestone M1: The count is exact and the old findings that remain are gone

The ceiling on stand-ins is set to the number in the code, and it is set again at the end of every milestone. Of
the 65 [[Violation]]s of version 002, those whose cited file still exists are checked against the code as it is
now, and each one still present is resolved. Every kind of source file that has no linter gets one, as open
question 5 is answered.

Verification: a stand-in planted in an entry point fails the build. For each of the 65 the progress log names
where it stood and that it is gone, and the build passes.

### Milestone M2: Every shape that leaves the tool comes from a schema

The skeleton is made right before anything is built on it. The answer of every command and the stored review are
defined in the tool's schemas, and the perimeters encode and decode through what is generated from them. The
codecs written by hand leave the domain. Text becomes a checked value, and a value becomes text, in one place of
the perimeters; the generator checks the schemas it reads, and the tests check the lines they read. A guardrail
then refuses the two calls that turn text into an unchecked value and back, anywhere else in the tool.

Verification: the build passes, no file of the domain holds a codec, and one of the two calls planted in each
layer fails the build.

### Milestone M3: The tool starts and stops its sub agents

The stand-in for the sub agents is replaced by an adapter that starts one sub agent for each probe, with the
permissions of that probe and nothing else to tell it what to do but its first command, and stops it when it has
nothing left. The sub agent's entry point works on the stored review and no longer on a stand-in host.

Verification: the unit tests of the controllers pass with the adapter replaced by a stand-in of the tests, a
narrow test starts and stops a real sub agent, and the count of stand-ins has fallen by those removed.

### Milestone M4: One review on plain git, from the first command to the outcome

Posting gets its adapter for plain git, as open question 2 is answered. The black-box suite is started: it drives
only the built tool through its command line, against the fixture repository served over HTTP, and holds the
complete happy path of version 002, use cases 1 to 4. The fixture and the list of use cases are agreed with the
human first.

Verification: the suite passes on plain git, an import planted from the suite into the production code and from
the production code into the suite fails the build, and no stand-in of the host is left in an entry point.

### Milestone M5: GitHub

The GitHub adapter reads a [[Change]] and posts an outcome through a client generated from the specification
GitHub publishes, holding only the operations in use. A stateless mock host answers in GitHub's own protocol from
the fixture and keeps a log of what it is sent. The suite gains the early exits and the technical failures of
version 002 that involve a host.

Verification: the suite passes on plain git and on GitHub with the same outcome posted for the same use case, and
the assertions on a post are made on the log of the mock host.

### Milestone M6: Azure DevOps

The same for Azure DevOps, in its own shapes and failures.

Verification: the suite passes on all three hosts.

### Milestone M7: Zero

The use cases of version 002 not yet covered, concurrency and timing among them, join the suite. The stand-in
adapters, their count, and the rules that exist only for them are removed.

Verification: no stand-in exists, none of the 65 [[Violation]]s of version 002 is present, every check of the
build passes with none disabled, and the suite passes on all three hosts.
