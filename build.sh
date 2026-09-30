#!/usr/bin/env bash
set -euo pipefail

# The CI Check workflow is the build. This runs its jobs locally, step by
# step and in order, with the shell GitHub runs them with, so a green
# ./build.sh is a green pull request.
#
#   ./build.sh               run every job in the workflow
#   ./build.sh <job>...      run the named jobs

cd "$(dirname "$0")"

workflow=.github/workflows/ci.yml
WORKFLOW=$(npx --yes yaml@2.9.1 --json --single <"$workflow")
export WORKFLOW

query() {
  node -e "const workflow = JSON.parse(process.env.WORKFLOW); $1" "${@:2}"
}

read -r -a jobs <<<"$(query 'console.log(Object.keys(workflow.jobs).join(" "))')"

if [[ $# -gt 0 ]]; then
  for job in "$@"; do
    if [[ " ${jobs[*]} " != *" $job "* ]]; then
      echo "No job '$job' in $workflow. Jobs: ${jobs[*]}" >&2
      exit 2
    fi
  done
  jobs=("$@")
fi

for job in "${jobs[@]}"; do
  echo "::group::$job"
  steps=()
  while IFS= read -r -d '' step; do
    steps+=("$step")
  done < <(query '
    for (const step of workflow.jobs[process.argv[1]].steps)
      if ("run" in step) process.stdout.write(step.run + "\0")
  ' "$job")
  for step in "${steps[@]}"; do
    bash --noprofile --norc -eo pipefail -c "$step"
  done
  echo "::endgroup::"
done
