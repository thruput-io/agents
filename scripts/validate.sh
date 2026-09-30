#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

jsonschema=(npx --yes @sourcemeta/jsonschema@17.0.0)

"${jsonschema[@]}" lint schemas --resolve schemas
"${jsonschema[@]}" metaschema schemas --resolve schemas
"${jsonschema[@]}" validate schemas/governance.schema.json governance --resolve schemas
