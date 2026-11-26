#!/usr/bin/env bash
set -euo pipefail

tool="$PROJECT_ROOT/tools/pr-review"
fixture="$PROJECT_ROOT/build/pr-review-fixture"
port=8617

"$tool/src/mock-server/build-fixture.sh" "$fixture"

exec 3< <(node "$tool/src/mock-server/serve.ts" "$fixture/served" "$port")
server=$!
trap 'kill "$server"' EXIT
read -r <&3

node --test "$tool/src/**/*.narrow-test.ts"
