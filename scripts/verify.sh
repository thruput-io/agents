#!/usr/bin/env bash
set -euo pipefail

jsonschema=(npx --yes @sourcemeta/jsonschema@17.0.0)

"$PROJECT_ROOT/scripts/declared-ids.schema.sh" > "$PROJECT_ROOT/schemas/governance/declared-ids.g.schema.json"
"${jsonschema[@]}" lint "$PROJECT_ROOT/schemas" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" metaschema "$PROJECT_ROOT/schemas" --resolve "$PROJECT_ROOT/schemas"
"${jsonschema[@]}" validate "$PROJECT_ROOT/schemas/governance/declared-ids.g.schema.json" "$PROJECT_ROOT/rules" --resolve "$PROJECT_ROOT/schemas"

rm -rf "$PROJECT_ROOT/build/schemas"
while IFS= read -r schema; do
    bundle="$PROJECT_ROOT/build/schemas/${schema#"$PROJECT_ROOT"/schemas/}"
    mkdir -p "$(dirname "$bundle")"
    "${jsonschema[@]}" bundle --without-id "$schema" --resolve "$PROJECT_ROOT/schemas" > "$bundle"
done < <(find "$PROJECT_ROOT/schemas" -name '*.schema.json' ! -name '*.g.schema.json')

(
    cd "$PROJECT_ROOT/skills/pr-review"
    npm ci --no-audit --no-fund
    npm run codegen
    npm run typecheck
    npm test
    node --test scripts/*.test.mjs
)
