#!/usr/bin/env bash
set -euo pipefail
for d in with-targets without-targets; do
  echo "=== $d"
  rc=0
  (cd "/fixtures/$d" && npx --yes @agentplugins/cli@0.6.1 lint --max-warnings 0 --config agentplugins.json) || rc=$?
  echo "=== $d exit $rc"
  echo "=== $d --json"
  rc=0
  (cd "/fixtures/$d" && npx --yes @agentplugins/cli@0.6.1 lint --json --config agentplugins.json) || rc=$?
  echo "=== $d --json exit $rc"
done
