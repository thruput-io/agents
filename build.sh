#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(dirname "$(realpath "$0")")
rm -rf build
mkdir build
export PROJECT_ROOT
"$PROJECT_ROOT/scripts/verify.sh"
"$PROJECT_ROOT/scripts/build_site.sh"
