#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

scripts/validate.sh
scripts/site.sh
scripts/broken-references.sh
scripts/audit.sh
