# Tracer bullet: an either from a library

Question: can the main agent's prepare be written against a library either, with a typed failure in the signature, no
branching, and one fold at the edge, on TypeScript 7 with the strictest settings? The same prepare is written with
Effect, fp-ts and neverthrow, and one test file exercises all three.

Run from this folder:

    docker build -t either-library . && docker run --rm either-library

The result is recorded in `RESULT.md`.
