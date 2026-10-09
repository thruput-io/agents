# 001 — AgentPlugins conformance

|                |                                                                                         |
|----------------|-----------------------------------------------------------------------------------------|
| Plan           | `docs/plans/instruction-distribution/001-instruction-distribution.md`                   |
| Branch         | `001-instruction-distribution`                                                          |
| Started        | 2026-10-07                                                                              |
| Supersedes     | —                                                                                       |
| ADRs consulted | [0001](../../adrs/0001-separating-principles-rules-and-standards.md), [0002](../../adrs/0002-schema-validated-yaml-governance-documents.md), [0003](../../adrs/0003-axioms-above-principles.md), [0004](../../adrs/0004-schemas-and-taxonomy-published-to-the-web.md), [0005](../../adrs/0005-structure-is-described-in-json-schema.md), [0006](../../adrs/0006-diffs-are-described-in-a-schema-of-our-own.md) |
| ADRs added     | —                                                                                       |
| Status         | planning: exploration reopened by D41                                                   |

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

- Open `docs/plans/instruction-distribution/progress/001-attempt-{n}-{YYYY-MM-DD}.md` before the
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

Intent, in the human's words ([D25](#discussions)):

1. Distribute instructions to agents.
2. In future our agents will be running more advanced tasks, and we need more advanced ways of doing so.

### Goals

In the human's words and priority order ([D25](#discussions)):

1. Make our pr-review skill conform to microsoft/apm.
2. Support Gemini.
3. Support Claude.
4. Support Copilot.

