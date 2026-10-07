# Result, 2026-10-07

`docker run` exited 0. Every command in `run.sh` exited 0.

| Command | Outcome |
|---|---|
| `lint --strict` | One warning, `target-hygiene`: "Targets [claude, gemini, copilot] are declared but no hooks are defined — the plugin will have no behavior on those platforms". It still exited 0, and printed "Run with --strict to fail on warnings." although `--strict` was given. |
| `validate` | "No issues found" for universal rules, claude, gemini and copilot. |
| `audit` | Verdict PASS. Note: "`osv-scanner` is not on PATH ... Returning empty result." |
| `build --strict` | Same `target-hygiene` warning, exit 0. |

What `build` emitted per target:

| Target | Files | Skill | Agent |
|---|---|---|---|
| claude | `agents/probe.md`, `skills/pr-review/SKILL.md` | A stub whose body links to `skills/pr-review/SKILL.md`, a path not present in the output | Emitted, with `name`, `description`, `tools` and the prompt |
| gemini | `gemini-extension.json`, `hooks/hooks.json`, `README.md` | Not emitted | Not emitted |
| copilot | `plugin.json`, `skills/pr-review/SKILL.md` | A stub holding the name and description; the body of the source SKILL.md is absent | Not emitted |

Install hints printed by `build`: `cp -r dist/claude ~/.claude/skills/thruput`, `gemini extensions install ./dist/gemini`,
`copilot plugin install ./dist/copilot`.
