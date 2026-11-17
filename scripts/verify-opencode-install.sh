#!/usr/bin/env bash
set -euo pipefail

docker build -f "$PROJECT_ROOT/scripts/opencode-install-test/Dockerfile" -t thruput-agents-opencode-install-test "$PROJECT_ROOT"
docker run --rm thruput-agents-opencode-install-test
