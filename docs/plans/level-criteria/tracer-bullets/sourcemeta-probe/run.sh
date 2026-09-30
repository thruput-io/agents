#!/bin/sh
set -eu

plain() {
  characters=$(head -c "$1" /dev/zero | tr '\0' a)
  printf '"%s"\n' "$characters" > "/tmp/plain-$1.json"
}

accepts() {
  echo "accepts: $1 $2"
  jsonschema validate "$1" "$2"
}

rejects() {
  echo "rejects: $1 $2"
  jsonschema validate "$1" "$2" --invalid
}

plain 1000
plain 2000
plain 8000

accepts per-character.schema.json /tmp/plain-1000.json
rejects per-character.schema.json /tmp/plain-2000.json
accepts per-bracket.schema.json /tmp/plain-8000.json
accepts per-bracket.schema.json referenced.json
rejects per-bracket.schema.json unclosed.json
rejects per-bracket.schema.json blank.json
