#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npx --yes @agentplugins/cli@0.6.1 audit .

scripts/declared-ids.schema.sh > schemas/declared-ids.schema.json

jsonschema=(npx --yes @sourcemeta/jsonschema@17.0.0)
"${jsonschema[@]}" lint schemas --resolve schemas
"${jsonschema[@]}" metaschema schemas --resolve schemas
"${jsonschema[@]}" validate schemas/declared-ids.schema.json governance --resolve schemas
