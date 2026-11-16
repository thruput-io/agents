#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(dirname "$(realpath "$0")")
npm --prefix "$PROJECT_ROOT/skills/pr-review" ci --no-audit --no-fund
npm --prefix "$PROJECT_ROOT/skills/pr-review" run codegen
