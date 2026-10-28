# Thruput Agents

The talent of our people, demystified and put into writing: the values, reasoning, and rules behind how we build
software. It is the foundation of a development rig of tools, runtimes, and agent instructions, onto which synthetic
colleagues are onboarded.

The governance is published at https://thruput.se/agents/. Architecture decisions are recorded
in [docs/adrs](docs/adrs/).

## Building locally

The build runs the same steps as the pull request check. Install its tools with `brew bundle`.

```
./build.sh
```

## Installation

This repository is an [Agent Plugins](https://agent-plugins.org/specification) v1.0.0 plugin: `plugin.json` at the root and skills under `skills/`.

## License

Licensed under the [Apache 2.0 License](LICENSE).
