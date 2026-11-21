#!/usr/bin/env bash
set -euo pipefail

plugin_dir="$(dirname "$(realpath "$0")")"
bin_dir="$plugin_dir/skills/pr-review/dist/bin"
release_url="https://github.com/thruput-io/agents/releases/latest/download"

if [ -f "$plugin_dir/.agentplugins-meta.json" ]; then
  git -C "$plugin_dir" sparse-checkout set rules schemas skills
fi

mkdir -p "$bin_dir"
curl -fsSL "$release_url/review-tool.mjs" -o "$bin_dir/review-tool.mjs"
curl -fsSL "$release_url/review-tool-probe.mjs" -o "$bin_dir/review-tool-probe.mjs"
chmod +x "$bin_dir/review-tool.mjs" "$bin_dir/review-tool-probe.mjs"
