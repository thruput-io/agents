# PR review: actors and interface

## Actors

- **Main agent.** Runs the review. It chooses the workdir by reasoning, checks prerequisites (size, description), prepares the change, dispatches sub agents, decides whether any sub agent needs invoking again, and submits the review. It writes no ledger rows and no review text itself.
- **Sub agent.** One per probe. It reasons about the rules it is given, writes one ledger, and reports back by returning. It never talks to the main agent during the review.

## Auth

Set in the environment:

- Git: none.
- GitHub: `GH_TOKEN`, or none for public repositories.
- Azure DevOps: `AZURE_DEVOPS_EXT_PAT`, or none for public repositories.

## Contract

| Call | Who | Input | Output |
|---|---|---|---|
| `prepare(url, workdir)` | Main agent | Target URL and the workdir the agent chose | Immutable PR object |
| `dispatch(workdir)` | Main agent | Workdir | One return per sub agent, once it finishes |
| `MainAgentLedger.submit()` | Main agent | None: the ledger is already bound to its path and pull request | The posted review |

- `dispatch` spawns one sub agent per probe. Each sub agent receives its instructions and its data, and it has no channel back to the main agent beyond its return.
- The instructions are hard-coded constants from the schema, which the generated code already holds.
- The data is the probe's rules or rulesets and its fragments. It is passed to the sub agent, and `dispatch` logs everything it sent under the workdir as an audit trail.
- A sub agent writes its ledger to the path given in its data, and returns.
- The main agent decides, from the returns, whether a sub agent needs to run again.

## Classes

- `CodeUnderReview` (interface). The canonical pull request: `surface()`, `fragments()`, `threads()`. Threads are for the main agent only; sub agents see only the surface.
- `CodeUnderReviewFactory.from(url)` and `CodeUnderReviewFactory.from(url, token)`. Connect to the host and return a concrete `CodeUnderReview`.
- Concrete, immutable: `GithubPullRequest`, `AzureMergeRequest`, `GitDiff`.
- `CodeUnderReviewSnapshot` wraps a `CodeUnderReview` and adds `snapShot`.
- `Rulebook`: iterable rules. `Instructions` holds `Instructions.Prose`.
- `Ledger(path, pr)`, with one type per actor: `MainAgentLedger` (with `submit()`), and one per rule kind such as `DeadCodeSubAgentLedger` and `XxxSubAgentLedger`. Each sub agent ledger has `report(XxxCodeViolation)`.

## Controllers

Each actor has one controller, and it exposes only that actor's methods.

- **Main agent controller.** `prepare(url, workdir)`, `dispatch(workdir)`, and a ledger factory the main agent can call on its own, so it can solve I/O problems itself.
- **Sub agent controller.** One write method for its own ledger only. It is created with the workspace path it was given.

## Ledger

- The ledger is a sibling folder of the workspace. Nothing reads or writes it by path. It is reached only through the controllers and classes above.
- The main agent creates the ledger through its factory and holds a read-only view of it.
- Each sub agent is given a write method for its own ledger only. It knows nothing of the file system beyond its workspace path.

## Flow

1. **Prepare.** The main agent chooses the workdir, reasons about prerequisites, and calls `prepare(url, workdir)`.
2. **Dispatch.** The main agent calls `dispatch(workdir)`. Sub agents run and return.
3. **Re-dispatch, if needed.** The main agent decides from the returns whether any sub agent must run again.
4. **Submit.** The main agent calls `MainAgentLedger.submit()`.
