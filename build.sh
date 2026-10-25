#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(dirname "$(realpath "$0")")
BUILD_DIR=$PROJECT_ROOT/build
rm -rf "$BUILD_DIR"
mkdir "$BUILD_DIR"
export PROJECT_ROOT BUILD_DIR
"$PROJECT_ROOT/scripts/verify.sh"
"$PROJECT_ROOT/scripts/build_site.sh"
