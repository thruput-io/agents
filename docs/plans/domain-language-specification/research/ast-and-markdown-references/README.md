# Research: Markdown AST Parsing and Reference Syntaxes for Prose Term Citations

## 1. Current `[[Id]]` & Regex Machinery in the Repository

Currently, cross-referencing glossary definitions (`rules/Definitions.yaml`) and governance entries (`rules/Rules.yaml`, `rules/Principles.yaml`, `rules/Rationales.yaml`, `rules/CodingPyramid.yaml`) inside prose text relies on five custom regex/string-splitting layers:

1. **Syntactic Regex in [`schemas/governance/definitions.schema.json`](../../../../schemas/governance/definitions.schema.json)**:
   - `Prose` applies `"pattern": "^[^\\[]*(?:(?:\\[\\[[^\\[\\]]*[^\\[\\]\\s][^\\[\\]]*\\]\\]|\\[[^\\[])[^\\[]*)*\\[?$"` and `"$dynamicRef": "#References"`.
2. **Citation-Forcing Regex in [`schemas/governance/rules.schema.json`](../../../../schemas/governance/rules.schema.json)**:
   - `DefinedProse` applies `"pattern": "^[^\\[]*(?:\\[[^\\[][^\\[]*)*\\[\\[[^\\[\\]]*[^\\[\\]\\s][^\\[\\]]*\\]\\][^\\[]*(?:(?:\\[\\[[^\\[\\]]*[^\\[\\]\\s][^\\[\\]]*\\]\\]|\\[[^\\[])[^\\[]*)*\\[?$"` and `"$dynamicRef": "#CitedDefinition"` so every rule `body` and `smells` entry contains at least one `[[DefinitionId]]`.
3. **Generated 200-ID Regex Alternations in [`scripts/declared-ids.schema.sh`](../../../../scripts/declared-ids.schema.sh)**:
   - Greps `^- id: ` across `rules/*.yaml`, escapes regex metacharacters with `sed`, and emits `schemas/governance/declared-ids.g.schema.json` containing two giant regex alternations (`References` across all ~200 IDs and `CitedDefinition` across all ~80 definition IDs).
4. **Naive Liquid String Splitting in [`web/_includes/prose.html`](../../../../web/_includes/prose.html)**:
   - Splits raw strings on `[[` and `]]` in Liquid template code to rewrite `[[Id]]` into `[Id](#slug)` before piping to Jekyll's `| markdownify` (Kramdown).
5. **Raw String Regex Extraction in [`tools/pr-review/src/adapters/fs/define.ts`](../../../../tools/pr-review/src/adapters/fs/define.ts)**:
   - Uses `const CITATION = /\[\[(?<term>[^\]]+)\]\]/gu;` on unparsed strings to recursively expand nested glossary definitions.

---

## 2. Why Flat-String Regexes Fail on Markdown Prose and How AST Parsing Solves It

### A. Lexical Blindness of Regular Expressions on Markdown

In CommonMark and Kramdown, inline constructs have strict lexical precedence (CommonMark Spec §6):
- **Code spans** (`` `...` ``) and **fenced/indented code blocks** (` ```...``` `) have higher precedence than links and emphasis. Inside a code span or code block, bracket characters `[[...]]` or `[...](#...)` are literal text, not references.
- **Backslash escapes** (`\[[foo]]`) suppress link parsing.
- **HTML comments / autolinks / URLs** have their own lexical boundaries.

Because `definitions.schema.json`, `declared-ids.schema.sh`, `prose.html`, and `define.ts` operate on flat strings without a Markdown lexer/AST:
1. **False positives & corruption inside code spans**: Writing `` `[[ -z "$VAR" ]]` `` or `` `[[Id]]` `` inside backticks in any `Prose` field is:
   - Rejected by `declared-ids.g.schema.json` because `-z "$VAR"` is not a declared governance ID.
   - Corrupted by `web/_includes/prose.html`, which splits on `[[` inside the backticks and injects `[ -z "$VAR" ](#--z-var-)` into the code span before Kramdown sees it.
   - Falsely traversed as a glossary term by `define.ts`.
2. **O(N × M) regex backtracking vs. O(N) AST traversal**:
   - Evaluating two 200-branch regex alternations across every string in `rules/*.yaml` couples JSON Schema validation to regex engine limits and requires `sed` escaping (`s/[.[\*^$()+?{|\\]/\\&/g`) whenever an ID contains punctuation.
   - Parsing Markdown into an Abstract Syntax Tree (AST) is a single linear `O(N)` pass over the string, followed by an `O(1)` `Set.has(id)` / enum check per extracted link node.
3. **Exact-string grammar distortion (`[[Term]]s`) and duplicate plural definitions**:
   - Because `[[Id]]` must match the exact `Id` string inside the regex alternation, authors must either write awkward suffix attachments (`[[Compatibility branch]]es`, `[[Side effect]]s`) or add duplicate plural alias definitions to `rules/Definitions.yaml` (`User` / `Users`, `Developer` / `Developers`, `Domain object` / `Domain objects`, `Illegal state` / `Illegal states`).

