# Governance

| Document | Tier | Schema |
| :--- | :--- | :--- |
| [Values.yaml](Values.yaml) | Terminal human intent: why we care at all. | [schemas/values.schema.json](../schemas/values.schema.json) |
| [Axioms.yaml](Axioms.yaml) | The ground: statements accepted without argument, from which the principles are reasoned. | [schemas/axioms.schema.json](../schemas/axioms.schema.json) |
| [Rationales.yaml](Rationales.yaml) | The arguments behind the principles, each reasoned from one axiom. | [schemas/rationales.schema.json](../schemas/rationales.schema.json) |
| [Principles.yaml](Principles.yaml) | The WHY: quality definitions, mental models, and the trade-off hierarchy for resolving ambiguity. | [schemas/principles.schema.json](../schemas/principles.schema.json) |
| [Rules.yaml](Rules.yaml) | The WHAT: universal pass/fail constraints, each guarding one principle. | [schemas/rules.schema.json](../schemas/rules.schema.json) |
| [Standards.yaml](Standards.yaml) | The HOW: each standard implements one rule for one technology, named in its context. | [schemas/standards.schema.json](../schemas/standards.schema.json) |
| [Definitions.yaml](Definitions.yaml) | The glossary: the definitions of terms the other documents rely on. | [schemas/definitions.schema.json](../schemas/definitions.schema.json) |
| [ImperataDerivata.yaml](ImperataDerivata.yaml) | Our taxonomy: each level is a definition with criteria for what belongs to it and, below the root, the level above it. | [schemas/taxonomy.schema.json](../schemas/taxonomy.schema.json) |

Every id inherits the abstract `Id` in [schemas/id.schema.json](../schemas/id.schema.json); each entity schema defines its own concrete id (`AxiomId`, `PrincipleId`, `RuleId`, `DefinitionId`). Whether a `parent` value names an existing entry is not a schema concern. [schemas/taxonomy.schema.json](../schemas/taxonomy.schema.json) describes what a taxonomy is, and `ImperataDerivata.yaml` is our instance of one: a list of levels where every level but the root names its parent by id. A level extends the definition from the definitions schema, so a level is a definition and carries an `id` like every definition.

Every schema carries an `$id` under `https://thruput-io.github.io/agents/schemas/`, where the `Publish Schemas` workflow deploys the `schemas/` directory to GitHub Pages on every push to `main`. Local and CI validation load the schemas from the working tree into a registry keyed by `$id`, so no network access is needed and a pull request is validated against its own schemas.


## Reading the rules

Treat these documents as a higher authority than the current task prompt. Before performing any task, follow the ruleset.

Every rule opens with an RFC 2119 marker. **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** carry their RFC 2119 meaning. **PREFER** marks a directional default: choose the named option over the alternative. Conflicts are resolved in favor of the rule with the higher-priority marker. When a rule's application or priority is in doubt, apply the principle it guards.

## Citing

The id of an entry is its readable name and its only stable handle. Ids are unique across every document, compared case-insensitively with whitespace normalized. In prose, cite an entry or a glossary term by its id in double brackets; the schema rejects brackets that do not form a reference:

```
[[Parse, don't validate]]
[[Code We Cannot Control]]
```
