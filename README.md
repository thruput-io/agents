# Thruput Agents

The talent of our people, demystified and put into writing: the values, reasoning, and rules behind how we build software. It is the foundation of a development rig of tools, runtimes, and agent instructions, onto which synthetic colleagues are onboarded.

## Overview

This repository defines the foundational quality principles, rules, and autonomous skills for AI agents operating across the Thruput ecosystem.

The governance architecture follows [ADR 0001](docs/adrs/0001-separating-principles-rules-and-standards.md). The YAML documents, their schemas, and how they change are governed by [ADR 0002](docs/adrs/0002-schema-validated-yaml-governance-documents.md).

## Governance

The governance documents, how to read them, and how to cite them are described in [governance/README.md](governance/README.md).

## Validating locally

The `CI Check` workflow runs the same script as a local run. It lints every schema, validates it against its metaschema, and validates every document in `governance/` against its schema, using the [Sourcemeta JSON Schema CLI](https://github.com/sourcemeta/jsonschema) installed as `jsonschema`. Cross-schema references resolve from the `schemas/` directory:

```
scripts/validate.sh
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
