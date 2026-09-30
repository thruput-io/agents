#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

jsonschema=(npx --yes @sourcemeta/jsonschema@17.0.0)

"${jsonschema[@]}" lint schemas --resolve schemas
"${jsonschema[@]}" metaschema schemas --resolve schemas
scripts/declared-ids.schema.sh | "${jsonschema[@]}" metaschema /dev/stdin --resolve schemas
scripts/declared-ids.schema.sh | "${jsonschema[@]}" validate /dev/stdin governance --resolve schemas
