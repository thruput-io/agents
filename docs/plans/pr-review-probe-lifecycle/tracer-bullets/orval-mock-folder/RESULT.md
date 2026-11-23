# Result

Run on 2026-11-23 in `node:24.22.0-bookworm-slim` with TypeScript 7.0.2: two of four tests pass and two fail.

| Orval version | Tsconfig found by orval | Tsconfig named        | Type check                |
|---------------|-------------------------|-----------------------|---------------------------|
| 8.47.0        | `../client/widgets.g`   | `../client/widgets.g` | 2 errors, both TS2307     |
| 8.48.0        | `../client/widgets.g`   | `../client/widgets.g` | 2 errors, both TS2307     |
| 8.49.0        | `../client/widgets.g`   | `../client/widgets.g` | 2 errors, both TS2307     |

What the run shows:

- Orval writes one mock file into the folder of its own, and the file imports the client without a file extension.
- Naming the tsconfig changes nothing, although it sets `allowImportingTsExtensions`.
- The mock file of this specification imports only types from the client, so it still loads as a native module; the
  type check is what rejects it.
- The two newer versions were run in the same image after installing each over the pinned 8.47.0.

The two failing tests state the import the type check needs, and pass once an orval version writes it.

Docker printed a deprecation notice for its legacy builder; the build succeeded.
