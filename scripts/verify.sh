#!/usr/bin/env bash
set -euo pipefail

npx --yes @agentplugins/cli@0.6.1 audit "$PROJECT_ROOT"

"$PROJECT_ROOT/scripts/declared-ids.schema.sh" > "$PROJECT_ROOT/schemas/declared-ids.schema.json"

jsonschema=(npx --yes @sourcemeta/jsonschema@17.0.0)
"${jsonschema[@]}" lint "$PROJECT_ROOT/schemas" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" metaschema "$PROJECT_ROOT/schemas" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" validate "$PROJECT_ROOT/schemas/declared-ids.schema.json" "$PROJECT_ROOT/governance" --resolve "$PROJECT_ROOT/schemas"
