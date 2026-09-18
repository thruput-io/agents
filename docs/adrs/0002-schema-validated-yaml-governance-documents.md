# ADR 0002: Schema-Validated YAML Governance Documents

## Status

Accepted

## Date

2026-09-18

## Context

[ADR 0001](./0001-separating-principles-rules-and-standards.md) split governance into Principles, Rules, and Standards but kept each tier as prose markdown. That form had three weaknesses:
- **No stable identity:** A rule was addressed by a heading anchor derived from its text, so rewording a heading silently broke every citation.
- **No structural checks:** Nothing stopped a rule from lacking a marker, carrying a marker outside RFC 2119, or citing a principle that did not exist.
- **No traceability:** The link from a rule back to the principle it enforces lived only in scattered prose, so a rule with no principle behind it was indistinguishable from one that had.

## Decision

The Principles and Rules tiers, and the shared vocabulary they rely on, are YAML documents at the repository root, each validated against a JSON Schema (draft 2020-12) on every pull request. YAML is the only source; no markdown rendering of these tiers is committed.

### Documents and schemas

| Document | Schema | Entry shape |
| :--- | :--- | :--- |
| `principles.yaml` | `schemas/principles.schema.json` | `title`, `body` |
| `rules.yaml` | `schemas/rules.schema.json` | `marker`, `group`, `guards`, `body` |
| `definitions.yaml` | `schemas/definitions.schema.json` | `term`, `specification` |

Shared components live in `schemas/common.schema.json` and are referenced by relative `$ref` from the document schemas: `principle-key` (a closed enum of principle ids), `rule-key`, `definition-key`, and `text`. Schemas carry no `$id`, so references resolve from the file path in every environment.

### Identity

Every entry is a key in a map, and that key is its id. An id matches `^[a-z0-9]+(-[a-z0-9]+)*$` and is the only stable handle for the entry. Duplicate ids are unrepresentable because YAML forbids duplicate keys. An entry is cited by absolute URL with the id as fragment: `https://github.com/thruput-io/agents/blob/main/rules.yaml#parse-dont-validate`. Heading text is not stored; where prose once served as a bookmark, the id now does.

### Rules guard principles

Every rule names, in `guards`, the single principle it exists to enforce. `principle-key` is an enum, so a rule that names a principle absent from `principles.yaml` fails validation. Adding a principle therefore means adding its id to the enum in `schemas/common.schema.json` and its entry in `principles.yaml` in the same change.

A rule with no honest candidate guards the principle `orphans`. That principle carries no values of its own; it marks a gap. A rule under `orphans` is a standing prompt to either write the missing principle and re-point the rule, or retire the rule. Nothing new is placed under `orphans` without first checking every other principle.

### Markers and groups

`marker` is one of `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`, `PREFER`, with RFC 2119 meaning and `PREFER` as a directional default. `group` is a free-text cluster label for readers and has no bearing on precedence.

### Enforcement

The `PR Check` workflow (`.github/workflows/pr-check.yml`) validates each document against its schema with `check-jsonschema` and blocks the merge on failure. `scripts/validate.sh` runs identical commands inside Docker for local use, so the two cannot diverge.

### Changing an entry

- A body edit is a change to that entry alone.
- A marker change is a precedence change and needs its own pull request with the reasoning in the description.
- Renaming an id is a breaking change to every citation and is done only with a search of consuming repositories.
- Removing a rule requires stating which principle no longer needs it, or that it guarded `orphans`.

## Consequences

### Positive
- **Stable citations:** Ids survive rewording of bodies.
- **Structural guarantees at PR time:** Missing fields, foreign markers, and dangling principle references cannot merge.
- **Visible gaps:** `orphans` turns an implicit lack of rationale into an explicit list to work down.
- **Machine-readable tiers:** Agents and tooling load rules and principles without parsing prose.

### Negative
- Readers browse YAML rather than rendered markdown until a renderer exists.
- The `principle-key` enum couples the schema to the content, so adding a principle touches two files.
- Sub-section structure from the former markdown survives only as the `group` label.
