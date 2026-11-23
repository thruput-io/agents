# Result

Run on 2026-11-23 in `node:24.22.0-bookworm-slim` with TypeScript 7.0.2 and zod 4.6.7: the type check passes and all
six tests pass.

Shown to hold:

- A zod codec with default settings parses the generated data into the domain object and encodes it back to the same
  wire object.
- Code that holds the interface cannot read a field of the data, cannot pass one domain type where another is asked
  for, and cannot build a domain object by hand. The compiler rejects all three.
- A method on one object reads the data of another through a friend function and returns a third object.
- Encoding rejects an object the domain did not mint, and a minted object is frozen.

What it costs:

- The hiding is at compile time. At runtime the fields are on the object.
- No cast is needed. The merged object is assigned to the interface, and the friend module reads the data back through
  an assertion that the object was minted by the domain.
- Each interface carries a mark keyed by a symbol only the friend module can reach, so that two interfaces with the
  same methods are not interchangeable and a hand-built object is rejected.
