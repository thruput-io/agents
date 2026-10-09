# A maintained framework doing what sigilco/agentplugins does

Question (D39): which framework distributes skills, and where possible agents and hooks, from one git repository
to Claude Code, Gemini CLI and GitHub Copilot's CLI, and passes rule Maintained: "Adopt existing code only where it
is stable, documented, and maintained by several active contributors."

Gathered 2026-10-09 through the GitHub API (`gh api` with an installation token), `npm view` in
`node:22.20.0-bookworm-slim`, and the projects' documentation. "Authors, 90 days" counts commit authors on the
default branch since 2026-07-11; counts above 100 hit the API page limit and are lower bounds.

## sigilco/agentplugins, the framework being replaced

| Fact | Evidence |
|---|---|
| One contributor, `espetro`, 269 commits | `gh api repos/sigilco/agentplugins/contributors` |
| Last default-branch commit 2026-07-02; pushes since then are not on the default branch | `gh api repos/sigilco/agentplugins/commits`; `pushed_at` 2026-10-08 |
| npm `@agentplugins/cli`: 0.6.1 is `latest`, last modified 2026-07-01; 0.4.0 was published after 0.6.1 on 2026-06-30 | `npm view @agentplugins/cli versions dist-tags time --json` |
| No issue and no pull request mentions `max-warnings` | `gh search issues` and `gh search prs` in sigilco/agentplugins, both empty |

## Candidates

| Candidate | License | Authors, 90 days | Last release | Claude / Gemini / Copilot | Covers | Lint or validate |
|---|---|---|---|---|---|---|
| [microsoft/apm](https://github.com/microsoft/apm) | MIT | about 50 (danielmeppiel 299) | v0.33.0, 2026-10-02 | yes / yes / yes | skills; agents not on Gemini; hooks; MCP | `apm audit --ci`; see [apm-0.33.0](../apm-0.33.0/README.md) |
| [vercel-labs/skills](https://github.com/vercel-labs/skills) | MIT, telemetry on by default | about 47 (quuu 94) | 1.7.1, 2026-10-06 | yes / yes / yes | skills only | none found |
| [`gh skill`](https://cli.github.com/manual/gh_skill), in cli/cli, public preview | MIT | 20 or more | gh 2.102.0, 2026-09-30 | yes / yes / yes | skills only | `publish --dry-run` |
| Vendor-native: `claude plugin`, `gemini extensions`, `copilot plugin` | per vendor | vendor teams | current | each its own | everything the harness supports | only `claude plugin validate --strict --json` documented |
| [Goldziher/ai-rulez](https://github.com/Goldziher/ai-rulez) | MIT | 1 human of substance (1815 commits), 1 with 3 | 4.24.2, 2026-10-04 | yes / yes / yes | skills, agents, hooks | `validate --strict` |
| [runkids/skillshare](https://github.com/runkids/skillshare) | MIT | runkids 958, 9 others with 1 to 11 | v0.25.3, 2026-10-08 | yes / yes / yes | skills, agents, hooks, MCP | config validation only |
| [dyoshikawa/rulesync](https://github.com/dyoshikawa/rulesync) | MIT | 13, dyoshikawa 1107 of 1200 | v29.0.0, 2026-10-08 | yes / no Gemini CLI row / yes | generates config, not an installer | none documented |
| [777genius/universal-agent-plugins](https://github.com/777genius/universal-agent-plugins) | Apache-2.0 | 1 human | 0.1.80, 2026-10-08 | yes / skills and MCP / yes | Agent Plugins `plugin.json`; its CLI is also named `agentplugins` | `agentplugins validate` |
| [amtiYo/agents](https://github.com/amtiYo/agents) | Apache-2.0 | 1 | 0.9.1, 2026-09-13 | yes / yes / yes | local sync, no git install found | `sync --check` |
| intellectronica/ruler, Brattlof/skillet, numman-ali/openskills, kumekay/skiletto | various | 1 or none | — | — | — | — |

## The Agent Plugins specification (D40)

[agentplugins/agent-plugins-spec](https://github.com/agentplugins/agent-plugins-spec) is a specification, not a
tool: version 1.0.0 published, 1.1.0 a working draft. A plugin is a root `plugin.json` with `skills/<name>/SKILL.md`
and MCP servers; agents and hooks are client extensions outside it. Specification text is CC-BY-4.0, schemas and code
Apache-2.0 (`LICENSE.md`).

| Fact | Evidence |
|---|---|
| Technical Steering Committee from Amazon, Cursor, Microsoft, OpenAI and Vercel; lead Jonathan Hefner | `MAINTAINERS.md`, `GOVERNANCE.md` |
| 2 contributors; 90 days: jonathanhefner 78, johnlindquist 1; last commit 2026-08-19; no GitHub releases | `gh api` |
| Compatible clients: VS Code, Cursor, GitHub Copilot, ChatGPT & Codex, Kiro, Hermes Agent, OpenClaw, Grok Bot, NanoClaw, OpenHands. Claude Code and Gemini CLI are not listed | `lib/compatible-clients.ts` in agentplugins/agent-plugins-site |
| Copilot CLI recognizes Agent Plugins 1.0.0 and 1.1.0 root manifests | [CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference) |
| The only validator named by the Agent Skills standard, `skills-ref`, is "intended for demonstration purposes only" | [agentskills/agentskills](https://github.com/agentskills/agentskills) |

## Result

Only microsoft/apm installs more than skills into all three CLIs from a git URL and passes Maintained. The human
chose it in D41.
