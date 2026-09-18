# ADR 0003: Axioms Above Principles

## Date

2026-09-18

## Context

[ADR 0001](./0001-separating-principles-rules-and-standards.md) established three tiers: Principles say why, Rules say what, Standards say how. In practice several principles rest on the same unstated premise, and when two principles pull in different directions there is nothing above them to settle the question. The premise was being restated, slightly differently, in each principle that needed it.

## Decision

Add a fourth tier, **Axioms**, above Principles.

An axiom is a statement accepted without argument. It is not derived from anything in this repository; the principles are reasoned from it. Axioms are few, short, and stable. An axiom carries no RFC 2119 marker and is never cited as the direct justification for a code change; a rule or principle is.

```
+-------------------------------------------------------------------+
|  0. AXIOMS (The ground)                                           |
|  - Statements accepted without argument                           |
|  - Principles are reasoned from them                              |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  1. PRINCIPLES (The "Why")                                        |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  2. RULES (The "What")                                            |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  3. STANDARDS (The "How")                                         |
+-------------------------------------------------------------------+
```

Axioms live in `axioms.yaml`, validated by `schemas/axioms.schema.json`, with the same entry shape and identity rules as principles per [ADR 0002](./0002-schema-validated-yaml-governance-documents.md). `axiom-key` is a closed enum in `schemas/common.schema.json`.

The first axioms are **Single Source of Truth**, every piece of information is defined exactly once and every other place it appears is a source of confusion, and **Shift Left**, every activity is done at the earliest point where it can be done. The former principle named Shift Left is one interpretation of that axiom, applied to verification, and is renamed **Shift Test Left**.

## Consequences

### Positive
- A shared premise is stated once and referenced, rather than restated in each principle.
- A conflict between principles has a tier above it to appeal to.

### Negative
- A fourth tier is one more place to look.
- Principles do not yet name the axiom they rest on; whether to add such a field, mirroring `guards` on rules, is left to a later decision.
