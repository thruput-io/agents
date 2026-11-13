#!/usr/bin/env bash
set -euo pipefail

jsonschema=(npx --yes @sourcemeta/jsonschema@17.0.0)

"$PROJECT_ROOT/scripts/declared-ids.schema.sh" > "$PROJECT_ROOT/schemas/governance/declared-ids.g.schema.json"
"${jsonschema[@]}" lint "$PROJECT_ROOT/schemas" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" metaschema "$PROJECT_ROOT/schemas" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" validate "$PROJECT_ROOT/schemas/governance/declared-ids.g.schema.json" "$PROJECT_ROOT/rules" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" validate "$PROJECT_ROOT/schemas/governance/rules.schema.json" "$PROJECT_ROOT/skills/pr-review/rules/Rules.yaml" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" validate "$PROJECT_ROOT/schemas/governance/principles.schema.json" "$PROJECT_ROOT/skills/pr-review/rules/Principles.yaml" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" validate "$PROJECT_ROOT/schemas/governance/definitions.schema.json" "$PROJECT_ROOT/skills/pr-review/rules/Definitions.yaml" --resolve "$PROJECT_ROOT/schemas"

npm --prefix "$PROJECT_ROOT/skills/pr-review" ci --no-audit --no-fund
npm --prefix "$PROJECT_ROOT/skills/pr-review" run verify
