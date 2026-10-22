# Tracer bullet: JSON Schema 2020-12 to Zod derivation across all 26 repository schemas

Question: across all 17 schemas in `schemas/review/` and all 9 schemas in `schemas/governance/`, how do:
1. `z.fromJSONSchema(bundled)` (in `zod@4.6.7`) directly on `@sourcemeta/jsonschema@17.0.0 bundle --without-id` output,
2. `z.fromJSONSchema(dereferenced)` after resolving RFC 6901 `#/$defs/...` JSON Pointers in the bundled output, and
3. `json-schema-to-zod@2.8.1` code generation to ESM `.mjs` imported by Node 22

behave on every schema in the repository?

Run from this folder (uses `docker run` directly with volume mounts, without `docker build`):

    ./run.sh

The result is recorded in `RESULT.md`.
