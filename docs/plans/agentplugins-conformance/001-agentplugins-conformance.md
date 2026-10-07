# 001 — AgentPlugins conformance

|                |                                                                                         |
|----------------|-----------------------------------------------------------------------------------------|
| Plan           | `docs/plans/agentplugins-conformance/001-agentplugins-conformance.md`                   |
| Branch         | `001-agentplugins-conformance`                                                          |
| Started        | 2026-10-07                                                                              |
| Supersedes     | —                                                                                       |
| ADRs consulted | [0001](../../adrs/0001-separating-principles-rules-and-standards.md), [0002](../../adrs/0002-schema-validated-yaml-governance-documents.md), [0003](../../adrs/0003-axioms-above-principles.md), [0004](../../adrs/0004-schemas-and-taxonomy-published-to-the-web.md), [0005](../../adrs/0005-structure-is-described-in-json-schema.md), [0006](../../adrs/0006-diffs-are-described-in-a-schema-of-our-own.md) |
| ADRs added     | —                                                                                       |
| Status         | draft                                                                                   |

## Implementing Agent Instructions

Read this section first, and in full, before touching any code.

**Read before starting.**
[`RULES.md`](https://github.com/thruput-io/handbook/blob/main/RULES.md),
[`PHILOSOPHY.md`](https://github.com/thruput-io/handbook/blob/main/PHILOSOPHY.md),
[`WORKFLOW.md`](https://github.com/thruput-io/handbook/blob/main/WORKFLOW.md), and this plan end
to end. They outrank this plan; raise any conflict with the human instead of resolving it
yourself. Whether this repository's `rules/Rules.yaml` replaces the handbook's `RULES.md` here is an
[open question](#open-questions).

**Scope.** Implement exactly the milestones in [Execution Plan](#execution-plan), in order.
Anything not in this plan is out of scope — stop and ask rather than extending it.

**Definition of done.** Implementation is complete when every milestone's verification test
passes, `./build.sh` reports success, and every goal in [Goals](#goals) is delivered per the
[Goal coverage](#goal-coverage) table.

**Verification.** Run `./build.sh` — it lives at the repository root and exists today. Do not treat
a milestone as done on inspection alone.

### Progress log

Keep an append-only progress log for this attempt:

- Open `docs/plans/agentplugins-conformance/progress/001-attempt-{n}-{YYYY-MM-DD}.md` before the
  first change, where `{n}` is one higher than the highest attempt already in `progress/`.
- Append as you go: what you attempted, what the evidence showed, what you decided, what broke.
- **MUST NOT** rewrite, condense, or delete an existing entry. Corrections are new entries.
- **MUST NOT** amend or force-push a commit that contains progress-log entries.
- Commit the log alongside the work it describes.

**If this attempt is abandoned:** open a pull request carrying the progress log, and state in
the PR body what was attempted, where it broke, and what the next attempt should do
differently. Do not delete the branch or the log — the record of the failure is the deliverable.

## Background

This repository is installed as an [AgentPlugins](https://agentplugins.pages.dev/) plugin named
`thruput`, with `npx --yes @agentplugins/cli add thruput-io/agents`. Its manifest,
`agentplugins.config.json`, declares only a name, a version and a description.

The plugin provides two skills, `pr-review` and `dad-joke`, and one agent, `probe`. The pr-review
skill dispatches one `probe` subagent per instructions file, and names it by its bare name. The
agent is defined twice, in `agents/probe.md` and in an identical `.claude/agents/probe.md`. The
skill reaches the repository's rules and schemas through symlinks inside its own directory.

None of this is declared in the manifest, so nothing of it is packaged the way the AgentPlugins
documentation prescribes. What the documentation says, what 0.6.1 does, and where the two
disagree is recorded in the [research report](research/agentplugins-0.6.1/README.md).

The human's direction for this plan is to use the framework all the way and to follow its
documentation, see [D1](#discussions), [D2](#discussions) and [D4](#discussions).

### Goals

Draft, not yet agreed with the human.

1. Every component the plugin provides is declared in its manifest the way the AgentPlugins
   documentation prescribes.
2. The pr-review skill reaches its probe agent under the name the AgentPlugins documentation
   gives an installed agent.
3. The pull request check proves the manifest conforms, by running the framework's own checks
   for every harness the plugin declares.

#### Cheapest passing interpretation

Not yet recorded. Every goal needs a row the human has accepted.

| Goal | Cheapest way to "pass" while missing the point | How the goal excludes it | Accepted by |
|---|---|---|---|

### Non-goals

- `CLAUDE.md` and `GEMINI.md`. The human will handle them outside this repository, see
  [D2](#discussions).

## Summary

Not yet written. It follows the goals once they are agreed.

## Assumptions, risks and preconditions

| Assumption or risk | How it was tested | Result | If it turns out false |
|---|---|---|---|

**Preconditions.** Not yet established.

## References

### Tracer-bullet tests

| Question | Test | Outcome |
|---|---|---|

### Research

| Question | Short answer | Evidence | Report |
|---|---|---|---|
| What does the AgentPlugins documentation prescribe for skills, agents, naming and instruction files, and what does 0.6.1 do? | Skills are linked into every harness by `add`. Agents are emitted by `build` for Claude, Codex and OpenCode. Components are named `{plugin}:{component}`. Instruction files are not covered. Three points in the documentation contradict the tool. | Documentation links and Docker runs of 0.6.1 | [`research/agentplugins-0.6.1/`](research/agentplugins-0.6.1/README.md) |

### Rejected alternatives

| Alternative | Evidence gathered | Why rejected | Decision |
|---|---|---|---|
| Native harness manifests, `.claude-plugin/plugin.json` and `gemini-extension.json`, written by hand at the repository root | Claude Code and Gemini CLI documentation on plugin and extension agents | The human chose to use AgentPlugins all the way | [D1](#discussions) |
| Extending AgentPlugins upstream so `add` links agents and instruction files | AgentPlugins source of `add` and `linkNativeArtifacts` | The human chose to stop fighting the framework | [D4](#discussions) |

## Discussions

| # | Decision | Question put to the human | Answer (verbatim) | Decided by | Rationale | Date |
|---|---|---|---|---|---|---|
| D1 | AgentPlugins is the packaging mechanism, used throughout | "What would you like to clarify about the two questions? The approach for getting the probe into Claude Code and Gemini CLI, the fate of WORKFLOW.md, GITHUB.md and ADO.md, or something in the findings themselves?" | "i want to use the choosen frework all the way" | human | Rules out hand-written native harness manifests | 2026-10-07 |
| D2 | `CLAUDE.md` and `GEMINI.md` are out of scope; the plan follows the AgentPlugins documentation | none, the human gave the direction unprompted after the documentation was summarised | "ok, we will then deal with CLAUDE.md nad GEMINI.md outside of this repo, but plz now, FOLLLOW sigilco DOCS frantically AND MAKE a plan for turning pr-review skill INTO its framework guidelines" | human | Instruction files are outside what the documentation covers | 2026-10-07 |
| D3 | The two untracked experiment scripts are deleted before planning | "Do you agree to deleting the two scripts, and to that plan name?" | "scripts/agentplugins-preview.sh & scripts/agentplugins-add-trial.sh you shoud delete" | human | They broke the tracer-bullet rules and dirtied the tree | 2026-10-07 |
| D4 | The documentation is the authority; the plan conforms to it rather than measuring the framework against other needs | "Do you accept this problem statement and name, or do you want to reword either?" | "Stop fighting the framework" | human | The problem statement became "The pr-review skill is not packaged the way the AgentPlugins documentation prescribes." | 2026-10-07 |
| D5 | The plan is named `agentplugins-conformance` and covers the whole plugin, with pr-review as its main part | "Problem statement: \"The pr-review skill is not packaged the way the AgentPlugins documentation prescribes.\" Which plan name?" | "agentplugins-conformance" | human | The option described the scope as the whole repository's plugin | 2026-10-07 |

## Open questions

- [ ] ADR 0001 says this repository's rules replace the handbook's `RULES.md`, yet `PLANNING.md` and the
  global agent instructions still point at the handbook's `RULES.md`. Which governs this plan?
- [ ] Which harnesses does the plugin declare in `targets`? The documentation supports Claude Code, Codex,
  OpenCode and Pi Mono, and tracks Gemini.
- [ ] The documentation contradicts itself on `agents[].model`: the capability matrix says Claude emits it,
  the schema `audit` checks rejects it. How is the probe's cheapest-model requirement expressed?
- [ ] The documentation's agent examples use abstract tool names. Which names does the probe declare?
- [ ] The documentation names an installed agent `thruput:probe`. Is that the name pr-review dispatches?
- [ ] The documentation installs agents only through `build` output. How does a user of the plugin get the
  probe, and does `README.md` say so?
- [ ] Are the skills declared in the manifest with `filePath`, or left to the `skills/` scan `add` performs?
- [ ] Is the duplicate `.claude/agents/probe.md` deleted once the manifest declares the agent?
- [ ] Does the documentation cover a skill reaching files outside its directory, as pr-review does through
  its `rules` and `schemas` links?
- [ ] `PLANNING.md` cites `WORKFLOW.md#risk-assumptions-in-plan`, which does not exist, and the template
  places tracer bullets under `{test-context}/exploratory/` while `PLANNING.md` places them under the plan's
  `tracer-bullets/`. This plan follows `PLANNING.md`. Is that right?

## Execution Plan

Not drafted. `PLANNING.md` forbids it until everything above is agreed.