The human's fifth goal, "Manage default GEMINI.md and CLAUDE.md instructions", is moved to a plan of its own, see
[Non-goals](#non-goals).

#### Cheapest passing interpretation

| Goal | Cheapest way to "pass" while missing the point | How the goal excludes it | Accepted by |
|---|---|---|---|
| 1 | Add `agentplugins.json` declaring the skills, while pr-review still dispatches the undeclared `probe` agent | Conform means: the framework's own `lint`, `validate` and `audit` pass, and everything pr-review needs arrives through `agentplugins add` | [D27](#discussions) |
| 2, 3, 4 | `add` places `pr-review` in the harness's skills directory, and no review is ever run there | Support means: after `agentplugins add thruput-io/agents`, a full pr-review runs on that harness with no further step | [D27](#discussions) |

### Non-goals

- `CLAUDE.md` and `GEMINI.md`, the human's fifth goal. They get a plan of their own, because the AgentPlugins
  documentation does not cover instruction files, see [D2](#discussions) and [D26](#discussions).
- Automating the end-to-end check in CI. It gets a plan of its own; this plan verifies support by a recorded
  acceptance run, see [D33](#discussions) and [D34](#discussions).

## Summary

The manifest is renamed to the documented `agentplugins.json` and declares both skills, the targets claude, gemini
and copilot, and the license; the framework's own `lint`, `validate` and `audit` judge it in every build and pull
request, wired like the repository's other linters (M1). The `probe` agent, which `agentplugins add` never installs,
is folded into the skill: pr-review dispatches ordinary subagents, and each kind of probe names in its schema the
model tier its subagent runs on (M2). A recorded acceptance run in an empty user account installs the plugin with
`agentplugins add` and runs a full pr-review on Claude Code, Gemini CLI and Copilot's CLI (M3).

## Assumptions, risks and preconditions

| Assumption or risk | How it was tested | Result | If it turns out false |
|---|---|---|---|
| Risk: a skill's name or description can drift between `agentplugins.json` and its SKILL.md, with nothing catching it | untested; a consequence of the declaration | Accepted breach of the rule No second representation | Accepted in [D18](#discussions) |
| Risk: a probe can halt on an instruction its harness loaded, such as a global rule to stop on warnings, and leave no ledger, which `review.mjs` then refuses | untested | Accepted with the loss of the agent file's CLAUDE.md opt-out | Accepted in [D20](#discussions) |
| Risk: Gemini CLI's documentation does not say it runs subagents in parallel | documentation read, see [Research](#research) | Not found | Reviews on Gemini are slower; settled by M3 ([D28](#discussions)) |
| Risk: Gemini CLI may not load skills from `~/.gemini/skills`, where `add` links them | documentation read, see [Research](#research) | Not verified | Gemini never sees pr-review and goal 2 fails at M3 ([D28](#discussions)) |
| Risk: Gemini CLI stops a subagent after 15 turns or 5 minutes by default, which a probe on a large change can exceed | documentation read, see [Research](#research) | Documented limits | The probe leaves no ledger and the review is refused; settled by M3 ([D28](#discussions)) |
| Assumption: `agentplugins add` installs a branch from a tree URL | source read: `parseBranch` and `cloneRepo` in [store.ts](https://github.com/sigilco/agentplugins/blob/main/packages/store/src/store.ts) | `git clone --branch <segment after /tree/>` | M3 step 2 fails; stop and report |
| Risk: `audit` passes without scanning for vulnerabilities when `osv-scanner` is absent | [`tracer-bullets/targets-claude-gemini-copilot/`](tracer-bullets/targets-claude-gemini-copilot/RESULT.md) | Confirmed: "Returning empty result", verdict PASS | Accepted in [D15](#discussions) |
| Risk: 0.6.1 ignores `lint --max-warnings 0`, so lint warnings pass the check until a release honours the flag | [`tracer-bullets/lint-max-warnings/`](tracer-bullets/lint-max-warnings/RESULT.md) | Confirmed: exit 0 with one warning | Accepted in [D12](#discussions) |
| Risk: once a release honours the flag, the undocumented "no hooks" warning fails the check for the targets of [D8](#discussions) | Same tracer bullet: the warning is raised whenever `targets` is set and no hooks are | Confirmed for 0.6.1 | The check fails on that upgrade and the targets decision is reopened |

**Preconditions.** For M1 and M2, none beyond a clean checkout of the branch. For M3, an empty user account on this
machine with `node`, `tar` and `git` on `PATH`, Claude Code, Gemini CLI and GitHub Copilot's CLI installed and signed
in, and a small git repository other than this one cloned, see [M3](#milestone-m3-a-full-pr-review-runs-on-claude-gemini-and-copilot-after-install).

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
| Can GitHub Copilot's CLI run pr-review? | Yes: subagents with a separate context, run in parallel, with all tools by default; skills load from `~/.copilot/skills` and `~/.agents/skills`, where `add` links them. The human stated "Copilot support subagents" | [about custom agents](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-custom-agents), [create custom agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli), [create skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills) | documentation only |
| Can Gemini CLI run pr-review? | Subagents are documented, enabled by default under an experimental toggle, with 15-turn and 5-minute default limits. Parallel subagents and loading `~/.gemini/skills` are not documented | [subagents](https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md), [extensions reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md) | documentation only |
| Does `agentplugins add` keep pr-review's links to `rules/` and `schemas/` working? | Yes: the whole plugin stays in one store directory and each skill is symlinked from it | [skills.md § Symlink behavior](https://github.com/sigilco/agentplugins/blob/main/docs/guide/skills.md#symlink-behavior) | [`research/agentplugins-0.6.1/`](research/agentplugins-0.6.1/README.md) |

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
| D16 | Withdrawn by D18. The declared skills' name and description are generated from each SKILL.md's frontmatter | "Which do you choose?", between "1. A check that the copies agree", "2. Generate the declarations from the frontmatter at build time" and "3. Accept the duplicate and record it" | "2" | human | Meant to meet the rule No second representation | 2026-10-07 |
| D17 | Withdrawn by D18. The generation is done by an `agentplugins.config.ts` that reads the frontmatter at load time | "`add` reads the manifest from GitHub, so the skill declarations must be in a committed file. How should option 2, generating them from SKILL.md frontmatter, be realised?" | "TS manifest reads frontmatter (Recommended)" | human | Would have reopened D13 | 2026-10-07 |
| D18 | Nothing is generated. `agentplugins.json` declares each skill's name and description beside its SKILL.md; the duplicate is an accepted breach of the rule No second representation. D13 stands | none, the human withdrew D16 and D17 unprompted | "dont generate we will have dupes" | human | Recorded in the risk table | 2026-10-07 |
| D19 | Probes run on the cheapest model available and the context probe on the most capable, set by the dispatching session where its harness allows. Refined by D29 | "With no agent file pinning `model: haiku`, how does pr-review get the cheapest model for each probe?" | "Dispatcher picks per harness (Recommended)" | human | The agent file that pinned the model is deleted under D9 | 2026-10-07 |
| D20 | Probes run with whatever instructions their harness loads; nothing is added to the instructions schema | "The agent file also kept CLAUDE.md out of probes. Ordinary subagents may now load the user's global instructions, such as stopping on any warning. How is that handled?" | "Accept it" | human | Recorded in the risk table | 2026-10-07 |
| D21 | pr-review reaching `rules/` and `schemas/` through links is settled by the documentation: `add` keeps the whole plugin in one store directory | "The docs say add keeps the whole plugin in one store directory and symlinks each skill from there, so pr-review's links to rules/ and schemas/ resolve as today. Close that open question on the docs' answer?" | "Close on the docs (Recommended)" | human | M3 exercises it | 2026-10-07 |
| D22 | `agentplugins validate` is wired like lint: a pinned `npx` line in `scripts/verify.sh` and its own `run:` step in the PR check | "Docs pair validate with lint when testing a plugin. Does the build and PR check also run `agentplugins validate`?" | "Yes, wired like lint (Recommended)" | human | It checks each declared target's constraints, which lint and audit do not | 2026-10-07 |
| D23 | The tracer bullets stay under the plan's `tracer-bullets/`, as PLANNING.md places them | "PLANNING.md puts tracer bullets under the plan's tracer-bullets/; the template puts them under {test-context}/exploratory/. Which holds here?", and after the agent raised that deleting them conflicts with PLANNING.md and squash-merge, "What would you like to clarify about deleting the tracer bullets?" | "delete them", then "keep em" | human | The evidence behind three recorded risks stays on `main` | 2026-10-07 |
| D24 | Replaced by D25. Three outcome goals proposed by the agent | "Rewritten as intent, not steps (see the preview). Are these the goals?" | "These are the goals" | human | Withdrawn when the human stated the intent and goals | 2026-10-07 |
| D25 | The intent and goals are the human's own, as quoted under Background and Goals | after the agent proposed cheapest-pass rows, "Which row do you want changed, and how?" | "Intent 1: Distribute instructions to agents   2: In future oour agents will be running more advsanced tasks and we need more advanced ways of doing so  Goal 1: Make our pr-review skill conform to sigilco/agentplugins 2. Support gemini 3. Support Claude 4 Support Copilot 5 Manage default GEMINI.md CLAUDE.md instructions" | human | An earlier draft listed implementation steps; the human answered "nothing of those are goals" | 2026-10-07 |
| D26 | Goal 5 gets a plan of its own; D2 stands for this plan | "Goal 5, managing default GEMINI.md and CLAUDE.md, conflicts with two earlier decisions: D2 put those files outside this repository, and D4 made the AgentPlugins docs the authority, but the docs do not cover instruction files. How should goal 5 be handled?" | "Own plan, later (Recommended)" | human | PLANNING.md: one problem per plan | 2026-10-07 |
| D27 | The cheapest-passing rows of goals 1 to 4 as recorded under Goals | "Apart from your Copilot correction, do the two sharpenings stand?" | "Both stand" | human | The human also stated "Copilot support subagents", confirmed by its documentation | 2026-10-07 |
| D28 | The open question whether Gemini CLI and Copilot's CLI can run pr-review closes; Gemini's three undocumented points become risks settled by M3 | "Given those three Gemini gaps, how do we close the last open question?" | "Close; record as risks" | human | The agent recommended researching first | 2026-10-07 |
| D29 | Each kind of probe names its own model, refining D19's two-way split | "\"Different models are to be utilized\": which do you mean?" | "Per kind of probe" | human | Raised by the human on the first draft of M2: "No that is wrong differenbt models are to be utilized" | 2026-10-07 |
| D30 | Models are named as tiers in a closed enum, `cheapest`, `balanced`, `most-capable`, which the dispatching session maps to its harness's models | "A model name differs between Claude, Gemini and Copilot. In what vocabulary does each kind's schema name its model?" | "Tiers (Recommended)" | human | One value per kind on every harness | 2026-10-07 |
| D31 | `context` most-capable, `rules` cheapest, `dead-code` and `reuse` balanced | "Which model should each kind of probe use?" | "As recommended" | human | Judgement for context, bulk for rules, repository search for dead-code and reuse | 2026-10-07 |
| D32 | Withdrawn by D33. M3 would verify support by an automated end-to-end check in CI | "How is \"a full pr-review runs on Claude, Gemini and Copilot after `agentplugins add`\" verified in M3?" | "Automated end-to-end in CI" | human | — | 2026-10-07 |
| D33 | Automating the end-to-end check is another plan | none, the human withdrew D32 unprompted | "no automatin in this plan that is another plan" | human | Recorded as a non-goal | 2026-10-07 |
| D34 | Goals 2 to 4 are verified by a recorded acceptance run, one pr-review per CLI, each `review.md` committed with the progress log | "With automation moved to another plan, how does this plan verify goals 2 to 4, that a full pr-review runs on Claude, Gemini and Copilot after `agentplugins add`?" | "Recorded acceptance run (Recommended)" | human | Manual until the automation plan replaces it | 2026-10-07 |
| D35 | The acceptance run is performed in an empty user account | "M3, the recorded acceptance run (see preview). Does it stand, including its three preconditions?" | "Test will be performed in an empty user account" | human | Removes the preconditions about this account's existing install and shared skills link | 2026-10-07 |
| D36 | The acceptance run reviews a plain-git range of some other small repository, chosen at run time; this repository is only the install source | "Is github.com/thruput-io/agents the right GitHub home of this repository, the one users install the plugin from?", then "Which repository and range should each CLI review in the acceptance run?" | "Don't review this repo", then "yes we will make it with git on something else it doesnt matter" | human | A plain-git range posts nothing | 2026-10-07 |
| D37 | Withdrawn by D41. Closing the gap of D12, that 0.6.1 does not fail `lint --max-warnings 0` on a warning, becomes milestone M0 ahead of M1 | none, the human gave the direction unprompted while the agent was starting M1 | "lint --max-warnings 0 doesn't actually fail on warnings (D12) should be m0" | human | Reopens D12; overtaken when D41 drops sigilco/agentplugins | 2026-10-09 |
| D38 | The rules governing this plan and its implementation are the published set at https://thruput.se/agents, replacing D7 | "How do you want to settle *Maintained* against goal 1, and, depending on that, how should M0 close the `--max-warnings` gap?" | "Neew rules are at https://thruput.se/agents", then "Your rules are at https://thruput.se/agents then end" | human | The human also said "DO NOT COMARE ANY RULES" | 2026-10-09 |
| D39 | sigilco/agentplugins fails rule Maintained, so a maintained framework doing the same job is searched for | "How do you want *Maintained* settled against goal 1, conformance with sigilco? And how should M0 close the `--max-warnings` gap?" | "plz research a frework that does same as sigilco/agentplugins but is maintained" | human | sigilco/agentplugins has one contributor, `espetro`, and no default-branch commit since 2026-07-02; see [maintained-alternatives](research/maintained-alternatives/README.md) | 2026-10-09 |
| D40 | The Agent Plugins specification at github.com/agentplugins is examined as a candidate | none, the human gave the direction unprompted during the search of D39 | "use https://github.com/agentplugins" | human | A specification, not a tool: skills and MCP only, Copilot reads it, Claude Code and Gemini CLI are not listed clients; see [maintained-alternatives](research/maintained-alternatives/README.md) | 2026-10-09 |
| D41 | microsoft/apm replaces sigilco/agentplugins as the distribution framework. Supersedes D1, D4 and D10 to D15, withdraws D37, and reopens exploration | "Before I plan anything, I need one answer: is goal 1 now to conform to the **Agent Plugins spec** (github.com/agentplugins) instead of **sigilco/agentplugins**?" | "Use https://github.com/microsoft/apm" | human | APM passes Maintained (about 50 authors in 90 days, ten releases since 2026-07-12, MIT); see [apm-0.33.0](research/apm-0.33.0/README.md) | 2026-10-09 |
| D42 | The plan is renamed `instruction-distribution`, after the human's intent 1, replacing the name of D5; the branch is `001-instruction-distribution` | "What should the plan be named, now that APM replaces sigilco/agentplugins?" | "instruction-distribution (Recommended)" | human | PLANNING.md: name the plan after the stable problem, not the solution; `agentplugins-conformance` named the dropped tool | 2026-10-09 |
| D43 | Goal 1 reads "Make our pr-review skill conform to microsoft/apm", replacing sigilco/agentplugins in the human's goal of D25 | "My suggestion is \"Make our pr-review skill conform to microsoft/apm\". It keeps your wording and swaps only the tool. How would you like goal 1 to read?" | "yes" | human | Follows D41 | 2026-10-09 |

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
- [x] Does the documentation cover a skill reaching files outside its directory? — closed by the human on the documentation, [D21](#discussions)
- [x] The documentation names the manifest `agentplugins.config.ts` or `agentplugins.json`. Is … — closed by the human: renamed to `agentplugins.json`, [D13](#discussions)
- [x] Does the pull request check run `lint --max-warnings 0`? — closed by the human: yes, as its own step, [D10](#discussions)
- [x] 0.6.1 does not fail `lint --max-warnings 0` on a warning. How is Strict presets met? — closed by the human: wire the documented flag and record the gap, [D12](#discussions)
- [x] `audit` is not documented, yet the pull request check runs it. Does it stay? … — closed by the human: it stays, [D15](#discussions)
- [x] How does pr-review ask for the cheapest model for each probe now that no agent file pins it? — closed by the human: a model tier per kind of probe, [D19](#discussions), [D29](#discussions) to [D31](#discussions)
- [x] Where do tracer bullets live? — closed by the human: under the plan's `tracer-bullets/`, [D23](#discussions)
- [x] Can Gemini CLI and Copilot's CLI run pr-review? — closed by the human, Gemini's gaps recorded as risks, [D28](#discussions)
- [x] How are goals 2 to 4 verified? — closed by the human: a recorded acceptance run, [D34](#discussions) to [D36](#discussions)
- [x] Goal 1 reads "Make our pr-review skill conform to sigilco/agentplugins". How is it worded now that APM replaces sigilco? — closed by the human: "conform to microsoft/apm", [D43](#discussions)
- [ ] The cheapest-passing rows for goals 1 to 4 rest on sigilco's `lint`, `validate`, `audit` and `agentplugins add`. What do "conform" and "support" mean under APM?
- [ ] Installing the pr-review subpath fails on its `schemas` symlink. How is pr-review made installable: the whole repository as the package, or no links out of the skill? See [apm-0.33.0](research/apm-0.33.0/README.md)
- [ ] APM puts Gemini and Copilot skills in `~/.agents/skills/`. Do Gemini CLI and Copilot's CLI load skills from there? Not proven; needs a tracer bullet
- [ ] APM has no lint and no strict or max-warnings mode; `apm audit --ci` is its only CI check. What meets rule Strict presets for the package?
- [ ] The Execution Plan, M1 to M3, was written for sigilco/agentplugins. It is redrafted only after exploration closes, per PLANNING.md

## Execution Plan

### Goal coverage

| Goal | Delivered by |
|---|---|
| 1 Make our pr-review skill conform to microsoft/apm | M1, M2 |
| 2 Support Gemini | M2, verified by M3 |
| 3 Support Claude | M2, verified by M3 |
| 4 Support Copilot | M2, verified by M3 |
| 5 Manage default GEMINI.md and CLAUDE.md | its own plan (D26) |

### Running all tests

`./build.sh` at the repository root. It exists today, runs `scripts/verify.sh`, and builds the site.

### Milestone M1: the manifest conforms, and the framework judges it

Delivers: goal 1, the part "the framework's own `lint`, `validate` and `audit` pass".

Steps, test first:

1. Open the progress log `docs/plans/instruction-distribution/progress/001-attempt-1-{date}.md`.
2. Add the checks first, so they fail: in `scripts/verify.sh`, beside the existing `audit` line, add
   `npx --yes @agentplugins/cli@0.6.1 lint --max-warnings 0 --config "$PROJECT_ROOT/agentplugins.json"` and
   `npx --yes @agentplugins/cli@0.6.1 validate --config "$PROJECT_ROOT/agentplugins.json"`. Add the same two
   commands as their own `run:` steps in `.github/workflows/pr-check.yml`, beside the `audit` step. Run
   `./build.sh` and record in the log that it fails because `agentplugins.json` does not exist.
3. `git mv agentplugins.config.json agentplugins.json` (D13).
4. In `agentplugins.json`, add `license: "Apache-2.0"`, `targets: ["claude", "gemini", "copilot"]` (D8), and a
   `skills` array declaring `pr-review` and `dad-joke` with `name`, `description` and `filePath`, each name and
   description copied from that skill's SKILL.md frontmatter (D14, D18).

Verification, "the framework accepts the manifest": `./build.sh` passes. Its log shows `validate` reporting no
issues for claude, gemini and copilot, `audit` reporting PASS, and `lint` reporting only the known "no hooks"
warning of D12.

### Milestone M2: the probe is folded into the skill, each kind naming its model tier

Delivers: goal 1, the part "everything pr-review needs arrives through `agentplugins add`" (D9), and goals 2 to 4
in that the dispatch names nothing a harness lacks. Model per kind of probe as decided in D29 to D31.

Why this milestone serves the goals: CODE_REVIEW.md step 2 dispatches the `probe` agent, which `agentplugins add`
never installs on any harness, so after install a review fails at step 2 on Claude, Gemini and Copilot alike.

Steps, test first:

1. In `skills/pr-review/scripts/lib.test.mjs`, add failing tests: completing a document of each kind against its
   schema with `complete` yields `model` `most-capable` for `context`, `cheapest` for `rules`, and `balanced` for
   `dead-code` and `reuse`; and the summary line of a probe reads `<name> (<kind>, <model>)`. Run
   `./build.sh` and log the failures.
2. In `schemas/review/agent-instructions.schema.json`, define the tier once as a closed enum, `cheapest`,
   `balanced`, `most-capable`, described as the model tier the dispatching session maps to its harness's model
   (ADR 0005, rule Shapes live in the contract).
3. In each of `schemas/review/instructions/{context,rules,dead-code,reuse}.schema.json`, add a required `model`
   property referencing that enum with a `const` per D31, beside `task` and `kind`.
4. In `skills/pr-review/scripts/lib.mjs`, add the function that renders a completed probe's summary line, and use it
   in `prepare.mjs` for `summary.probes`, reading `kind` and `model` from the completed document.
5. In `skills/pr-review/CODE_REVIEW.md` step 2, change "Dispatch one `probe` subagent per file in
   `<workdir>/instructions/`, concurrently, the context one on the most capable model" to "Dispatch one subagent per
   file in `<workdir>/instructions/`, concurrently, each on the model of the tier the summary names for it, mapped
   to your harness's models". The dispatch message is unchanged.
6. In `skills/pr-review/SKILL.md`, replace "Every subagent is the plugin's `probe` agent, defined in
   [`agents/probe.md`](../../agents/probe.md): it loads no CLAUDE.md, so nothing but its file tells it what to do. It
   runs on the cheapest model available; the context subagent is dispatched on the most capable one." with one
   sentence saying each kind's schema names the model tier its subagent runs on.
7. Delete `agents/probe.md` and `.claude/agents/probe.md`, leaving no `agents/` or `.claude/agents/` directory.

Verification, "every probe names its tier and no plugin agent remains": `./build.sh` passes, including the new
tests and the `jsonschema` lint, metaschema and validate steps over the changed schemas. A grep of `skills/` for
"`probe` agent", "agents/probe" and "`probe` subagent" finds nothing, and `agents/` and `.claude/agents/` do not
exist.

### Milestone M3: a full pr-review runs on Claude, Gemini and Copilot after install

Delivers: goals 2, 3 and 4 as sharpened in D27, verified as decided in D34.

Facts the steps rest on:

- `agentplugins add` installs a branch from a tree URL: `parseBranch` takes the segment after `/tree/` and
  `cloneRepo` passes it to `git clone --branch`
  ([store.ts](https://github.com/sigilco/agentplugins/blob/main/packages/store/src/store.ts)).
- The review target is a plain-git range, so `review.mjs` writes `review.md` and posts nothing. Its changed files
  must each stay under 200 lines, or `prepare.mjs` blocks the review with File too large and nothing is proven.

Preconditions, in an empty user account on this machine (D35):

1. `node`, `tar` and `git` are on `PATH`, which is what SKILL.md requires for a change in a plain repository; `gh`
   is not needed, since nothing is posted.
2. Claude Code, Gemini CLI and GitHub Copilot's CLI are installed and signed in. In the current account only Claude
   Code is on `PATH`.
3. A small git repository other than this one is cloned in the account, with a range `<base>..<head>` whose changed
   files are each under 200 lines (D36). It is chosen at run time and named in the progress log.

Steps:

1. Push the branch carrying M1 and M2.
2. `npx --yes @agentplugins/cli@0.6.1 add https://github.com/thruput-io/agents/tree/001-instruction-distribution`.
   Log the output, which must list Claude Code, Gemini CLI and GitHub Copilot CLI as linked.
3. In each of Claude Code, Gemini CLI and Copilot's CLI, ask for a pr-review of `<that repository>@<base>..<head>`, each
   with its own work directory.
4. Copy each run's `review.md` to `docs/plans/instruction-distribution/progress/review-{claude,gemini,copilot}.md`
   in the working copy of the branch, and log each run's dispatched subagents and the model each used.

Verification, "a full review on every harness": for each of the three CLIs, `review.mjs` finished without refusing a
ledger and wrote `review.md`, and that file is committed. A run that stops for any reason is logged as a failed
attempt, per the progress-log rules, and the milestone is not done.
