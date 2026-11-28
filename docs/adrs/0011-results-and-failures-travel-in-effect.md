# ADR 0011: Results and Failures Travel in Effect

## Date

2026-11-23

## Context

Our rules ask four things: a failure appears in the [[Signature]], absence is a case the [[Compiler]] makes every
caller handle, nothing continues past a failure, and the choice between outcomes is folded at the [[Perimeter]]. A
TypeScript union of outcomes holds none of the four: the caller tells the alternatives apart by hand, and a failure is
dropped without an error. A hand-written either is [[New code]] where an
[[External dependency]] serves. Of the libraries that offer one, only [Effect](https://effect.website/) is a
[[Maintained library or framework]]. A
[tracer bullet](https://github.com/thruput-io/agents/blob/cda2f8cb76883f04c57783b364fc1dc1633719a1/docs/plans/pr-review-probe-lifecycle/tracer-bullets/either-library/RESULT.md)
holds the same `prepare` in Effect, fp-ts and neverthrow; all three compile and pass on TypeScript 7.

## Decisions

1. **Effect carries every result and failure in the review tool.** An operation that can fail returns an effect whose
   failure type is a closed set of [[Domain object]]s. An expected failure is never thrown.

2. **An effect is folded only at the [[Perimeter]].** The controller, the domain and the adapters map over the success
   side and pass the failure side on unchanged. The client runs the effect once and folds both sides into what it
   prints.

3. **Effect is how TypeScript satisfies these rules.** Another language satisfies the same rules by
   its own means: the rules stay worded as concepts.

   - [[Creation failure in the signature]]: a [[Factory]] returns an effect whose failure type is the invalid input.
   - [[Compile-time optionality]]: the option type of Effect.
   - [[No default on failure]] and [[No degraded continuation]]: the failure side reaches the [[Perimeter]] unchanged.
   - [[Exhaustive matching]] and [[Branching belongs at the perimeter]]: the fold takes a handler for each side.

   Effect does not hold [[No silent catch]]; a [[Lint rule]] holds it.

4. **Effect does not parse.** Zod is the only parser, and the schema module of Effect is not used.
