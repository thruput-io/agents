# Result

Run on 2026-11-23 in `node:24.22.0-bookworm-slim` with TypeScript 7.0.2: the type check passes and all six tests pass.

| Library    | Version | Prepare compiles | Success test | Failure test | Imports in native ES modules      |
|------------|---------|------------------|--------------|--------------|-----------------------------------|
| Effect     | 4.1.5   | yes              | passes       | passes       | `effect/Effect`, `effect/Result`  |
| fp-ts      | 2.16.11 | yes              | passes       | passes       | `fp-ts/lib/TaskEither.js`         |
| neverthrow | 8.2.0   | yes              | passes       | passes       | `neverthrow`                      |

What the three versions show:

- Effect changes the type every port returns, and the caller runs the effect once at the edge.
- fp-ts keeps promises as tasks, composes with `pipe`, and is imported through its `lib` paths because the package has
  no exports map.
- neverthrow is the shortest: a result that is also awaitable, combined and chained with methods.

Docker printed a deprecation notice for its legacy builder on both builds; the builds succeeded.
