# ADR 0011: Ubiquitous Language (`uql`) Replaces Bracketed `[[Id]]` Prose

## Date

2026-11-21

## Context

Validating only bracketed `[[Id]]` citations through regular expressions and a build-generated `declared-ids.g.schema.json` file left unbracketed words unmapped, forced duplicate plural definitions (`Modules` / `Module`, `Types` / `Type`, `Seams` / `Seam`), coupled statements to external modal markers (`MUST`, `MUST NOT`, `SHOULD`, `MAY`), and mixed static JSON Schema definitions with dynamic glossary instances.

## Decision

1. Adopt **RFC 0001: Ubiquitous Language (`uql`)** ([`docs/rfcs/0001-ubiquitous-language.md`](../rfcs/0001-ubiquitous-language.md)) and its static JSON Schema contract ([`schemas/governance/ubiquitous-language.schema.json`](../../schemas/governance/ubiquitous-language.schema.json)) across all governance documents.
2. Express governance definitions and taxonomy statements in plain present-tense `UbiquitousLanguage` (`uql`) without `[[Id]]` brackets or external modal `marker` fields, moving inline URIs and verbatim quotes to ordered `references` (`[Label]: <URI> "Quote"`).
3. Remove `scripts/declared-ids.schema.sh`, `schemas/governance/declared-ids.g.schema.json`, and legacy `criteria` (`include` / `exclude`) lists from `schemas/governance/definitions.schema.json` and `rules/CodingPyramid.yaml`.
