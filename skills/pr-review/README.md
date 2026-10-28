# PR review: actors and interface

## Actors

- **Main agent.** Runs the review. It prepares the workdir, dispatches sub agents, checks their ledgers, and submits the review. It writes no ledger rows and no review text itself.
- **Sub agent.** One per instructions file. It checks a group of rules against the change and writes one ledger. It sees only its own instructions file and the fixed dispatch message.

## Interface

The two actors communicate only through documents in the workdir.

| Document | Written by | Read by | Content |
|---|---|---|---|
| Instructions file (`instructions/NN-name.yaml`) | Main agent | Sub agent | Its rules or rulesets, the change as fragments, the ledger path, and the check command |
| Dispatch message | Main agent | Sub agent | Fixed text: read the file and do what it says |
| Ledger (`ledger/NN-name.json`) | Sub agent | Main agent | One row per rule: verdict, examined, evidence, violations anchored on surface lines |

The sub agent runs the check command named in its instructions file until the ledger passes. The main agent does not edit ledgers or the review.

## Flow

1. **Prepare.** The main agent resolves the change and writes the instructions files.
2. **Dispatch.** The main agent sends each sub agent the dispatch message. A sub agent that writes no ledger is dispatched again.
3. **Check.** Each sub agent runs the check command on its own ledger until it passes.
4. **Submit.** The main agent merges the passing ledgers into an outcome and posts the review.
