# AgentPlugins 0.6.1: what the documentation prescribes and what the tool does

Research done on 2026-10-07 against `sigilco/agentplugins` `main` and `@agentplugins/cli@0.6.1`, the latest
release, which this repository pins in `scripts/verify.sh`.

## Documentation

| Topic | What the documentation says | Source |
|---|---|---|
| Supported harnesses | Claude Code, Codex, OpenCode and Pi Mono are supported. Copilot, Gemini and Kimi are "Additional (tracked, not blocking)". | [capability-matrix.md](https://github.com/sigilco/agentplugins/blob/main/docs/guide/capability-matrix.md) |
| `skills` | Universal codegen on every harness. | [capability-matrix.md](https://github.com/sigilco/agentplugins/blob/main/docs/guide/capability-matrix.md) |
| `agents[]` | Universal codegen on Claude Code, Codex and OpenCode. Pi Mono needs `nativeEntry.pimono`. The Gemini table has no agents row. | [capability-matrix.md](https://github.com/sigilco/agentplugins/blob/main/docs/guide/capability-matrix.md) |
| `agents[].model` | Claude and OpenCode emit `model:` frontmatter when set. Codex and Pi use the harness default. | [capability-matrix.md](https://github.com/sigilco/agentplugins/blob/main/docs/guide/capability-matrix.md) |
| Agent shape | "Each subagent has its own prompt and tool allow-list." Examples use tool names `read`, `diff`, `scan-secret`. | [manifest.md § Agents](https://github.com/sigilco/agentplugins/blob/main/docs/guide/manifest.md#agents) |
| Naming | "All components (skills, tools, commands, agents) are namespaced as `{plugin}:{component}`." | [spec/v1/README.md § Namespacing](https://github.com/sigilco/agentplugins/blob/main/spec/v1/README.md#namespacing) |
| Porting | "don't translate existing config files 1:1. Rewrite on the manifest; let adapters generate the platform-native output." | [porting.md](https://github.com/sigilco/agentplugins/blob/main/docs/guide/porting.md) |
| Claude adapter output | `dist/claude/` with `.claude-plugin/plugin.json`, `commands.json`, `hooks/`, `skills/<skill-name>/SKILL.md`. | [adapters.md § claude](https://github.com/sigilco/agentplugins/blob/main/docs/reference/adapters.md#claude) |
| Gemini adapter output | `dist/gemini/` with `gemini-extension.json` and `hooks/`. | [adapters.md § gemini](https://github.com/sigilco/agentplugins/blob/main/docs/reference/adapters.md#gemini) |
| Install paths | One skill path per harness. No agents path. | [agent-paths.md](https://github.com/sigilco/agentplugins/blob/main/docs/reference/agent-paths.md) |
| `rules` | Allow, deny and warn patterns applied to tool calls. | [manifest.md](https://github.com/sigilco/agentplugins/blob/main/docs/guide/manifest.md) |
| Instruction files | Not mentioned anywhere in the docs or the spec. | all 28 Markdown files of the repository |

## Observed behaviour of 0.6.1

| Observation | How it was observed |
|---|---|
| `add` clones the repository into `~/.agents/plugins/<name>` and symlinks the plugin directory and each `skills/<name>` into every detected harness's skill path. It links nothing else. | `agentplugins add` run in Docker with stub `claude`, `gemini` and `codex` binaries, on a staged copy of this repository whose manifest declared the probe agent. |
| `add` links skills under their bare name, such as `pr-review`, not `thruput:pr-review`. | Same run. |
| `build -t claude` emits `agents/probe.md` from a manifest `agents` entry, with `name`, `description` and `tools` frontmatter and the prompt as body. Tool names are copied through unchanged. | `agentplugins build` run in Docker on the same staged copy. |
| `build -t gemini` emits `gemini-extension.json`, an empty `hooks/hooks.json` and a `README.md`. | Same run. |
| `build` writes a skill declared with `filePath` as a stub that links to the source SKILL.md. | Same run. |
| `lint` on the current manifest warns that `license` is missing. `validate` for claude and gemini passes. | `agentplugins lint` and `validate` run in Docker on this repository. |
| The schema `audit` validates against, `spec/v1/manifest.schema.json`, has `additionalProperties: false` on an agent and allows only `name`, `description`, `prompt`, `tools`. | The published schema, read directly. |
| `add` refuses any source that is not on GitHub. | `agentplugins add /tmp/plugin` and `file:///tmp/plugin` both fail with "Refusing to clone from non-GitHub source". |

## Contradictions between documentation and tool

- The capability matrix says Claude emits `model:` for an agent, but the schema `audit` validates against rejects `model`.
- The spec says components are installed as `{plugin}:{component}`, but `add` links skills under their bare name.
- The Claude adapter reference lists no `agents/` output, but `build` emits one.

The scripts that produced the observations were deleted before planning began, on the human's instruction, because they
did not meet the tracer-bullet rules. Any observation the plan relies on is re-run as a tracer bullet under this plan.

## What the documentation says about the tracer bullet's warnings

| Topic | What the documentation says | Source |
|---|---|---|
| Lint exit status | Exit `0` means "All rules passed (warnings allowed)". To fail on warnings, `lint` takes `--max-warnings <n>`. No `--strict` flag is documented for `lint` or `build`. | [linting.md § Exit codes](https://github.com/sigilco/agentplugins/blob/main/docs/guide/linting.md#exit-codes), [commands.md § lint](https://github.com/sigilco/agentplugins/blob/main/docs/reference/commands.md#lint) |
| `target-hygiene` | Checks that every target is recognised, and warns on duplicates or an empty list. A warning about targets without hooks is not documented. | [linting.md § target-hygiene](https://github.com/sigilco/agentplugins/blob/main/docs/guide/linting.md#target-hygiene) |
| Warnings in CI | "Fail the build on any error. Treat `hook-coverage` warnings as informational unless the hook is critical to your plugin's behavior." | [linting.md § CI integration](https://github.com/sigilco/agentplugins/blob/main/docs/guide/linting.md#ci-integration) |
| `audit` | Not documented. The command reference has no `audit` section, and no page mentions OSV. | [commands.md](https://github.com/sigilco/agentplugins/blob/main/docs/reference/commands.md) |
| Manifest file name | `agentplugins.config.ts`, or static JSON as `agentplugins.json`. The name this repository uses, `agentplugins.config.json`, is not documented. | [manifest.md](https://github.com/sigilco/agentplugins/blob/main/docs/guide/manifest.md) |
| Declared skill field | A declared skill takes `path` to its `SKILL.md`, or `content` inline. The published JSON schema names the field `filePath` instead. | [skills.md § Declaring skills in a manifest](https://github.com/sigilco/agentplugins/blob/main/docs/guide/skills.md#declaring-skills-in-a-manifest) |
| How `add` finds skills | In order: a manifest `skills` array, a root `SKILL.md`, a `skills/` directory of nested `SKILL.md` files. | [skills.md § How agentplugins add reads skills](https://github.com/sigilco/agentplugins/blob/main/docs/guide/skills.md#how-agentplugins-add-reads-skills) |
| How skills are installed | The plugin lives whole in the universal store, and is symlinked into each detected harness's skill path. | [skills.md § Symlink behavior](https://github.com/sigilco/agentplugins/blob/main/docs/guide/skills.md#symlink-behavior) |
| Role of `build` | "Inspect `dist/` to see exactly what each adapter emitted." Testing and publishing go through `add`, not through `dist/`. | [creating-plugins.md § 5. Build to § 7. Publish](https://github.com/sigilco/agentplugins/blob/main/docs/guide/creating-plugins.md#_5-build) |
| Publishing | Push to a public GitHub repository; users install with `agentplugins add user/repo`, and pin with `@<version>` from semver tags. | [creating-plugins.md § 7. Publish](https://github.com/sigilco/agentplugins/blob/main/docs/guide/creating-plugins.md#_7-publish) |
| Local testing | `agentplugins add ./my-plugin`. 0.6.1 refuses that with "Refusing to clone from non-GitHub source". | [creating-plugins.md § 6. Test locally](https://github.com/sigilco/agentplugins/blob/main/docs/guide/creating-plugins.md#_6-test-locally) |
