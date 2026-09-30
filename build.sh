#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

scripts/validate.sh
scripts/site.sh governance
scripts/audit.sh
