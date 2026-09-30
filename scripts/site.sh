#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

governance=$(cd "$1" && pwd)

jekyll=ghcr.io/actions/jekyll-build-pages@sha256:6791ebfd912185ed59bfb5fb102664fa872496b79f87ff8b9cfba292a7345041
rendered=$(docker volume create)

remove_rendered() {
  docker volume rm "$rendered"
}
trap remove_rendered EXIT

source=(
  --volume "$governance:/github/source/_data:ro"
  --volume "$PWD/schemas:/github/source/schemas:ro"
)
for entry in web/*; do
  source+=(--volume "$PWD/$entry:/github/source/${entry#web/}:ro")
done

docker run --rm \
  "${source[@]}" \
  --volume "$rendered:/github/site" \
  --env GITHUB_WORKSPACE=/github \
  --env GITHUB_REPOSITORY=thruput-io/agents \
  --env GITHUB_API_URL=https://api.github.com \
  --env INPUT_SOURCE=source \
  --env INPUT_DESTINATION=site \
  --env INPUT_VERBOSE=true \
  --env INPUT_FUTURE=false \
  --env INPUT_TOKEN= \
  --env INPUT_BUILD_REVISION= \
  "$jekyll"

if [[ $# -gt 1 ]]; then
  mkdir -p "$2"
  docker run --rm \
    --volume "$rendered:/site:ro" \
    --entrypoint tar \
    "$jekyll" \
    --create --directory /site . | tar --extract --directory "$2"
fi

docker run --rm \
  --volume "$rendered:/site:ro" \
  ghcr.io/validator/validator@sha256:c36cfc6b48442c174d511145df69502babec69cae467268c705fac88cff4dfed \
  vnu --skip-non-html /site

docker run --rm \
  --volume "$rendered:/site:ro" \
  --workdir /site \
  lycheeverse/lychee@sha256:eaff3e0a13603c9a701accfcc84f44158bb77bf36ecfa4622b626056c3463892 \
  --offline --include-fragments --root-dir /site '**/*.html'
