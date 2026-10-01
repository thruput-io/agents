# ADR 0002: Taxonomy Declared as JSON Schema

## Date

2026-09-26

## Context

Instructions and prompts to agents suffered from academic word feuds. No nice overview existed.

## Decision

Rules and Philosophy are replaced by a taxonomy declared as JSON Schema.

## Motivation

This makes it easy to be exact in skills and instructions, and to generate diagrams for overviews and nice-looking HTML.
We put as muc as possible into levels 1 to 5. Level 6 has no limit other than the time we have; its main home is in our tooling especially Semgrep repository, among others.
