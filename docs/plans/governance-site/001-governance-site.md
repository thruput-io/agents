# 001 — Governance site

|                |                                                     |
|----------------|-----------------------------------------------------|
| Plan           | `docs/plans/governance-site/001-governance-site.md` |
| Branch         | `governance-site`                                   |
| Started        | 2026-09-29                                          |
| Supersedes     | —                                                   |
| ADRs consulted | ADR 0001, ADR 0002, ADR 0003                        |
| ADRs added     | ADR 0004                                            |
| Status         | in progress                                         |

## Background

The schemas carried an `$id` under a GitHub Pages URL and a workflow copied them there, but nothing rendered the governance documents for a reader, and the semgrep rules cite anchors that no page served.

### Goals

1. The schemas are served at the URL their `$id` names.
2. One page renders the taxonomy as a tree from values to standards, generated from the YAML, with the glossary and the level criteria, and links the standards level to the semgrep repository.
3. The build fails on a duplicate id, a reference to a missing entry, and an entry whose parent does not exist.

## Execution Plan

1. Establish the URL from GitHub's documentation and the organisation site's Pages configuration; record the decision in ADR 0004.
2. Generate the site with the exact image GitHub Pages uses, in Docker, and check the output with the Nu HTML Checker and lychee. `scripts/site.sh` is the one build.
3. Publish on every push to `main`; build and check on every pull request.
4. Prove the checks reject a broken reference and a broken parent with a tracer bullet that the pull request check runs.
5. Keep the web files in `web/` and the build output out of the repository: mount the sources read-only and render into a Docker volume.
6. Render every level with one template that includes itself, proven by `tracer-bullets/recursive-include/run.sh` and by rendering the site before and after.

Verification: `scripts/validate.sh` and `scripts/site.sh` pass; `tracer-bullets/broken-references/run.sh` and `tracer-bullets/recursive-include/run.sh` pass.

## Found by the checks

Content defects the site build surfaces. Each is a decision for the owners of the documents, not for this plan.

- `Quality Uncompromised` names the parent `Not Yet Decided Axiom`, which no rationale declares, so it has no place in the tree and its index link fails the link check.
- `docs/[[ADRs]]/` in Durable Intent Over Comments places a reference inside a code span, where it renders as text.

## Parked

- Per-rule links into the semgrep repository. The semgrep rules cite our anchors in their metadata; the reverse link needs either a field on the standard or a lookup at build time.
- `actions/upload-pages-artifact` and `actions/deploy-pages` have newer majors than the workflow pins.
- The `CI Check` workflow still names the merged branch `yaml-governance-documents` in its triggers.
