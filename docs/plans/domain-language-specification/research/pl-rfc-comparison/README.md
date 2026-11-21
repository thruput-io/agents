# Research: Programming Language & Formal Specification RFC Comparison

## 1. Section-by-Section Comparison: Standard PL/Formal RFCs vs. `uql` RFC

| Standard Section (Rust RFC / Swift Evolution / IETF RFC 7322 & 5234 / W3C & OMG SBVR/ACE) | Status in Initial `uql` Draft | Gap & Required Addition |
|---|---|---|
| **Preamble / Metadata** (Rust RFC, Swift Evolution, IETF RFC 7322) | Partial | Add `Normative References` (CommonMark 0.31.2, JSON Schema Draft 2020-12, SMT-LIB 2.6, ISO/IEC 14977 EBNF) and complexity/size budgets. |
| **Summary / Abstract** | Complete | Single-sentence self-contained abstract (~45 words). |
| **Motivation** | Complete | Concrete failure modes of `[[Id]]` and `declared-ids.schema.sh`. |
| **Guide-level Explanation** | Complete | Before/after translation of `Code is a liability, not an asset` and concrete specialization of `Smells` ($S' \subset S$). |
| **Lexical Grammar & Tokenization** (W3C, OMG, IETF RFC 5234) | Missing | Add explicit rules for longest-match (maximal munch) multi-word `Term` tokenization, case insensitivity, hyphenation, code-span escape, and deterministic inflection suffixes (`-s`, `-es`, `-ies`, `-ed`, `-ing`). |
| **Syntactic / Phrase Grammar (EBNF)** (W3C, OMG, Swift, ACE) | Missing (Prose Table Only) | Add a compact ISO/IEC 14977 EBNF grammar defining `Document`, `Statement`, `Clause`, `Subject`, `Predicate`, `Object`, `Adverbial`, and `ReferenceDef`, plus ACE Right-Association attachment rules so $\|\mathcal{T}(s)\| = 1$ is deterministic. |
| **Static & Logical Semantics** (W3C, OMG SBVR, ACE DRS) | Strong | Five formal invariants + Z3 SMT-LIB 2.6 & Alloy encodings + 5-step algorithm. |
| **Conformance Levels** (W3C Specification Guidelines, OMG) | Missing | Define tiered conformance: **Level 1 (Lexical & Reference Closure)**, **Level 2 (Syntactic Constituent & Anaphora Unambiguity)**, and **Level 3 (Logical Independence, Minimality & Satisfiability via SMT)**. |
| **Diagnostics & Error Recovery** | Complete (`Appendix A`) | 7 diagnostic kinds mapped to invariants and placeholder AST recovery nodes. |
| **Self-Hosting (Dogfooding `uql`)** | Missing | The normative rules of the `uql` RFC itself should be written in valid `uql-md` with a bottom `## References` section. |

---

## 2. Size & Complexity Thresholds for Cross-Model Agent Consumption

Based on instruction-following degradation across smaller/cheaper model families (`flash`, `haiku`, small open-weight models):

| Artifact Tier | Hard Threshold | Rationale |
|---|---|---|
| **Normative Core of RFC (`Reference-level explanation`)** | **$\le$ 1,200 words ($\le$ 8 KB)** | Loaded by agents when authoring, translating, or linting `uql`. Smaller models degrade when normative instruction rules exceed ~2,000 tokens. |
| **Complete RFC Document (`docs/rfcs/0001-ubiquitous-language.md`)** | **$\le$ 2,500 words ($\le$ 18 KB)** | Keeps the entire RFC readable in a single tool read without truncation. |
| **Per-Statement Complexity inside `uql`** | **$\le$ 35 words ($\le$ 220 bytes) per `Statement`** | Bounds clause nesting depth so constituent parsing remains unambiguous ($\|\mathcal{T}(s)\| = 1$). |
