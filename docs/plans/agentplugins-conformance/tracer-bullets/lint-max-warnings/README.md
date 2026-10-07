# Tracer bullet: lint with --max-warnings 0

Question: does `agentplugins lint --max-warnings 0` fail on a manifest that declares `targets` claude, gemini and
copilot with no hooks, and does it pass on the same manifest without `targets`? Both fixtures use the documented
manifest name, `agentplugins.json`.

`run.sh` does not stop on the first failing lint, so that both exit statuses are recorded.

Run from this folder:

    docker build -t agentplugins-lint . && docker run --rm agentplugins-lint

It also records what `lint --json` prints for each fixture.

The result is recorded in `RESULT.md`.
