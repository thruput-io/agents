# ADR 0011: Results and Failures Travel in Effect

## Date

2026-11-23

## Context

Our rules ask that a failure appears in the signature, that absence is a case the compiler makes every caller handle,
that nothing continues past a failure, and that the choice between outcomes is folded at the [[Perimeter]]. In
TypeScript a union of outcomes holds none of this by itself: the caller tells the alternatives apart by hand, and a
failure can be dropped without the compiler noticing. A hand-written either is [[New code]] where an
[[External dependency]] serves, and of the libraries that offer one, only Effect is maintained by several active
contributors.

The same `prepare` was written with Effect, fp-ts and neverthrow in
[a tracer bullet](../plans/pr-review-probe-lifecycle/tracer-bullets/either-library/RESULT.md); all three compile and
pass on TypeScript 7.

## Decisions

1. **Effect carries every result and failure in the review tool.** An operation that can fail returns an effect whose
   failure type is a closed set of [[Domain object]]s. An expected failure is never thrown.

2. **An effect is folded only at the perimeter.** The controller, the domain and the adapters map over the success
   side. The client runs the effect once and folds both sides into what it prints.

3. **The library is how TypeScript satisfies these rules.** The rules stay worded as concepts, so that another
   language satisfies them by its own means.

   - [[Creation failure in the signature]]: a factory returns an effect whose failure type is the invalid input.
   - [[Compile-time optionality]]: the library's option type.
   - [[No default on failure]] and [[No degraded continuation]]: the failure side reaches the perimeter unchanged.
   - [[Exhaustive matching]] and [[Branching belongs at the perimeter]]: the fold takes a handler for each side.

   [[No silent catch]] is not held by the library; a lint rule holds it.

4. **Zod stays the only parser.** Decision 2 of
   [ADR 0010](0010-pr-review-probe-tool-and-submission-lifecycle.md) stands, and Effect's schema module is not used.
