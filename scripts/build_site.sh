#!/usr/bin/env bash
set -euo pipefail

cp -R "$PROJECT_ROOT/web" "$PROJECT_ROOT/build/site"
cp -R "$PROJECT_ROOT/rules" "$PROJECT_ROOT/build/site/_data"
cp -R "$PROJECT_ROOT/schemas" "$PROJECT_ROOT/build/site/schemas"

version=$(git -C "$PROJECT_ROOT" describe --tags | sed 's/^v//')
echo $version
printf 'version: %s\n' "$version" > "$PROJECT_ROOT/build/site/_data/release.yml"
npx --yes @sourcemeta/jsonschema@17.0.0 validate \
  "$PROJECT_ROOT/schemas/repository/release.schema.json" \
  "$PROJECT_ROOT/build/site/_data/release.yml" --resolve "$PROJECT_ROOT/schemas"

BUNDLE_GEMFILE="$PROJECT_ROOT/Gemfile" bundle exec jekyll build --source "$PROJECT_ROOT/build/site" --destination "$PROJECT_ROOT/build/_site"
npx --yes --package vnu-jar@26.10.12 vnu --skip-non-html --verbose "$PROJECT_ROOT/build/_site"
lychee  --verbose\
        --no-progress\
        --offline\
        --include-fragments\
        --root-dir "$PROJECT_ROOT/build/_site" \
        "$PROJECT_ROOT/build/_site/**/*.html" \
        "$PROJECT_ROOT/build/_site/**/*.json"
