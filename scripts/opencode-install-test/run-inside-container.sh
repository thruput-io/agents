#!/usr/bin/env bash
set -euo pipefail

cp -R /home/node/source /tmp/thruput-agents
git -C /tmp/thruput-agents init -q -b main
git -C /tmp/thruput-agents config user.name "Test"
git -C /tmp/thruput-agents config user.email "test@example.com"
git -C /tmp/thruput-agents add -A
git -C /tmp/thruput-agents commit -q -m "snapshot"
git config --global url."file:///tmp/thruput-agents".insteadOf "https://github.com/thruput-io/agents"

git -C /home/node/workspace init -q -b main

agentplugins add thruput-io/agents < /dev/null
rm -rf /tmp/thruput-agents/skills/pr-review/rules /tmp/thruput-agents/skills/pr-review/schemas
cp -RL /tmp/thruput-agents/rules /tmp/thruput-agents/skills/pr-review/rules
cp -RL /tmp/thruput-agents/schemas /tmp/thruput-agents/skills/pr-review/schemas
tarball=$(npm pack /tmp/thruput-agents/skills/pr-review --pack-destination /tmp)
npm install -g "/tmp/$tarball" --no-audit --no-fund

node /home/node/source/scripts/opencode-install-test/assert-install.mjs
