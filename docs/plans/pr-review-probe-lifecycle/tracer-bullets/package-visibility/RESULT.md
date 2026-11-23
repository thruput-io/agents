# Result

Run on 2026-11-23 in `node:24.22.0-bookworm-slim` with TypeScript 7.0.2: the type check passes, three tests pass and
one fails.

Shown to hold:

- The client parses, the controller calls the domain and the client encodes, through entry points only.
- An import of the friend module or of the marks from another package is a compile error.
- The same import is rejected at runtime with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

Shown not to hold:

- Package declarations do not keep the controller away from the codecs. A controller file that imports them without
  declaring their package compiles and runs, because npm makes every workspace package resolvable to every other.

Not shown:

- Whether the unused-code checker reports that undeclared import. Its test fails because knip 6.43.0 stops with
  `RangeError: Array buffer allocation failed` in `oxc-parser`. The parser's source says raw transfer creates a 6 GiB
  array buffer for each parse; the Docker machine the run used has 6199070720 bytes of memory in total. The same knip
  version runs outside the container.
