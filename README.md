# Thruput Agents

The talent of our people, demystified and put into writing: the values, reasoning, and rules behind how we build software. It is the foundation of a development rig of tools, runtimes, and agent instructions, onto which synthetic colleagues are onboarded.

## Building locally

The `CI Check` workflow in `.github/workflows/ci.yml` is the build. `build.sh` reads it and runs its jobs locally, step by step and with the shell GitHub uses, so a green local run is a green pull request. Its steps only check out the code or run a command, and the commands run their tools pinned by version: the site in Docker images, everything else through `npx`. Docker and Node are all there is to install.

```
./build.sh              # every job
./build.sh validate     # one job
```

- `workflows` lints the workflows with actionlint (through `github-actionlint`, which runs the official binary) and fails on any `CI Check` step that `build.sh` could not run the same way: an action other than checkout, a step setting its own shell or environment, or a `${{ }}` expression.
- `validate` lints every schema, validates it against its metaschema, and validates every document in `governance/` against its schema, using the [Sourcemeta JSON Schema CLI](https://github.com/sourcemeta/jsonschema). Cross-schema references resolve from the `schemas/` directory.
- `site` builds the site served at https://thruput.se/agents/ from `web/`, `governance/`, and `schemas/` with the image GitHub Pages uses, checks the HTML with the Nu HTML Checker, and checks every link and `[[Id]]` reference with lychee. It then proves those checks reject a broken reference and a broken parent. The pages, layout, and styling live in `web/`. How the site is generated is decided in [ADR 0004](docs/adrs/0004-governance-site-generated-with-jekyll.md).
- `audit` audits the plugin with the AgentPlugins CLI.

The build writes nothing into the repository. Name a directory to get a copy of the rendered site, which is how the `Publish Site` workflow gets what it uploads on every push to `main`:

```
scripts/site.sh /tmp/agents-site
```

## Installation

Install as an [AgentPlugins](https://agentplugins.pages.dev/) plugin:

```bash
npx --yes @agentplugins/cli add thruput-io/agents
```

### Skills

- `dad-joke`: Programming dad jokes with zero input.
- `pr-review`: Reviews a GitHub or Azure DevOps Pull Request against the thruput-io handbook rules and posts the review as inline comments on the correct lines.

## License

Licensed under the [Apache 2.0 License](LICENSE).
