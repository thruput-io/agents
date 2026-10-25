#!/usr/bin/env bash
set -euo pipefail

jsonschema=(npx --yes @sourcemeta/jsonschema@17.0.0)
schemas_dir="$PROJECT_ROOT"/schemas

"$PROJECT_ROOT/scripts/declared-ids.schema.sh" > "$schemas_dir/governance/declared-ids.g.schema.json"
"${jsonschema[@]}" lint "$schemas_dir" --resolve "$schemas_dir"
"${jsonschema[@]}" metaschema "$schemas_dir" --resolve "$schemas_dir"
"${jsonschema[@]}" validate "$schemas_dir/governance/declared-ids.g.schema.json" "$PROJECT_ROOT/rules" --resolve "$schemas_dir"

bundles_dir="build/bundles"
echo "Clean $bundles_dir"
rm -rf "$bundles_dir"
bundles=()
schema_sub_dirs=$(find "$schemas_dir" -mindepth 1 -maxdepth 1 -type d)
mkdir "$bundles_dir"

for schema_sub_dir in $schema_sub_dirs; do
    dir="${schema_sub_dir##*/}"
    bundle="$bundles_dir/bundle.$dir.g.schema.json"
    echo "Bundling $bundle from $schema_sub_dir"
    "${jsonschema[@]}" bundle "$schema_sub_dir"/* --resolve "$schemas_dir" > "$bundle"
    bundles+=("$bundle")
done

all_bundle="$bundles_dir"/bundle.all.schema.json
echo "Bundling $all_bundle from ${bundles[*]}"
"${jsonschema[@]}" bundle "${bundles[@]}" --resolve "$schemas_dir" >  "$all_bundle"


node --test "$PROJECT_ROOT"/skills/pr-review/scripts/*.test.mjs