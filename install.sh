#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

npm --prefix "$ROOT_DIR/skills/pr-review" ci --no-audit --no-fund
npm --prefix "$ROOT_DIR/skills/pr-review" run codegen
rm -rf "$ROOT_DIR/skills/pr-review/rules" "$ROOT_DIR/skills/pr-review/schemas"
cp -RL "$ROOT_DIR/rules" "$ROOT_DIR/skills/pr-review/rules"
cp -RL "$ROOT_DIR/schemas" "$ROOT_DIR/skills/pr-review/schemas"
tarball=$(npm pack "$ROOT_DIR/skills/pr-review" --pack-destination "$TMP_DIR")
npm install -g "$TMP_DIR/$tarball" --no-audit --no-fund
