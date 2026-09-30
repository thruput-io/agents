# Thruput Agents

The talent of our people, demystified and put into writing: the values, reasoning, and rules behind how we build software. It is the foundation of a development rig of tools, runtimes, and agent instructions, onto which synthetic colleagues are onboarded.

## Validating locally

The `CI Check` workflow runs the same script as a local run. It lints every schema, validates it against its metaschema, and validates every document in `governance/` against its schema, using the [Sourcemeta JSON Schema CLI](https://github.com/sourcemeta/jsonschema) installed as `jsonschema`. Cross-schema references resolve from the `schemas/` directory:

```
scripts/validate.sh
```

## Building the site locally

The pages, layout, and styling of the site live in `web/`. `scripts/site.sh` builds the site served at https://thruput.se/agents/ from `web/`, `governance/`, and `schemas/` with the image GitHub Pages uses, checks the HTML with the Nu HTML Checker, and checks every link and `[[Id]]` reference with lychee, each a Docker image pinned by digest. The `Publish Site` workflow runs the same script on every push to `main`, and the `CI Check` workflow on every pull request. How the site is generated is decided in [ADR 0004](docs/adrs/0004-governance-site-generated-with-jekyll.md).

```
scripts/site.sh
```

The build writes nothing into the repository. Name a directory to get a copy of the rendered site:

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