### B. Markdown AST Parsers in Our Stack (TypeScript/Node & Ruby/Jekyll)

#### 1. TypeScript / Node (`mdast` via `unified` / `remark`)
- **`mdast` (Markdown Abstract Syntax Tree)**: The standard Unist-based AST specification for Markdown in the JavaScript/TypeScript ecosystem (`mdast-util-from-markdown` / `remark-parse`, with `@types/mdast`).
- **Relevant `mdast` Node Types**:
  - `Root` (`type: "root"`, `children: Content[]`)
  - `Code` (`type: "code"`, `value: string`) and `InlineCode` (`type: "inlineCode"`, `value: string`) — leaf `Literal` nodes; brackets inside `value` are never parsed into child nodes.
  - `Link` (`type: "link"`, `url: string`, `title?: string`, `children: PhrasingContent[]`) — standard inline links `[display text](#term-slug)`.
  - `LinkReference` (`type: "linkReference"`, `identifier: string`, `label: string`, `referenceType: "shortcut" | "collapsed" | "full"`, `children: PhrasingContent[]`) — CommonMark reference links `[Term]` or `[display text][Term]`.
  - `WikiLink` (`type: "wikiLink"`, `value: string`, `data.alias?: string`) — when using `mdast-util-wiki-link` / `remark-wiki-link`, parses `[[Term]]` or `[[Term|display text]]` strictly outside `code` and `inlineCode`.
- **Footprint**: `mdast-util-from-markdown` + `unist-util-visit` is pure ESM/TypeScript with full static types (`@types/mdast`), zero native dependencies, and runs in milliseconds during `codegen` / `verify.sh` and inside `define.ts`.

#### 2. Ruby / Jekyll (`Kramdown::Document` & `lychee`)
- Jekyll (`github-pages` gem in `web/Gemfile`) already uses **Kramdown** (`Kramdown::Document.new(text).root`) as its Markdown AST parser when executing `{{ text | markdownify }}`.
- Kramdown parses Markdown into `Kramdown::Element` AST nodes (`:root`, `:p`, `:a`, `:codespan`, `:codeblock`, `:em`, `:strong`, etc.) before converting to HTML.
- If prose uses standard Markdown links (`[Term](#term-slug)`) or CommonMark reference links (`[Term]` with appended `[Term]: #term-slug` definitions), **Kramdown parses them natively in its AST** with zero Liquid string-splitting!
- Afterward, `scripts/build_site.sh` runs **`lychee --include-fragments`** over the compiled HTML DOM (`_site/index.html`), verifying that every `<a href="#...">` resolves to an existing `id="..."` attribute in the HTML.

---

## 3. Comparison of the Three Candidate Reference Syntaxes

| Dimension | Candidate A: Standard Inline Links `[text](#slug)` | Candidate B: CommonMark Reference Links `[Term]` / `[text][Term]` | Candidate C: AST-Parsed Wiki-Links `[[Term]]` / `[[Term\|text]]` |
|---|---|---|---|
| **Example in YAML** | `Code that has a [purpose](#purpose) and avoids [illegal states](#illegal-state).` | `Code that has a [Purpose] and avoids [illegal states][Illegal state].` | `Code that has a [[Purpose]] and avoids [[Illegal state\|illegal states]].` |
| **Standard specification** | 100% standard CommonMark §6.3 inline link | 100% standard CommonMark §6.3 shortcut / full reference link | Non-standard extension (`mdast-util-wiki-link`) |
| **Natural plurals & inflections** | Native (`[domain objects](#domain-object)`) | Native (`[domain objects][Domain object]`, case-insensitive label) | Requires pipe alias (`[[Domain object\|domain objects]]`) |
| **`web/_includes/prose.html`** | `{{ include.text \| markdownify }}` (1 line; zero Liquid splitting) | Append generated `[Id]: #slug` link definitions once, then `\| markdownify` | Requires AST plugin or preprocessing outside code spans |
| **AST Node in `mdast`** | `Link` (`node.type === "link"`, `node.url === "#purpose"`) | `LinkReference` (`node.type === "linkReference"`, `node.label === "Purpose"`) | `WikiLink` (`node.type === "wikiLink"`, `node.value === "Purpose"`) |
| **Code-span safety (`` `...` ``)** | Safe (parsed by Kramdown & `mdast` AST) | Safe (parsed by Kramdown & `mdast` AST) | Safe only if `prose.html` Liquid splitter is replaced |
| **`lychee --include-fragments`** | Natively validates every `#slug` target in `_site/index.html` | Validated by AST check + `lychee` (unmatched `[foo]` stays plain text unless AST-checked) | Validated by AST check + `lychee` |
| **`define.ts` traversal** | Walk `mdast` `Link` nodes where `url.startsWith("#")` and map slug $\rightarrow$ `Definition` | Walk `mdast` `LinkReference` nodes and map `identifier` $\rightarrow$ `Definition` | Walk `mdast` `WikiLink` nodes and map `value` $\rightarrow$ `Definition` |
