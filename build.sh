#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(dirname "$(realpath "$0")")
export PROJECT_ROOT

npm --prefix "$PROJECT_ROOT" ci
node "$PROJECT_ROOT/scripts/generate-zod-contracts.mjs"
"$PROJECT_ROOT/scripts/verify.sh"
"$PROJECT_ROOT/scripts/build_site.sh"
