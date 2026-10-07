#!/usr/bin/env bash
set -uo pipefail
for d in with-targets without-targets; do
  echo "=== $d"
  (cd "/fixtures/$d" && npx --yes @agentplugins/cli@0.6.1 lint --max-warnings 0 --config agentplugins.json)
  echo "=== $d exit $?"
  echo "=== $d --json"
  (cd "/fixtures/$d" && npx --yes @agentplugins/cli@0.6.1 lint --json --config agentplugins.json)
  echo "=== $d --json exit $?"
done
