# Result, 2026-10-07

| Fixture | Lint output | Exit status of `lint --max-warnings 0` |
|---|---|---|
| `with-targets` | One warning, `target-hygiene`: "Targets [claude, gemini, copilot] are declared but no hooks are defined — the plugin will have no behavior on those platforms". Summary "Warnings: 1" and "Run with --strict to fail on warnings." | 0 |
| `without-targets` | "No issues found." | 0 |

`lint --max-warnings 0` exited 0 with one warning. The documentation says `--max-warnings <n>` fails "when warning
count exceeds `n`".

`agentplugins lint --help` in 0.6.1 lists only `--config`, `-h, --help` and `--json`. It lists neither
`--max-warnings` nor `--strict`. Neither flag was rejected as unknown.

Both fixtures use the documented manifest name `agentplugins.json`, and lint loaded it.
