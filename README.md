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

### Standard install

```sh
npx @agentplugins/cli add -y thruput-io/agents
npx @agentplugins/cli setup thruput -y
```

Verify the CLI tools are on `PATH`:

```sh
review-tool -h
review-tool-probe -h
```

### Multi-user system (per-user, no `sudo`)

When `/usr/local/lib/node_modules` is root-owned, configure a user-owned global `npm` prefix once per user:

```sh
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
export PATH="$HOME/.npm-global/bin:$PATH"
```

Then install the plugin and run setup as that user:

```sh
npx @agentplugins/cli add -y thruput-io/agents
npx @agentplugins/cli setup thruput -y
```

### Multi-user system (shared CLI with `sudo`)

An administrator installs the CLI binaries once for all users:

```sh
sudo npm install -g https://github.com/thruput-io/agents/releases/latest/download/thruput-review-tool.tgz --no-audit --no-fund
```

Then each user installs the skills and plugin into their own home directory:

```sh
npx @agentplugins/cli add -y thruput-io/agents
```

## License

Licensed under the [Apache 2.0 License](LICENSE).
