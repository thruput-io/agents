# Research: JSON Schema Draft 2020-12 Content Vocabulary and AST Validation

## 1. JSON Schema Draft 2020-12 Content Vocabulary (`contentMediaType` & `contentSchema`)

In **JSON Schema Validation (Draft 2020-12), Section 8** (`https://json-schema.org/draft/2020-12/meta/content`), strings that contain structured or formatted payloads (such as Markdown, JSON-in-string, or JWTs) are described using the Content Vocabulary:

- **`contentMediaType` (Section 8.4)**: Declares the RFC 2046 MIME type of the string's contents (for Markdown: `"contentMediaType": "text/markdown"`).
- **`contentSchema` (Section 8.5)**: A JSON Schema object describing the structure of the decoded/parsed value of the string when `contentMediaType` is present.

### Specification Behavior (Annotation vs. Assertion)

1. **In Standard JSON Schema Evaluators (`@sourcemeta/jsonschema@17.0.0`)**:
   - By the Draft 2020-12 specification, `contentMediaType` and `contentSchema` produce **annotations**, not automatic validation assertions on raw strings, because a generic JSON Schema validator does not bundle a parser for every MIME type (`text/markdown`, `application/jwt`, etc.).
   - However, `@sourcemeta/jsonschema lint` and `@sourcemeta/jsonschema metaschema` **do** validate the `contentSchema` subschema against the Draft 2020-12 metaschema, and `$ref` / `$dynamicRef` inside `contentSchema` are resolved using standard JSON Schema scoping rules when `contentSchema` is evaluated against the parsed AST JSON.
2. **In Future / Extended JSON Schema Evaluators & Code Generators (`generate-contracts.ts`)**:
   - Because `contentMediaType: "text/markdown"` and `contentSchema` are standard Draft 2020-12 keywords, any schema-driven tool (including our `tools/pr-review/scripts/generate-contracts.ts` and AST verification step) can inspect `contentMediaType === "text/markdown"` + `contentSchema`, run the Markdown AST parser (`mdast-util-from-markdown`) to decode the string into its AST JSON representation, and validate that AST directly against `contentSchema`.

---

## 2. Replacing 200-ID Regex Alternations with `contentSchema` + `$dynamicAnchor: "Id"`

### Current Problem in `scripts/declared-ids.schema.sh`

Today, `scripts/declared-ids.schema.sh` generates `schemas/governance/declared-ids.g.schema.json` with four `$defs`:
1. `Id` (`$dynamicAnchor: "Id"`, `"enum": [...]`) — clean JSON Schema enum of all declared IDs.
2. `DefinitionId` (`$dynamicAnchor: "DefinitionId"`, `"enum": [...]`) — clean JSON Schema enum of all definition IDs in `rules/Definitions.yaml`.
3. `References` (`$dynamicAnchor: "References"`, `"pattern": "^[^\\[]*(?:(?:\\[\\[(?:id1|id2|...)\\]\\]|\\[[^\\[])[^\\[]*)*\\[?$"`) — a 200-branch regex alternation injected into every `Prose` string.
4. `CitedDefinition` (`$dynamicAnchor: "CitedDefinition"`, `"pattern": "^[^\\[]*(?:\\[[^\\[][^\\[]*)*\\[\\[(?:def1|def2|...)\\]\\]..."`) — an 80-branch regex alternation injected into every `DefinedProse` string.

### How `contentSchema` + Markdown AST Eliminates `References` and `CitedDefinition`

When a `Prose` string is decoded by a Markdown AST parser into a JSON structure representing the document and its extracted references:

```json
{
  "type": "root",
  "references": ["Purpose", "Illegal state"],
  "children": [...]
}
```

then `Prose` and `DefinedProse` no longer need any regular expressions at all. They validate `references` using standard JSON Schema array keywords (`items`, `contains`) and the existing `$dynamicAnchor: "Id"` and `$dynamicAnchor: "DefinitionId"` enums!

#### 1. `Prose` in `schemas/governance/definitions.schema.json`

