#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npx --yes github-actionlint@1.7.12 -color

# build.sh can only replay a step that checks out the code or runs a
# command with nothing GitHub-only in it, so CI Check holds to that.
stray=$(npx --yes yaml@2.9.1 --json --single <.github/workflows/ci.yml | node -e '
  const workflow = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (const [job, { steps }] of Object.entries(workflow.jobs))
    for (const step of steps)
      if (
        Object.keys(step).some((key) => !["name", "run", "uses"].includes(key)) ||
        ("uses" in step && step.uses !== "actions/checkout@v4") ||
        ("run" in step && step.run.includes("${{"))
      )
        console.log(`${job}: ${step.name ?? step.uses ?? step.run}`);
')

if [[ -n "$stray" ]]; then
  echo "CI Check steps may only check out the code or run a plain command, so ./build.sh runs them the same:" >&2
  echo "$stray" >&2
  exit 1
fi
