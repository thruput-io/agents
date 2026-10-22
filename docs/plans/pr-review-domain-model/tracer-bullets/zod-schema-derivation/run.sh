#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker run --rm \
  -v "${script_dir}/schemas:/fixtures/schemas:ro" \
  -v "${script_dir}/probe.mjs:/work/probe.mjs:ro" \
  node:22.20.0-bookworm-slim \
  bash -c '
    set -euo pipefail
    mkdir -p /tmp/work && cd /tmp/work
    cp /work/probe.mjs /tmp/work/probe.mjs
    npm init -y >/dev/null 2>&1
    npm install --no-audit --no-fund \
      @sourcemeta/jsonschema@17.0.0 \
      zod@4.6.7 \
      json-schema-to-zod@2.8.1 \
      x-to-zod@0.10.9 >/dev/null 2>&1
    node /tmp/work/probe.mjs
  '
