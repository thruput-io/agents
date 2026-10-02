#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pages=ghcr.io/actions/jekyll-build-pages:latest
vnu=ghcr.io/validator/validator:latest
lychee=lycheeverse/lychee:latest
site=$(docker volume create)

remove_site() {
  docker volume rm "$site"
}
trap remove_site EXIT

source=(
  --volume "$PWD/governance:/github/workspace/site/_data:ro"
  --volume "$PWD/schemas:/github/workspace/site/schemas:ro"
)
for entry in web/*; do
  source+=(--volume "$PWD/$entry:/github/workspace/site/${entry#web/}:ro")
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
docker run --rm --volume "$site:/site:ro" --workdir /site "$lychee" --offline --include-fragments --root-dir /site '**/*.html'
