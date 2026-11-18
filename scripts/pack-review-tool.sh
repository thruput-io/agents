#!/usr/bin/env bash
set -euo pipefail

output_path="$1"
root_dir="$(cd "$(dirname "$0")/.." && pwd)"

npm --prefix "$root_dir/skills/pr-review" run codegen
npm --prefix "$root_dir/skills/pr-review" run build

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

stage_dir="$work_dir/pkg"
mkdir -p "$stage_dir"
tar -C "$root_dir/skills/pr-review" --exclude=node_modules -chf - . | tar -C "$stage_dir" -xf -

tarball=$(npm pack "$stage_dir" --pack-destination "$work_dir" | tail -n 1)
mkdir -p "$(dirname "$output_path")"
mv "$work_dir/$tarball" "$output_path"
