#!/usr/bin/env bash
set -euo pipefail

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp -R "$PROJECT_ROOT/web" "$BUILD_DIR/site"
cp -R "$PROJECT_ROOT/rules" "$BUILD_DIR/site/_data"
cp -R "$PROJECT_ROOT/schemas" "$BUILD_DIR/site/schemas"
cp -R "$PROJECT_ROOT/schemas" "$BUILD_DIR/site/schemas"

version=$(git -C "$PROJECT_ROOT" describe --tags | sed 's/^v//')
echo $version
printf 'version: %s\n' "$version" > "$BUILD_DIR/site/_data/release.yml"
npx --yes @sourcemeta/jsonschema@17.0.0 validate \
  "$PROJECT_ROOT/schemas/repository/release.schema.json" \
  "$BUILD_DIR/site/_data/release.yml" --resolve "$PROJECT_ROOT/schemas"

BUNDLE_GEMFILE="$PROJECT_ROOT/Gemfile" bundle exec jekyll BUILD_DIR --source "$BUILD_DIR/site" --destination "$BUILD_DIR/_site"
npx --yes --package vnu-jar@26.10.12 vnu --skip-non-html --verbose "$BUILD_DIR/_site"
lychee  --verbose\
        --no-progress\
        --offline\
        --include-fragments\
        --root-dir "$BUILD_DIR/_site" \
        "$BUILD_DIR/_site/**/*.html" \
        "$BUILD_DIR/_site/**/*.json"
