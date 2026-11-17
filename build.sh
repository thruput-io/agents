#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(dirname "$(realpath "$0")")
cd "$PROJECT_ROOT"
rm -rf build skills/pr-review/node_modules
mkdir build
export PROJECT_ROOT
"$PROJECT_ROOT/scripts/verify.sh"
"$PROJECT_ROOT/scripts/build_site.sh"
