#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

broken=$(mktemp -d "$(dirname "$PWD")/agents-broken-governance.XXXXXX")

remove_broken() {
  rm -rf "$broken"
}
trap remove_broken EXIT

fails() { ! "$@"; }

governance_with() {
  cp governance/*.yaml "$broken/"
  cat >> "$broken/$1"
}

governance_with Values.yaml <<'YAML'
- id: Broken reference
  body: |
    A reference to [[No such entry]].
YAML
fails scripts/site.sh "$broken"
echo "site.sh rejected a reference to an entry that does not exist"

governance_with Axioms.yaml <<'YAML'
- id: Broken parent
  parent: No such value
  body: |
    An axiom whose parent does not exist.
YAML
fails scripts/site.sh "$broken"
echo "site.sh rejected an entry whose parent does not exist"

governance_with Definitions.yaml <<'YAML'
- id: Broken enumeration
  specification: |
    A term whose kinds include one that does not exist.
  closedEnumerationOf:
  - No such term
YAML
fails scripts/site.sh "$broken"
echo "site.sh rejected an enumeration of a term that does not exist"
