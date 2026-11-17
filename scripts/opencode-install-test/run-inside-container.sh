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

cd /home/node/workspace
export OPENCODE_SERVER_PASSWORD="opencode-test-password"
export OPENCODE_PASSWORD="opencode-test-password"
opencode serve --port 4096 > /tmp/opencode.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT

sleep 2
opencode api post /api/session --server http://127.0.0.1:4096 --header 'x-opencode-directory:/home/node/workspace' --data '{}' > /dev/null

skills_json='{"data":[]}'
for _ in $(seq 1 15); do
  skills_json=$(opencode api get /api/skill --server http://127.0.0.1:4096 --header 'x-opencode-directory:/home/node/workspace')
  if ! printf '%s' "$skills_json" | grep -q '"data":\[\]'; then
    break
  fi
  sleep 1
done

SKILLS_JSON="$skills_json" node /home/node/source/scripts/opencode-install-test/assert-install.mjs
