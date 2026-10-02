#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npx --yes @agentplugins/cli@0.6.1 audit .

scripts/declared-ids.schema.sh > schemas/declared-ids.schema.json

jsonschema=(npx --yes @sourcemeta/jsonschema@17.0.0)
"${jsonschema[@]}" lint schemas --resolve schemas
"${jsonschema[@]}" metaschema schemas --resolve schemas
"${jsonschema[@]}" validate schemas/declared-ids.schema.json governance --resolve schemas

site=$(mktemp -d)
mkdir "$site/source"
cp -R web/. "$site/source"
cp -R governance "$site/source/_data"
cp -R schemas "$site/source/schemas"
jekyll build --source "$site/source" --destination "$site/public"
npx --yes --package vnu-jar@26.9.30 vnu --skip-non-html "$site/public"
lychee --offline --include-fragments --root-dir "$site/public" "$site/public/**/*.html"
