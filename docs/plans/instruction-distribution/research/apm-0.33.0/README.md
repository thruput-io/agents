# What microsoft/apm 0.33.0 documents and does

Question (D41): how does this repository become an APM package that installs pr-review into Claude Code, Gemini CLI
and GitHub Copilot's CLI, and what can check the package in the build?

Documentation base: <https://microsoft.github.io/apm>, read 2026-10-09. Observations come from `apm-cli==0.33.0` in
`python:3.12.7-slim-bookworm`, run against this repository. That run bind-mounted the repository, so it is
research, not a tracer bullet; each observation below that the plan relies on is to be proven by a tracer bullet.

## Findings that bear on the plan

| Question | Short answer | Evidence |
|---|---|---|
| Does our `skills/<name>/SKILL.md` layout work as a package? | Yes, without `apm.yml`; a root `apm.yml` adds metadata. Both pr-review and dad-joke installed | [package-types § skill collection](https://microsoft.github.io/apm/reference/package-types/#skill-collection-skillsnameskillmd); `skill_integrator.py` `_skill_source_dir` |
| Manifest | `apm.yml`; only `name` and `version` required; `targets:` list, unknown values a parse error | [package-anatomy § minimal package](https://microsoft.github.io/apm/concepts/package-anatomy/#the-minimal-package), [manifest-schema § 3.6](https://microsoft.github.io/apm/reference/manifest-schema/#36-target-and-targets) |
| JSON schema for `apm.yml` | `manifest-v0.1.41.schema.json`, JSON Schema 2020-12, an "unratified" amendment of a "v0.3 working draft" | [manifest-schema](https://microsoft.github.io/apm/reference/manifest-schema/) |
| Install from a branch | `apm install thruput-io/agents#<ref>`; ref is a branch, tag or SHA. Observed with `#main` | [manifest-schema § 4.1.1](https://microsoft.github.io/apm/reference/manifest-schema/#411-string-form) |
| Install a subpath | `apm install thruput-io/agents/skills/pr-review#main` **fails**: "Symlink 'skills/pr-review/schemas' targets 'schemas', which is not a tracked file in the checked-out commit." | observed |
| Where skills land, user scope `-g` | Claude `~/.claude/skills/<name>/`; Gemini and Copilot both `~/.agents/skills/<name>/`, not `~/.gemini` or `~/.copilot`; `--legacy-skill-paths` restores per-tool directories (not run) | [targets-matrix](https://microsoft.github.io/apm/reference/targets-matrix/); observed |
| Docs disagree on Gemini | manifest-schema says `.gemini/skills/`; the targets matrix, `targets.py` and the run say `.agents/skills/` | as cited |
| Files outside the skill directory | The whole package is kept in `apm_modules/` (`~/.apm/apm_modules/` at user scope); only the skill folder is copied to the target. Symlinks were dereferenced into files, although the docs say symlinks are skipped | [skills § where it lands](https://microsoft.github.io/apm/producer/author-primitives/skills/#where-it-lands-per-target), [security § symlinks](https://microsoft.github.io/apm/enterprise/security/#symlink-handling); observed |
| Links out of a skill | Only `*.md` links are rewritten into `apm_modules`; paths inside scripts are not | [package-relative-links](https://microsoft.github.io/apm/producer/package-relative-links/#skills-are-a-special-case) |
| Package check for CI | `apm audit --ci`, exit 0 or 1; on this repository it ran 2 checks and passed. `apm compile --validate` exits 1, "No APM content found to compile", since compile handles instructions only. No `apm validate`, no strict or max-warnings mode | [audit](https://microsoft.github.io/apm/reference/cli/audit/#ci-checks---ci), [compile](https://microsoft.github.io/apm/reference/cli/compile/#exit-codes) |
| `apm pack` | Warnings only, non-blocking; gates `--check-versions`, `--check-clean`, `--strict-metadata` | [pack](https://microsoft.github.io/apm/reference/cli/pack/#behavior) |
| Agent Plugins `plugin.json` | Read: installed whole when targets include Copilot; an eligible `apm.yml` wins over it | [package-types § layout summary](https://microsoft.github.io/apm/reference/package-types/#layout-summary) |
| Installing APM | `pip install apm-cli==0.33.0` (Python 3.10+), Homebrew, or `curl -sSL https://aka.ms/apm-unix` with `VERSION`; GitHub Action `microsoft/apm-action` v1.10.0; no official Docker image | [installation](https://microsoft.github.io/apm/getting-started/installation/) |
| Network side effects | No telemetry; a daily release check writes `~/.cache/apm/last_version_check`, with no documented opt-out; `install --dry-run` looks up an org policy repository and warned "Policy repo thruput-io/.github-private not found" | [security](https://microsoft.github.io/apm/enterprise/security/), [self-update](https://microsoft.github.io/apm/reference/cli/self-update/#startup-update-notification); observed |
| Maintenance | MIT; ten releases from v0.25.0 (2026-07-12) to v0.33.0 (2026-10-02); about 50 commit authors since 2026-07-11 | `gh api repos/microsoft/apm/releases`, `.../commits` |
