#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npx --yes @agentplugins/cli@0.6.1 audit .
