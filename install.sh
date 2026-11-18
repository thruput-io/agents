#!/usr/bin/env bash
set -euo pipefail

bin_dir="$(dirname "$(realpath "$0")")/skills/pr-review/dist/bin"
release_url="https://github.com/thruput-io/agents/releases/latest/download"

mkdir -p "$bin_dir"
curl -fsSL "$release_url/review-tool.mjs" -o "$bin_dir/review-tool.mjs"
curl -fsSL "$release_url/review-tool-probe.mjs" -o "$bin_dir/review-tool-probe.mjs"
chmod +x "$bin_dir/review-tool.mjs" "$bin_dir/review-tool-probe.mjs"
