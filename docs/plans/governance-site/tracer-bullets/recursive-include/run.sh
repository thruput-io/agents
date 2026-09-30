#!/usr/bin/env bash
set -euo pipefail

bullet=$(cd "$(dirname "$0")" && pwd)
jekyll=ghcr.io/actions/jekyll-build-pages@sha256:6791ebfd912185ed59bfb5fb102664fa872496b79f87ff8b9cfba292a7345041
rendered=$(docker volume create)

remove_rendered() {
  docker volume rm "$rendered"
}
trap remove_rendered EXIT

docker run --rm \
  --volume "$bullet/site:/github/source:ro" \
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

inspect_rendered() {
  docker run --rm \
    --volume "$rendered:/rendered:ro" \
    --volume "$bullet/expected-entries.txt:/expected-entries.txt:ro" \
    --entrypoint "$1" \
    "$jekyll" \
    "${@:2}"
}

inspect_rendered diff /rendered/unrolled.html /rendered/recursive.html
echo "identical: one recursive include renders what one include per level renders"

inspect_rendered grep '<details' /rendered/recursive.html | diff "$bullet/expected-entries.txt" -
echo "ordered: every entry sits under its parent and carries its own level"
