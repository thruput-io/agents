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

opencode api post /api/session --header 'x-opencode-directory:/home/node/workspace' --data '{}' > /dev/null
plugins_json=$(opencode api get /api/plugin --header 'x-opencode-directory:/home/node/workspace')
skills_json=$(opencode api get /api/skill --header 'x-opencode-directory:/home/node/workspace')

PLUGINS_JSON="$plugins_json" SKILLS_JSON="$skills_json" node /home/node/source/scripts/opencode-install-test/assert-install.mjs
