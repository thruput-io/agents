# Tracer bullet: a domain object opaque by its interface

Question: can a [[Domain object]] be the generated data plus its methods in one frozen object, seen outside the domain
internals only as an interface with methods, and still be parsed and encoded by a zod codec with default settings? One
object takes another and returns a third, which is the case that needs a friend.

Run from this folder:

    docker build -t opaque-by-interface . && docker run --rm opaque-by-interface

The result is recorded in `RESULT.md`.
