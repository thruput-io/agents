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
This repository's rules, [`rules/Rules.yaml`](../../../rules/Rules.yaml), with the principles and definitions they
rest on, published at <https://thruput.se/agents/>, and this plan end to end. The rules outrank this plan; raise any
conflict with the human instead of resolving it yourself. The handbook's `RULES.md` does not apply, see
[D7](#discussions).

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
2. The pr-review skill runs its probes with nothing but what the documented install route,
   `agentplugins add`, delivers.
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
| Risk: `audit` passes without scanning for vulnerabilities when `osv-scanner` is absent | [`tracer-bullets/targets-claude-gemini-copilot/`](tracer-bullets/targets-claude-gemini-copilot/RESULT.md) | Confirmed: "Returning empty result", verdict PASS | Accepted in [D15](#discussions) |
| Risk: 0.6.1 ignores `lint --max-warnings 0`, so lint warnings pass the check until a release honours the flag | [`tracer-bullets/lint-max-warnings/`](tracer-bullets/lint-max-warnings/RESULT.md) | Confirmed: exit 0 with one warning | Accepted in [D12](#discussions) |
| Risk: once a release honours the flag, the undocumented "no hooks" warning fails the check for the targets of [D8](#discussions) | Same tracer bullet: the warning is raised whenever `targets` is set and no hooks are | Confirmed for 0.6.1 | The check fails on that upgrade and the targets decision is reopened |

**Preconditions.** Not yet established.

## References

### Tracer-bullet tests

| Question | Test | Outcome |
|---|---|---|
| Does 0.6.1 accept `targets` claude, gemini, copilot with the probe agent and pr-review skill, and what does `build` emit? | [`tracer-bullets/targets-claude-gemini-copilot/`](tracer-bullets/targets-claude-gemini-copilot/RESULT.md) | Accepted by lint, validate, audit and build. Only claude gets the agent. Gemini gets no skill. Unexpected warnings, see the result |
| Does `lint --max-warnings 0` fail on the "no hooks" warning, and what does `lint --json` report? | [`tracer-bullets/lint-max-warnings/`](tracer-bullets/lint-max-warnings/RESULT.md) | Disproved: exit 0 with one warning, and `lint --help` lists no `--max-warnings`. `--json` counts the warning in `summary.warnings`, in a shape the documentation does not show |

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
| D6 | The handbook's `PLANNING.md` governs how this plan is run, although it is obsolete elsewhere | "Do you agree that `rules/Rules.yaml` governs the plan's content and the handbook's PLANNING.md governs the process?" and, after the agent stopped because PLANNING.md is obsolete, "Which do you want?" | "planning.md is obselete" and then "but we will use it here" | human | Keeps the planning skill's process; it rules out stopping for a replacement process | 2026-10-07 |
| D7 | This repository's `rules/Rules.yaml` governs the plan's content, not the handbook's `RULES.md` | "Do you agree that `rules/Rules.yaml` governs the plan's content?" | "yes it will be reitered" | human | ADR 0001 moved the rules here, and pr-review reviews the resulting change against them | 2026-10-07 |
| D8 | The plugin targets Claude Code and Gemini CLI, and GitHub Copilot if possible | "What would you like to clarify about the targets question? It could be what declaring a target commits the plugin to, the per-harness table, or my recommendation." | "claude, gemini and if possible copilot" | human | "If possible" for Copilot is settled by the tracer bullet `targets-claude-gemini-copilot` | 2026-10-07 |
| D9 | The probe is folded into the pr-review skill: pr-review dispatches an ordinary subagent with its fixed message, and `agents/probe.md` and `.claude/agents/probe.md` are deleted | "Which do you choose?", between "1. Fold the probe into the skill" and "2. Declare the probe in the manifest's agents list, and have pr-review dispatch it as `thruput:probe`" | "1" | human | `add`, the documented install route, delivers skills to every target and agents to none. The cost is the agent file's model pin, tool list and CLAUDE.md opt-out | 2026-10-07 |
| D10 | The build and the pull request check run `agentplugins lint --max-warnings 0` as a step of its own | "Does the pull request check run `lint --max-warnings 0`, and how is the undocumented \"no hooks\" warning treated?", put in conversation after the human asked "they had a linter as well?" | "'-max-warnings 0' and a lint target" | human; the reading of "a lint target" is confirmed in [D11](#discussions) | Rule Strict presets. The tracer bullet `lint-max-warnings` shows 0.6.1 does not fail on a warning with this flag | 2026-10-07 |
| D11 | The AgentPlugins lint is introduced the way the repository's other linters are: a pinned `npx --yes @agentplugins/cli@0.6.1 lint --max-warnings 0` line in `scripts/verify.sh` and its own `run:` step in `.github/workflows/pr-check.yml`. This confirms the reading of "a lint target" in D10 | "Confirm or correct my reading of \"a lint target\"", among the next steps after the agent stopped on `--max-warnings` | "yes linting should be introduced same way our other linters work¨" | human | Rule Consistent with the codebase; `@sourcemeta/jsonschema` lint is wired exactly this way | 2026-10-07 |
| D12 | Rule Strict presets is met by wiring `lint --max-warnings 0` as documented and recording that 0.6.1 does not honour the flag | "Which do you choose?", between "1. Wire it like the other linters and record the gap", "2. Fail on the JSON count" and "3. Remove the warning's source" | "1" | human | Rules out a script over the undocumented JSON shape, and keeps the targets of D8 | 2026-10-07 |
| D13 | `agentplugins.config.json` is renamed to `agentplugins.json`, and `scripts/verify.sh` and the PR check point at the new name | "The docs name the manifest agentplugins.config.ts or agentplugins.json. Rename agentplugins.config.json?" | "Rename to agentplugins.json (Recommended)" | human | The documented JSON name; the lint tracer bullet showed lint loads it | 2026-10-07 |
| D14 | pr-review and dad-joke are declared in the manifest's `skills` with `filePath` | "How are the two skills, pr-review and dad-joke, found by the framework?" | "Declare with filePath" | human | Passes the schema `audit` checks. The docs name the field `path` | 2026-10-07 |
| D15 | `audit` stays in the build and the PR check; its skipped vulnerability scan is a recorded gap | "audit is undocumented, but the pull request check runs it. Does it stay?" | "Keep audit (Recommended)" | human | The only command shown to validate the manifest against the published schema, which ADR 0005 favours | 2026-10-07 |

## Open questions

- [x] Which process governs this plan? — closed by the human: `PLANNING.md`, [D6](#discussions)
- [x] Which rules govern the plan's content? — closed by the human: `rules/Rules.yaml`, [D7](#discussions)
- [x] Which harnesses does the plugin declare in `targets`? — closed by the human: claude, gemini, and copilot if possible, [D8](#discussions)
- [x] The documentation contradicts itself on `agents[].model`: the capability matrix says Claude emits it, … — closed by the human: no plugin agent, [D9](#discussions)
- [x] The documentation's agent examples use abstract tool names. Which names does the probe declare? … — closed by the human: no plugin agent, [D9](#discussions)
- [x] The documentation names an installed agent `thruput:probe`. Is that the name pr-review dispatches? … — closed by the human: no plugin agent, [D9](#discussions)
- [x] The documentation installs agents only through `build` output. How does a user of the plugin get the … — closed by the human: no plugin agent, [D9](#discussions)
- [x] Are the skills declared in the manifest, and with the documented `path` or the schema's `filePath`, or left … — closed by the human: declared with `filePath`, [D14](#discussions)
- [x] Is the duplicate `.claude/agents/probe.md` deleted once the manifest declares the agent? … — closed by the human: no plugin agent, [D9](#discussions)
- [ ] Does the documentation cover a skill reaching files outside its directory, as pr-review does through
  its `rules` and `schemas` links?
- [x] The documentation names the manifest `agentplugins.config.ts` or `agentplugins.json`. Is … — closed by the human: renamed to `agentplugins.json`, [D13](#discussions)
- [x] Does the pull request check run `lint --max-warnings 0`? — closed by the human: yes, as its own step, [D10](#discussions)
- [x] 0.6.1 does not fail `lint --max-warnings 0` on a warning. How is Strict presets met? — closed by the human: wire the documented flag and record the gap, [D12](#discussions)
- [x] `audit` is not documented, yet the pull request check runs it. Does it stay? … — closed by the human: it stays, [D15](#discussions)
- [ ] How does pr-review ask for the cheapest model for each probe now that no agent file pins it?
- [ ] `PLANNING.md` cites `WORKFLOW.md#risk-assumptions-in-plan`, which does not exist, and the template
  places tracer bullets under `{test-context}/exploratory/` while `PLANNING.md` places them under the plan's
  `tracer-bullets/`. This plan follows `PLANNING.md`. Is that right?

## Execution Plan

Not drafted. `PLANNING.md` forbids it until everything above is agreed.
