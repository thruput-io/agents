---

name: pr-review
description: Reviews a GitHub or Azure DevOps pull request, or a change in a plain git repository, against the thruput-io rules bundled with this skill (published at https://thruput.se/agents/), and posts one review with inline comments on the correct lines. The tool starts one boxed sub agent per probe itself and decides the outcome in code, so the reviewing agent never chooses a rule, a model or a verdict. Use when the user gives a PR URL or asks for a rules-driven PR review.
compatibility: Requires node and git, and the command-line program of the agent that runs the review, which the tool starts its sub agents with.
---

# PR Review Instructions

`<skill>` is the directory containing this `SKILL.md`. Terms in `[[Term]]` brackets are defined in
`<skill>/rules/Definitions.yaml`.

You run two commands of `<skill>/dist/bin/review-tool.mjs`: `prepare` and `status`. `-h` prints them with their
arguments. Each answers one line of JSON, and exits with 0 for an answer and 1 for a failure.

## Operating Boundaries

- **This `SKILL.md` is for the reviewing agent only.** A sub agent never reads it; the tool hands each sub agent its own
  instructions.
- **Do not start, instruct, message or stop a sub agent.** The tool starts one per probe, with the permissions,
  instructions and model the probe defines, and stops each when its work is done.
- **Do not inspect the [[Change]] before `prepare`,** and do not evaluate a [[Rule]] or decide a [[Verdict]] at any
  point.
- **Do not read or change the workdir,** and do not run `<skill>/dist/bin/review-tool-probe.mjs`. That executable
  belongs to the sub agents.
- **On a failure, report the answer to the user and stop.** Do not review another way.
- **When a command prints no line of JSON, the tool stopped at a step it does not implement yet.** Report what it wrote
  on standard error to the user and stop. Do not run it again, and do not review another way.

## 1. Prepare

Use a workdir of its own for each review, such as `.pr-review/<id>/work`, and empty it first:

```sh
rm -rf <workdir>
mkdir -p <workdir>
<skill>/dist/bin/review-tool.mjs prepare <url> <workdir>
```

`prepare` reads the [[Change]] from the host, starts the sub agents, and answers how the review stands. A failure names
why no review was started: the address is not valid or no host recognises it, the [[Change]] is already reviewed, too
large or not in a state to review, the host failed, or a sub agent could not be started.

## 2. Status

```sh
<skill>/dist/bin/review-tool.mjs status <workdir>
```

Run `status` until it answers that the review is complete. The sub agents report one [[Verdict]] per [[Rule]]; when the
last one is in, the tool builds the outcome and posts the review to the host in code. `status` also shows a review that
is complete but could not be posted, with the host's failure.

Report what `status` answers to the user.
