#!/usr/bin/env bash
set -euo pipefail

PR_URL="$1"
PLUGIN_SOURCE="$2"
MODEL="$3"

printf '//npm.pkg.github.com/:_authToken=%s\n@thruput-io:registry=https://npm.pkg.github.com\n' "$NODE_AUTH_TOKEN" > "$HOME/.npmrc"

npx --yes @agentplugins/cli@0.6.1 add -y "$PLUGIN_SOURCE"

command -v review-tool
command -v review-tool-probe

OUTPUT_FILE="/tmp/opencode-e2e-output.log"
opencode run --auto --model "$MODEL" \
  "Use the pr-review skill to review $PR_URL and report the controller result." \
  2>&1 | tee "$OUTPUT_FILE"

grep -E '"kind"[[:space:]]*:[[:space:]]*"(refused|too-large|already-reviewed|host-error|submitted)"|refused|too-large|already-reviewed|host-error|Verdict:' "$OUTPUT_FILE"
