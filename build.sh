#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

scripts/validate.sh
scripts/site.sh
docs/plans/governance-site/tracer-bullets/broken-references/run.sh
scripts/audit.sh
