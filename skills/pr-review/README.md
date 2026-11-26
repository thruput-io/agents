# PR review: actors and interface

The tool is built from [`tools/pr-review`](../../tools/pr-review) into `dist/bin`. Its design and the order it is built
in are in the [plan](../../docs/plans/pr-review-probe-lifecycle/002-pr-review-probe-lifecycle.md).

## Actors

- **Main agent.** Starts a review with `prepare` and follows it with `status`. It decides nothing about the review.
- **Sub agent.** One per probe, started and stopped by the tool. It reads its instructions, acknowledges them, reads its
  rules and the surface, and reports one verdict per rule. It knows nothing of the other sub agents.
- **The tool.** Reads the change from the host, hands each sub agent only its own part, decides when the review is
  complete, builds the outcome and posts it.

## Interface

Each actor has an executable of its own, and `-h` on either prints its commands. Their arguments, and the names a
failure is answered by, are defined in the schemas under [`tools/pr-review/schemas`](../../tools/pr-review/schemas).

| Executable              | Used by    |
| ----------------------- | ---------- |
| `review-tool.mjs`       | Main agent |
| `review-tool-probe.mjs` | Sub agent  |

## Auth

The host adapters read their tokens from the environment.
