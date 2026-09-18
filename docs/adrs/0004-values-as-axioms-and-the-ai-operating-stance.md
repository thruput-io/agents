# ADR 0004: Values as Axioms and the AI Operating Stance

## Date

2026-09-18

## Context

Two bodies of guidance sat outside the governance documents while plainly belonging inside them.

**Company values were published but not governed.** The Core Values, Engineering Manifesto, and Daily Commitment on <https://thruput.se/how-we-work.html> are what we sell on and hire on, but they existed only as marketing copy. Nothing let a reviewer or an agent cite them, and nothing kept them consistent with the engineering guidance they are supposed to explain.

**Nothing recorded how we understand AI.** Agents are already the primary consumers of this repository, yet no tier stated what an agent is to us. Without that, recurring decisions — invest in model capability or in operator competence, adopt vendor tooling or write our own — get settled implicitly and differently each time.

[ADR 0003](./0003-axioms-above-principles.md) also left two principles, `quality-uncompromised` and `code-only-for-user-value`, interpreting the `orphans` axiom, recorded there as a known gap awaiting the statement of their ground.

## Decision

### Values are axioms, not principles

The four Core Values enter `axioms.yaml` as `speed-through-discipline`, `excellence-through-transparency`, `outcome-over-output`, and `joy-through-craft`.

They are placed in the Axioms tier rather than Principles because they match what [ADR 0003](./0003-axioms-above-principles.md) defines an axiom to be: accepted without argument, short, stable, and not derived from anything else in this repository. A principle is reasoned *from* something; these are what the reasoning starts at. Placing them in Principles would have required inventing a ground for each one.

This closes the gap ADR 0003 recorded. `quality-uncompromised` now interprets `speed-through-discipline` — quality is not traded away for speed precisely because discipline is what produces speed. `code-only-for-user-value` now interprets `outcome-over-output` — purpose is measured in user benefit because the job is to solve a problem, not to satisfy a requirements list. No principle interprets `orphans` any longer.

`joy-through-craft` grounds no principle today. It is stated because it is true and because a later principle may rest on it, not to satisfy a reference.

### The Engineering Manifesto becomes principles

`reproducible-by-construction` (environment parity, one-command setup, automation over manual) interprets `single-source-of-truth`: the environment is described once, as code. `own-the-runtime` (telemetry over guesswork) interprets `shift-left`, applied past the point of release. `surface-what-you-do-not-know` interprets `excellence-through-transparency`.

The manifesto's Test-First mandate deliberately gets no principle of its own. `nothing-is-complete-without-verification` already carries it; duplicating it would violate `single-source-of-truth` in the document that states it. Its one genuinely absent clause — a green, robust pipeline, and flaky tests as critical bugs rather than noise — is added to that principle's body instead.

Manifesto items phrased as mandates on the site ("must be automated", "No Code Without Coverage") are restated as reasoning. RFC 2119 markers belong to Rules; a principle that carries one is in the wrong tier.

### An axiom for leverage, and four principles under it

`leverage` enters `axioms.yaml`: a tool multiplies the competence applied to it and supplies no judgement of its own. It is stated in terms of tools rather than AI because it is not new and not specific to AI — automation and pipelines have always behaved this way — and an axiom phrased around today's technology would not be stable.

Four principles interpret it, or `single-source-of-truth` where that is the closer ground:

- **`ai-amplifies-the-operator`** — AI is *hävstång* applied to its operator. An incompetent operator produces an accelerated mess, and the mess arrives reviewed, formatted, and entirely plausible; an operator working from these principles produces the same quality faster. Investment therefore goes to operator competence and to stating our rules explicitly, not to the expectation that a better model compensates for the absence of both.
- **`the-capability-gap-is-closing`** — guidance justified by "AI cannot do this yet" carries an expiry date and is not written down as permanent.
- **`adoption-is-articulation`** — adopting AI is mostly refining and defining what we already know; the rules an agent needs are the rules a new colleague needs. It interprets `single-source-of-truth`, because the work is stating tacit habit exactly once in checkable form.
- **`our-own-tools-and-methods`** — vendor defaults encode a vendor's standards, so the layer carrying ours is ours to own. Scoped explicitly against `the-simplicity-ladder`, which still governs what we consume.

## Consequences

### Positive
- A value is citable by id in a review, exactly like a quality axis, and `axiom-key` makes a citation of one that does not exist fail validation.
- The published values and the engineering guidance cannot drift, because there is one source for both.
- Every principle now has a stated ground; the `orphans` axiom holds nothing.
- Investment decisions around AI argue from a stated default instead of being re-litigated per case.

### Negative
- The Axioms tier grows from three substantive entries to eight, which is a large move for a tier whose stated virtue is being few. The four values are judged stable enough to earn it; a fifth value would deserve more scrutiny than this ADR gave these.
- `axioms.yaml` now serves two audiences, engineers and anyone reading the public site, so site copy has to be re-synced when it changes.
- `the-capability-gap-is-closing` is, by its own argument, the most perishable entry in the repository and will need revisiting sooner than the rest.
- One rule, `filling-gaps`, still guards the `orphans` principle. It was checked against the new principles and belongs under none of them: it is a meta-rule about consulting the principles document, not a rule any single principle motivates.
