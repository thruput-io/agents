# ADR 0006: Diffs Are Described in a Schema of Our Own

## Date

2026-10-05

## Context

A review hands each probe the lines a pull request adds and removes, with the text of the removed lines, as data. No published schema describes that:

| Candidate | Why it does not fit |
| :--- | :--- |
| GitHub `diff-entry`, GitLab diff | Line numbers and removed text sit inside an opaque patch string |
| Azure DevOps `LineDiffBlock` | Line ranges for both sides, but no line text |
| Bitbucket Data Center `RestDiff` | The right shape, but an OpenAPI component under Atlassian's licence with no required fields |
| SARIF, reviewdog | Published schemas, but one-sided and JSON Schema draft-04 |
| parse-diff, gitdiff-parser, diff2html | The right shape and maintained, but TypeScript types only, no schema |

## Decision

A diff is described in a schema of our own rather than a reused one.
