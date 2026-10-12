#!/usr/bin/env bash
set -euo pipefail

build="$PROJECT_ROOT/build"

rm -rf "$build"
mkdir -p "$build"
cp -R "$PROJECT_ROOT/web" "$build/site"
cp -R "$PROJECT_ROOT/rules" "$build/site/_data"
cp -R "$PROJECT_ROOT/schemas" "$build/site/schemas"

version=$(git -C "$PROJECT_ROOT" describe --tags | sed 's/^v//')
echo $version
printf 'version: %s\n' "$version" > "$build/site/_data/release.yml"
npx --yes @sourcemeta/jsonschema@17.0.0 validate \
  "$PROJECT_ROOT/schemas/repository/release.schema.json" \
  "$build/site/_data/release.yml" --resolve "$PROJECT_ROOT/schemas"

BUNDLE_GEMFILE="$PROJECT_ROOT/Gemfile" bundle exec jekyll build --source "$build/site" --destination "$build/_site"
npx --yes --package vnu-jar@26.10.12 vnu --skip-non-html --verbose "$build/_site"
lychee  --verbose\
        --no-progress\
        --offline\
        --include-fragments\
        --root-dir "$PROJECT_ROOT/_site" \
        './**/*.html'
