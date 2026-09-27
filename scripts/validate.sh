#!/usr/bin/env bash
set -euo pipefail

image=ghcr.io/sourcemeta/jsonschema@sha256:4bfbccbc277e8fa3cfc560c34c810967134b55df998150b4c32015de39dee2c9
repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

jsonschema() {
  docker run --rm -v "$repository":/repository:ro -w /repository "$image" "$@" --resolve schemas --format-assertion
}

jsonschema metaschema schemas
for document in values axioms rationales principles rules standards definitions; do
  jsonschema validate "schemas/$document.schema.json" "$document.yaml"
done
jsonschema validate schemas/taxonomy.schema.json framework.yaml
