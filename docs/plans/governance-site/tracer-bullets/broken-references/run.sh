#!/usr/bin/env bash
set -euo pipefail

repository=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
probe=$(mktemp -d "$(dirname "$repository")/agents-probe.XXXXXX")

remove_probe() {
  rm -rf "$probe"
}
trap remove_probe EXIT

rejects() { ! "$@"; }

probe_with() {
  rsync --archive --exclude .git --exclude _site --exclude node_modules "$repository/" "$probe/"
  cat >> "$probe/governance/$1"
}

probe_with Values.yaml <<'YAML'
- id: Probe
  body: |
    A reference to [[No such entry]].
YAML
rejects "$probe/scripts/site.sh"
echo "rejected: a reference to an entry that does not exist"

probe_with Axioms.yaml <<'YAML'
- id: Probe
  parent: No such value
  body: |
    An axiom whose parent does not exist.
YAML
rejects "$probe/scripts/site.sh"
echo "rejected: an entry whose parent does not exist"
