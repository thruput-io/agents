#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ids=$(grep -h '^- id: ' governance/*.yaml | sed 's/^- id: //')
enumeration=$(printf '%s\n' "$ids" | sed 's/["\\]/\\&/g; s/.*/"&"/' | paste -sd, -)
alternation=$(printf '%s\n' "$ids" | sed 's/[][\\.^$*+?(){}|]/\\&/g; s/\\/\\\\/g' | paste -sd'|' -)

cat <<JSON
{
  "\$schema": "https://json-schema.org/draft/2020-12/schema",
  "\$ref": "https://thruput.se/agents/schemas/governance.schema.json",
  "\$defs": {
    "Id": {
      "\$dynamicAnchor": "Id",
      "enum": [$enumeration]
    },
    "References": {
      "\$dynamicAnchor": "References",
      "pattern": "^[^\\\\[]*(?:(?:\\\\[\\\\[(?:$alternation)\\\\]\\\\]|\\\\[[^\\\\[])[^\\\\[]*)*\\\\[?\$"
    }
  }
}
JSON
