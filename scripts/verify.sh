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

rm -rf "$PROJECT_ROOT/build/schemas"
while IFS= read -r schema; do
    bundle="$PROJECT_ROOT/build/schemas/${schema#"$PROJECT_ROOT"/schemas/}"
    mkdir -p "$(dirname "$bundle")"
    "${jsonschema[@]}" bundle --without-id "$schema" --resolve "$PROJECT_ROOT/schemas" > "$bundle"
done < <(find "$PROJECT_ROOT/schemas" -name '*.schema.json' ! -name '*.g.schema.json')

npm --prefix "$PROJECT_ROOT/skills/pr-review" ci --no-audit --no-fund
npm --prefix "$PROJECT_ROOT/skills/pr-review" run codegen
npm --prefix "$PROJECT_ROOT/skills/pr-review" run typecheck
npm --prefix "$PROJECT_ROOT/skills/pr-review" test
node --test "$PROJECT_ROOT"/skills/pr-review/scripts/*.test.mjs
