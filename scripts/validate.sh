#!/usr/bin/env bash
set -euo pipefail
export DOCKER_HOST="${DOCKER_HOST:-tcp://127.0.0.1:2375}"
docker run --rm -v "$PWD":/work -w /work python:3.13-slim sh -c '
set -eu
pip install --quiet --root-user-action=ignore check-jsonschema
for document in axioms principles rules definitions; do
  check-jsonschema --schemafile "schemas/${document}.schema.json" "${document}.yaml"
done
'
