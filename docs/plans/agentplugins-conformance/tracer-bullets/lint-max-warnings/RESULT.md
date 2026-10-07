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

## `lint --json`

| Fixture | Output | Exit status |
|---|---|---|
| `with-targets` | `issues` holds one entry: rule `target-hygiene`, severity `warning`, field `targets`, the message above, and suggestion "Add hooks or remove unused targets". `summary` is `{"errors": 0, "warnings": 1}`. | 0 |
| `without-targets` | `issues` is empty. `summary` is `{"errors": 0, "warnings": 0}`. | 0 |

The documentation shows a different JSON shape: a `rules` object keyed by rule name, each with a `status`, and a
`summary` of `passed`, `warnings` and `failed`.
