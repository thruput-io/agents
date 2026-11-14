# PR review: actors and interface

## Actors

- **Main agent.** Runs the review. It chooses the workdir, calls `prepare(url, workdir)`, and dispatches sub agents. It steps in again only if a sub agent times out before reporting. It writes no ledger rows and no review text itself.
- **Sub agent.** One per probe. It reasons about the rules it is given, calls `report()` on its ledger, and returns. It never talks to the main agent during the review.

## Auth

Set in the environment:

- Git: none.
- GitHub: `GH_TOKEN`, or none for public repositories.
- Azure DevOps: `AZURE_DEVOPS_EXT_PAT`, or none for public repositories.

## Contract

Only immutable objects cross between actors and code. Everything that can be calculated in code—preconditions (CI checks, merge conflicts, file size), change surface, rule order, `headCommit`, citations, thread settlement, and review submission—is calculated in code.

| Call                          | Who        | Input                                      | Output                                                                  |
| ----------------------------- | ---------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| `prepare(url, workdir)`       | Main agent | Target URL and the workdir the agent chose | Immutable prepared review (or refusal posted to the host)               |
| `dispatch(workdir)`           | Main agent | Workdir                                    | Pending sub agents run; the last sub agent to report submits the review |
| `SubAgentLedger.report(rows)` | Sub agent  | Immutable rows for its probe               | Recorded slice, or the posted review when this is the last probe        |

- `prepare` checks all preconditions in code (failing checks, merge conflicts, files over 200 lines, or an empty surface) and refuses on the host when blocked.
- `dispatch` spawns one sub agent per pending probe. Each sub agent receives its immutable instructions and data, and it has no channel back to the main agent beyond its return.
- The instructions are hard-coded constants from the schema, which the generated code already holds.
- The data is the probe's rules or rulesets and its fragments. `dispatch` logs everything it sent under the workdir as an audit trail.
- A sub agent calls `report(rows)` on its ledger. `report` validates the rows in code, attaches `headCommit`, writes the slice, and—when the last probe's slice is in—merges the ledger and submits the review to the host automatically.
- If a sub agent times out before reporting, the main agent calls `dispatch(workdir)` again, which spawns only the probes whose ledger slice is still missing.

## Classes

- `CodeUnderReview` (interface). The canonical pull request: `surface()`, `fragments()`, `threads()`. Threads are for the ledger's submission step only; sub agents see only the surface.
- `CodeUnderReviewFactory.from(url)` and `CodeUnderReviewFactory.from(url, token)`. Connect to the host and return a concrete, immutable `CodeUnderReview`.
- Concrete, immutable: `GithubPullRequest`, `AzureMergeRequest`, `GitDiff`.
- `CodeUnderReviewSnapshot` wraps a `CodeUnderReview` and adds `snapShot`.
- `Rulebook`: iterable rules. `Instructions` holds `Instructions.Prose`.
- `Ledger(path, pr)`, with one type per actor: `MainAgentLedger` (read-only view of pending/completed slices and the submitted report), and one per rule kind such as `DeadCodeSubAgentLedger` and `XxxSubAgentLedger`. Each sub agent ledger has `report(rows)`, which auto-submits once all slices are recorded.

## Controllers

Each actor has one controller, and it exposes only that actor's methods.

- **Main agent controller.** `prepare(url, workdir)`, `dispatch(workdir)`, and a read-only ledger factory so the main agent can inspect status when a sub agent times out.
- **Sub agent controller.** One write method (`report`) for its own ledger only. It is created with the workspace path it was given.

## Ledger

- The ledger is a sibling folder of the workspace. Nothing reads or writes it by path. It is reached only through the controllers and classes above.
- The main agent holds a read-only view of the ledger.
- Each sub agent is given a write method for its own ledger only. It knows nothing of the file system beyond its workspace path.
- When the last sub agent records a valid slice, the ledger merges all slices, computes thread settlements and reopenings, and submits the review to the host itself.

## Flow

1. **Prepare.** The main agent chooses the workdir and calls `prepare(url, workdir)`. Preconditions and surface are computed in code.
2. **Dispatch.** The main agent calls `dispatch(workdir)`. Sub agents run, call `report(rows)`, and the last one to finish submits the review automatically.
3. **Re-dispatch on timeout.** If a sub agent times out before reporting, the main agent calls `dispatch(workdir)` again to re-run only the missing probes until the ledger submits itself.
