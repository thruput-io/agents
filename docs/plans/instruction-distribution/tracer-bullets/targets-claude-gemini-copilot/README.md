# Tracer bullet: targets claude, gemini, copilot

Question: does AgentPlugins 0.6.1 accept a manifest that declares `targets` `claude`, `gemini` and `copilot`, with
the probe agent and the pr-review skill, and what does `build` emit for each target?

Run from this folder:

    docker build -t agentplugins-targets . && docker run --rm agentplugins-targets

The result is recorded in `RESULT.md`.