```json
"MarkdownAst": {
  "description": "Decoded Markdown AST with extracted term/entry reference IDs outside code spans",
  "type": "object",
  "required": ["type", "references"],
  "properties": {
    "type": { "const": "root" },
    "references": {
      "type": "array",
      "items": {
        "$ref": "id.schema.json",
        "$dynamicRef": "id.schema.json#Id"
      }
    }
  }
},
"Prose": {
  "description": "Markdown prose whose internal references resolve to declared governance or definition IDs",
  "type": "string",
  "minLength": 1,
  "contentMediaType": "text/markdown",
  "contentSchema": {
    "$ref": "#/$defs/MarkdownAst"
  }
}
```

- Every item in `references` is validated against `id.schema.json` (`$dynamicRef: "id.schema.json#Id"`), which resolves to the `Id` enum in `declared-ids.g.schema.json`.
- If a prose string contains zero references, `references` is `[]`, which passes `items` validation automatically.
- If a prose string references an unknown ID (e.g. `[Unknown](#unknown)`), JSON Schema reports the exact failing array element and value (`"unknown" is not one of enum [...]`) instead of failing an unreadable 4,000-character regex pattern on the entire paragraph!

#### 2. `DefinedProse` in `schemas/governance/rules.schema.json`

If `DefinedProse` is kept so that every `Rule.body` and `Smells.items` must cite at least one glossary definition from `Definitions.yaml`, JSON Schema's standard `contains` keyword expresses this cleanly inside `contentSchema`:

```json
"DefinedProse": {
  "description": "Markdown prose that cites at least one defined glossary term from Definitions.yaml",
  "$ref": "definitions.schema.json#/$defs/Prose",
  "contentMediaType": "text/markdown",
  "contentSchema": {
    "allOf": [
      { "$ref": "definitions.schema.json#/$defs/MarkdownAst" },
      {
        "properties": {
          "references": {
            "contains": {
              "$ref": "definitions.schema.json#/$defs/DefinitionId",
              "$dynamicRef": "definitions.schema.json#DefinitionId"
            }
          }
        }
      }
    ]
  }
}
```

- `allOf` ensures every reference in `references` is a valid `#Id`, AND at least one element (`contains`) is a valid `#DefinitionId`.
- Both `References` and `CitedDefinition` regex alternations in `scripts/declared-ids.schema.sh` are **completely deleted**. `declared-ids.schema.sh` only emits the `Id` and `DefinitionId` JSON `enum` arrays (no `sed` regex escaping, no giant regex strings).

---

## 3. Pairing `contentSchema` with Zod v4 `z.codec` in `tools/pr-review`

`tools/pr-review` uses `zod@4.6.7` and generates `src/domain/contracts.g.ts` from `schemas/**/*.schema.json` via `tools/pr-review/scripts/generate-contracts.ts` (`customOverride` hook in `jsonSchemaToZod`).

In Zod v4, **`z.codec(inputSchema, outputSchema, { decode, encode })`** is the first-class primitive for bi-directional parsing between a wire format (`string` with `contentMediaType: "text/markdown"`) and a decoded domain representation (`MarkdownAst` validated against `contentSchema`):

```ts
export const ProseSchema = z.codec(
  z.string().min(1),
  MarkdownAstSchema,
  {
    decode: (markdown: string) => parseMarkdownProse(markdown),
    encode: (ast: MarkdownAst) => ast.raw,
  },
);
```

Where `parseMarkdownProse(markdown)` runs `fromMarkdown(markdown)` (`mdast-util-from-markdown`), walks the `mdast` tree with `unist-util-visit` (automatically skipping `code` and `inlineCode` nodes), and populates `references: string[]` from internal links.

### How Verification Works End-to-End in `scripts/verify.sh` and `scripts/build_site.sh`

1. **`@sourcemeta/jsonschema lint` & `metaschema`**:
   - Validates all schemas (including `contentMediaType` and `contentSchema`) against JSON Schema Draft 2020-12.
2. **AST + `contentSchema` Validation (`@sourcemeta/jsonschema validate` / Node AST validator)**:
   - Parses `Prose` / `DefinedProse` fields in `rules/*.yaml` with `mdast-util-from-markdown` and validates their decoded `MarkdownAst` objects against `contentSchema` + `declared-ids.g.schema.json` (`#Id` and `#DefinitionId` enums).
3. **HTML & Fragment Verification (`scripts/build_site.sh`)**:
   - Jekyll + Kramdown renders the Markdown to `_site/index.html`, `vnu` validates HTML5 compliance, and `lychee --include-fragments` verifies every rendered `#anchor` link in the final site.
