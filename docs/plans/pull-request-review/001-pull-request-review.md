# 001 — Pull Request Review

The skeleton mandated by [`PLANNING.md`](https://github.com/thruput-io/handbook/blob/main/PLANNING.md#plan-format).

|                |                                                                  |
|----------------|------------------------------------------------------------------|
| Plan           | `docs/plans/pull-request-review/001-pull-request-review.md`      |
| Branch         | `001-pull-request-review`                                        |
| Started        | 2026-09-22                                                       |
| Supersedes     | —                                                                |
| ADRs consulted | `docs/adrs/0001-separating-principles-rules-and-standards.md`    |
| ADRs added     | —                                                                |
| Status         | draft                                                            |

## Implementing Agent Instructions

Read this section first, and in full, before touching any code.

**Read before starting.**
[`RULES.md`](../../RULES.md),
[`PRINCIPLES.md`](../../PRINCIPLES.md),
[`docs/adrs/0001-separating-principles-rules-and-standards.md`](../../docs/adrs/0001-separating-principles-rules-and-standards.md), and this plan end to end. They outrank this plan; raise any conflict with the human instead of resolving it yourself.

**Scope.** Implement exactly the milestones in [Execution Plan](#execution-plan), in order. Anything not in this plan is out of scope — stop and ask rather than extending it.

**Definition of done.** Implementation is complete when every milestone's verification test passes, `npx --yes @agentplugins/cli audit .` reports success, and every goal in [Goals](#goals) is delivered per the [Goal coverage](#goal-coverage) table.

**Verification.** Run `npx --yes @agentplugins/cli audit .` in the root of the repository. Do not treat a milestone as done on inspection alone.

### Progress log

Keep an append-only progress log for this attempt:

- Open `docs/plans/pull-request-review/progress/001-attempt-{n}-{YYYY-MM-DD}.md` before the first change, where `{n}` is one higher than the highest attempt already in `progress/`.
- Append as you go: what you attempted, what the evidence showed, what you decided, what broke.
- **MUST NOT** rewrite, condense, or delete an existing entry. Corrections are new entries.
- **MUST NOT** amend or force-push a commit that contains progress-log entries.
- Commit the log alongside the work it describes.

**If this attempt is abandoned:** open a pull request carrying the progress log, and state in the PR body what was attempted, where it broke, and what the next attempt should do differently. Do not delete the branch or the log — the record of the failure is the deliverable.

## Background

The `pr-review` skill was initially hosted in `thruput-io/skills` and depended on procedural documents, prompt templates, and rule sets pulled over HTTP from `raw.githubusercontent.com/thruput-io/handbook`.

This architecture suffered from several compounding failure modes:
1. **Network Fragility & Host Coupling:** Every review run depended on fetching raw Markdown over the public internet, failing in air-gapped or token-rate-limited CI environments. Furthermore, the review engine was tightly coupled to Azure DevOps and GitHub CLI commands, preventing developers from running pre-commit/pre-push reviews against local diffs.
2. **Distribution & Surrounding Files Gap:** When installed as a standalone skill (via `gh skill install`), surrounding files like `RULES.md` and `PHILOSOPHY.md` were omitted, forcing reliance on remote URLs or duplicated vendored references.
3. **Execution Model Mismatch (Subagent vs Single-Agent):** The procedural workflow mandated parallel fan-out across subagents. While tools like OpenCode and Claude Code support subagents via `task`, single-agent runners (such as GitHub Copilot CLI in Azure DevOps pipelines) lack subagent creation tools, causing pipeline runs to hallucinate subagent results or stall.
4. **Scope Creep in Subagents:** Review subagents were tasked with disparate duties: building solutions, running tests, and evaluating code against rules simultaneously, causing environment corruption, slow reviews, and context saturation.

Migrating `pr-review` into `thruput-io/agents` packages the skill alongside the project's source-of-truth `RULES.md` and `PRINCIPLES.md` via AgentPlugins, enabling zero-network local execution, clean role separation, and adaptive execution across runtimes.

### Goals

1. **Local-First Diff Evaluation:** Review current branch changes against `origin/main` (including uncommitted working tree changes) with zero network requests and no remote PR requirement.
2. **Zero Remote Handbook Dependencies:** All procedural review workflows, probe instructions, and RFC 2119 rules resolve from local repository files (`../../RULES.md`, `../../PRINCIPLES.md`).
3. **Strict Separation of Verification and Audit:** Subagents perform read-only cognitive audits against code and ASTs; they never execute bash commands, builds, or test suites. Pre-flight checks are isolated to the parent runner context.
4. **Adaptive Multi-Agent & Single-Agent Execution:** The engine detects runtime capabilities, executing parallel subagent fan-out when `task` is available and falling back to a structured sequential loop in single-agent environments.
5. **Scoped Simplicity Ladder (Option A):** Subagent search for the Simplicity Ladder is restricted to local repository utilities, runtime standard library features, and third-party dependencies already declared in the project's manifest (`package.json`, `*.csproj`, etc.).
6. **Decoupled Egress Adapters:** Egress formatting and API submission are partitioned into dedicated adapters (`local.md`, `github.md`, `azure.md`).

#### Cheapest passing interpretation

| Goal | Cheapest way to "pass" while missing the point | How the goal excludes it | Accepted by |
|---|---|---|---|
| 1 | Hardcode a naive `git diff` dump into terminal without full-file context or rule ledger. | Mandates full-context inspection, strict RFC 2119 citations, and full `ledger.md` generation. | [D1](#discussions) |
| 2 | Copy `handbook/CODE_REVIEW.md` into `pr-review/` while keeping remote raw GitHub URLs. | Requires all references to resolve locally on disk with zero external HTTP fetches to handbook. | [D4](#discussions) |
| 3 | Instruct subagents to run build and tests "only if necessary". | Subagents are explicitly stripped of bash execution permissions in `probe-template.md`. | [D4](#discussions) |
| 4 | Force sequential execution in all environments, ignoring available concurrency. | Mandates explicit harness capability detection and parallel dispatch when `task` is supported. | [D2](#discussions) |
| 5 | Skip simplicity ladder rules or allow unrestricted web queries for new packages. | Standardizes Option A: in-repo search, stdlib inspection, and manifest-pinned dependencies only. | [D3](#discussions) |
| 6 | Keep inline host API branching scattered across procedural workflow instructions. | Mandates isolated adapter modules under `hosts/` conforming to a unified host interface. | [D1](#discussions) |

### Non-goals

- Implementing automated code remediation or patch generation (comments only identify violations and cite the exact rule).
- Creating new package registry scrapers or CLI search wrappers.
- Modifying core rules in `RULES.md` or principles in `PRINCIPLES.md`.
- Rewriting external CI scripts in `azure-pipelines` within this repository.

## Summary

Migrate the `pr-review` skill into `thruput-io/agents/skills/pr-review`. Structure the skill with an entry point (`SKILL.md`), a decoupled review workflow (`engine/review-workflow.md`), a read-only probe prompt template (`engine/probe-template.md`), host adapters (`hosts/local.md`, `hosts/github.md`, `hosts/azure.md`), and secondary escalation rulebook indexes (`references/`).

## Assumptions, risks and preconditions

| Assumption or risk | How it was tested | Result | If it turns out false |
|---|---|---|---|
| AgentPlugins manifest discovers skills placed in `skills/` | Verified with `npx --yes @agentplugins/cli audit .` on baseline `dad-joke` skill | Confirmed valid schema and discovery | Register skill explicitly in `agentplugins.config.json` |
| Local branch diff against `origin/main` works cleanly | Ran `git status` and inspected branch tracking across repositories | Confirmed standard git behavior | Support explicit target branch argument fallback |
| Single-agent Copilot CLI lacks subagent spawning tools | Confirmed in ADR/inventory analysis of trial pipeline run 54699 | Confirmed single-agent conversational loop | Keep sequential loop as first-class fallback |

**Preconditions.**
- `thruput-io/agents` repository working tree is clean.
- Node.js 22+ and `@agentplugins/cli` available for verification audit.

## References

### Tracer-bullet tests

| Question | Test | Outcome |
|---|---|---|
| Does `@agentplugins/cli audit` pass with the new skill structure? | Run `npx --yes @agentplugins/cli audit .` in repository root | confirmed |

### Research

| Question | Short answer | Evidence | Report |
|---|---|---|---|
| How are surrounding files accessed when installed via AgentPlugins? | AgentPlugins clones the entire repository to local disk and symlinks it, preserving relative paths to `../../RULES.md`. | Verified via AgentPlugins specification and local audit tool. | `agent-setup/pr-review-inventory.md` |

### Rejected alternatives

| Alternative | Evidence gathered | Why rejected | Decision |
|---|---|---|---|
| Keep `pr-review` in `thruput-io/skills` and vendor copies of `RULES.md` | `RULES.md` will quickly drift across repositories. | Defeats single source of truth; violates DRY. | [D4](#discussions) |
| Unrestricted web searches for Simplicity Ladder | Sandboxed agents in CI lack arbitrary web access and hallucinate dependencies. | Noise, security audit friction, and pipeline stalls. | [D3](#discussions) |
| Retain single monolithic `CODE_REVIEW.md` handling both GitHub and Azure DevOps | Mixed API payloads cause prompt bloat and syntax errors across hosts. | High token overhead and maintenance fragility. | [D1](#discussions) |

## Discussions

| # | Decision | Question put to the human | Answer (verbatim) | Decided by | Rationale | Date |
|---|---|---|---|---|---|---|
| D1 | Default target for local review | "Should running `/pr-review` without arguments default to reviewing uncommitted changes against `HEAD`, or the current branch against `origin/main`?" | "we talked about this and local + current branch against origin/main is a sane default." | human | Aligns with standard PR boundaries prior to pushing upstream. | 2026-09-22 |
| D2 | Adaptive execution model | "Do you want to preserve the parallel fan-out (spawning subagents via `task` per subsection in `RULES.md`), or allow a sequential single-agent pass when running in environments lacking subagent tools?" | "would be great, how would we define that behaviour?" | agent, human approved | Inspect tool availability: parallel fan-out when `task` exists, sequential loop when running in single-agent runtimes. | 2026-09-22 |
| D3 | Simplicity Ladder scoping | "Which option matches your intended workflow? Option A (Local + Framework, Recommended) ... Option B ... Option C ..." | "optoin a" | human | Limits Simplicity Ladder rungs to in-repo code, stdlib, and dependencies already declared in the project manifest. | 2026-09-22 |
| D4 | Migrate `pr-review` to `thruput-io/agents` | Migration request and rationale discussion | "migrate the skills/pr-review skill into /agents/skills" | human | Solves handbook HTTP coupling, Azure DevOps lock-in, and subagent bloat. | 2026-09-22 |

## Open questions

- [ ] None remaining. All initial architectural choices settled.

## Execution Plan

### Goal coverage

| Goal | Delivered by |
|---|---|
| 1 (Local-First Diff Evaluation) | M1, M3, M4 |
| 2 (Zero Remote Handbook Dependencies) | M1, M2, M4 |
| 3 (Strict Separation of Verification and Audit) | M2, M3 |
| 4 (Adaptive Multi-Agent & Single-Agent Execution) | M2, M3 |
| 5 (Scoped Simplicity Ladder - Option A) | M2, M3 |
| 6 (Decoupled Egress Adapters) | M3, M4 |

### Running all tests

`npx --yes @agentplugins/cli audit .` — run from the repository root `/Users/martin/thruput/agents`.

---

### Milestone M1 — Directory Layout & Asset Migration

**Delivers:** Part of Goals 1 & 2.

**Steps**
1. Create skill directory structure in `skills/pr-review`:
   - `skills/pr-review/`
   - `skills/pr-review/engine/`
   - `skills/pr-review/hosts/`
   - `skills/pr-review/references/`
2. Migrate escalation references (`agent-rules-books-INDEX.md`, `agent-rules-books-search-index.json`) into `skills/pr-review/references/`.

**Verification:** Verify all files exist in their expected locations and `npx --yes @agentplugins/cli audit .` passes.

---

### Milestone M2 — Review Engine & Read-Only Probe Template

**Delivers:** Goals 2, 3, 4, 5.

**Steps**
1. Author `skills/pr-review/engine/probe-template.md`:
   - Explicit read-only boundary: forbid bash execution, builds, test running, and git modifications.
   - Enforce Option A for Simplicity Ladder (local repo, runtime/framework docs, declared dependencies only).
   - Standardize JSON ledger output schema.
2. Author `skills/pr-review/engine/review-workflow.md`:
   - Phase 1: Pre-flight checks (parent context only).
   - Phase 2: Rule evaluation with adaptive execution (Branch A: parallel fan-out via `task` across the 9 sections of `RULES.md`; Branch B: sequential in-context evaluation loop).
   - Phase 3: Secondary escalation pass when ledger is clean.
   - Phase 4: Local draft comment assembly and ledger compilation.
   - Replace all remote `raw.githubusercontent.com` URLs with relative paths (`../../RULES.md`, `../../PRINCIPLES.md`).

**Verification:** Inspect rule links, verify read-only boundaries, and confirm full coverage of the 9 sections of `RULES.md`.

---

### Milestone M3 — Host Egress Adapters

**Delivers:** Goals 1, 6.

**Steps**
1. Author `skills/pr-review/hosts/local.md`:
   - Instructions for computing base ref (`origin/main`), diff extraction, and console summary/`ledger.md` writing.
2. Author `skills/pr-review/hosts/github.md`:
   - Instructions for `gh` CLI commands, diff extraction, atomic review payload formation, and submission to `/pulls/{n}/reviews`.
3. Author `skills/pr-review/hosts/azure.md`:
   - Instructions for `az repos pr` commands, iteration changes, thread creation, ledger attachment, and vote setting.

**Verification:** Verify command syntax against existing cheat sheets and confirm adapters adhere to the common host interface contract.

---

### Milestone M4 — Skill Entry Point & Plugin Documentation

**Delivers:** Goals 1, 2, 6.

**Steps**
1. Author `skills/pr-review/SKILL.md`:
   - Frontmatter declaring skill name, triggers (local invocation, GitHub PR URL, Azure DevOps PR URL).
   - Target and mode resolution logic (defaults to local branch against `origin/main`).
   - Router delegating to `engine/review-workflow.md` and appropriate host adapter.
2. Update `README.md` in repository root to document the new `pr-review` skill.
3. Run `npx --yes @agentplugins/cli audit .` to validate plugin health and manifest compliance.

**Verification:** `npx --yes @agentplugins/cli audit .` succeeds with 0 errors and 0 warnings.
