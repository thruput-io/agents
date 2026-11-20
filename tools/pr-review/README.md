# PR Review Tooling

## Architecture

1. **Schemas as Contracts and Instructions**:
   - Governance and review JSON Schemas (Draft 2020-12) define every domain shape and embed `const` instructions, tasks, permissions, and deadlines directly on object properties.
   - Probe kind is data, not a set of static instruction or ledger classes.
   - CLI help emits the Draft 2020-12 JSON Schema directly from the command schema so the contract instructs the agent without separate prose wrappers.

2. **Two Hands-Off Codegen Pipelines**:
   - **Internal contracts**: Governance and review JSON Schemas compile into Zod v4 domain schemas with `const` defaults.
   - **External host specifications**: Official GitHub and Azure DevOps OpenAPI specifications compile into typed fetch clients, MSW test mocks, and Zod v4 wire schemas.

3. **Zod Boundary Parsing and Transformation**:
   - All I/O and structural transformations run through `zod.parse` and `z.codec`.
   - Parsing a domain object validates its fields and populates all `const` instruction, permission, prompt, and deadline properties from the schema defaults.
   - Adapters bridge generated external wire schemas and raw filesystem or git output into internal domain schemas via Zod codecs at the perimeter.

4. **Layers**:
   - **Domain**: Pure domain types, ruleset pagination, surface diffing, ledger validation, and outcome calculation with zero I/O or transport imports.
   - **Controller**: Session preparation, probe acknowledgment, paging, and automatic review submission on the final probe report through domain ports.
   - **Client**: Main-agent and probe CLI entry points that parse arguments against command schemas and emit Draft 2020-12 JSON Schemas on help.
   - **Adapters**: GitHub, Azure DevOps, local git, and filesystem adapters that own all network, process, and disk I/O and clean only managed subdirectories inside the working directory.
