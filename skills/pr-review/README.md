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
| `submit()` | Main agent | None | The posted review |

- `dispatch` spawns one sub agent per probe. Each sub agent receives its instructions and its data, and it has no channel back to the main agent beyond its return.
- The instructions are hard-coded constants from the schema, which the generated code already holds.
- The data is the probe's rules or rulesets and its fragments. It is passed to the sub agent, and `dispatch` logs everything it sent under the workdir as an audit trail.
- A sub agent writes its ledger to the path given in its data, and returns.
- The main agent decides, from the returns, whether a sub agent needs to run again.

## Flow

1. **Prepare.** The main agent chooses the workdir, reasons about prerequisites, and calls `prepare(url, workdir)`.
2. **Dispatch.** The main agent calls `dispatch(workdir)`. Sub agents run and return.
3. **Re-dispatch, if needed.** The main agent decides from the returns whether any sub agent must run again.
4. **Submit.** The main agent calls `submit()`.
