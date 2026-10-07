#!/usr/bin/env bash
set -euo pipefail
cd /plugin
cli=(npx --yes @agentplugins/cli@0.6.1)
"${cli[@]}" lint --strict --config agentplugins.config.json
"${cli[@]}" validate --config agentplugins.config.json
"${cli[@]}" audit /plugin
"${cli[@]}" build --strict --config agentplugins.config.json -o /tmp/dist
find /tmp/dist -type f | sort
for f in $(find /tmp/dist -type f | sort); do echo "--- $f"; cat "$f"; echo; done
