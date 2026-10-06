#!/usr/bin/env bash
set -euo pipefail

npx --yes @agentplugins/cli@0.6.1 audit "$PROJECT_ROOT"
node --test "$PROJECT_ROOT/skills/pr-review/scripts/*.test.mjs"

"$PROJECT_ROOT/scripts/declared-ids.schema.sh" > "$PROJECT_ROOT/schemas/governance/declared-ids.g.schema.json"

jsonschema=(npx --yes @sourcemeta/jsonschema@17.0.0)
"${jsonschema[@]}" lint "$PROJECT_ROOT/schemas" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" metaschema "$PROJECT_ROOT/schemas" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" validate "$PROJECT_ROOT/schemas/governance/declared-ids.g.schema.json" "$PROJECT_ROOT/rules" --resolve "$PROJECT_ROOT/schemas"
