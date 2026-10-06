#!/usr/bin/env bash
set -euo pipefail

pages=ghcr.io/actions/jekyll-build-pages:v1.0.13
vnu=ghcr.io/validator/validator:24.10.17
lychee=lycheeverse/lychee:0.24.2
site=$(docker volume create)

remove_site() {
  docker volume rm "$site"
  rm -r "$PROJECT_ROOT/build"
}
trap remove_site EXIT

rm -rf "$PROJECT_ROOT/build"
mkdir -p "$PROJECT_ROOT/build/_data"
cp "$PROJECT_ROOT"/rules/*.yaml "$PROJECT_ROOT/build/_data/"

version=$(git -C "$PROJECT_ROOT" describe --tags | sed 's/^v//')
printf 'version: %s\n' "$version" > "$PROJECT_ROOT/build/_data/release.yml"
npx --yes @sourcemeta/jsonschema@17.0.0 validate "$PROJECT_ROOT/schemas/repository/release.schema.json" "$PROJECT_ROOT/build/_data/release.yml" --resolve "$PROJECT_ROOT/schemas"

source=(
  --volume "$PROJECT_ROOT/build/_data:/github/workspace/site/_data:ro"
  --volume "$PROJECT_ROOT/schemas:/github/workspace/site/schemas:ro"
)
for entry in "$PROJECT_ROOT"/web/*; do
  source+=(--volume "$entry:/github/workspace/site/${entry#"$PROJECT_ROOT"/web/}:ro")
done

docker run --rm "${source[@]}" \
  --volume "$site:/github/workspace/_site" \
  --env GITHUB_WORKSPACE=/github/workspace \
  --env GITHUB_REPOSITORY=thruput-io/agents \
  --env GITHUB_API_URL=https://api.github.com \
  --env INPUT_SOURCE=site \
  --env INPUT_DESTINATION=_site \
  --env INPUT_VERBOSE=true \
  --env INPUT_FUTURE=false \
  --env INPUT_TOKEN= \
  --env INPUT_BUILD_REVISION= \
  "$pages"
docker run --rm --volume "$site:/site:ro" "$vnu" vnu --skip-non-html /site
docker run --rm --volume "$site:/site:ro" "$lychee" --offline --include-fragments --root-dir /site '/site/**/*.html'
