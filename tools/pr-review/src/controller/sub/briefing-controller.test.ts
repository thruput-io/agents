import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { NoReview } from "../../domain/no-review.ts";
import { NotAcknowledged } from "../../domain/not-acknowledged.ts";
import { NotDefined } from "../../domain/not-defined.ts";
import type { ReviewStore } from "../../domain/review-store.ts";
import { Term } from "../../domain/term.ts";
import {
	emptyStore,
	probe,
	purpose,
	sent,
	storeWithReview,
	unused,
} from "../common/stand-in.test-support.ts";
import { BriefingController } from "./briefing-controller.ts";

it("instructions answers the four parts a probe is briefed with", () => {
	const answered = BriefingController.over(storeWithReview())
		.instructions(probe)
		.pipe(Effect.map((instructions) => typeof instructions.workflow()));

	assert.equal(Effect.runSync(answered), "object");
});

it("instructions fails for a probe of no review", () => {
	const answered = BriefingController.over(emptyStore()).instructions(probe);

	assert.equal(Effect.runSync(Effect.flip(answered)) instanceof NoReview, true);
});

it("rules fails before the instructions are acknowledged", () => {
	const answered = BriefingController.over(storeWithReview()).rules(probe);

	assert.equal(
		Effect.runSync(Effect.flip(answered)) instanceof NotAcknowledged,
		true,
	);
});

it("rules answers the rules of the probe once acknowledged", () => {
	const store: ReviewStore = storeWithReview();
	const answered = store
		.append(probe, sent)
		.pipe(Effect.flatMap(() => BriefingController.over(store).rules(probe)));

	assert.deepEqual(Effect.runSync(answered), [purpose, unused]);
});

it("define answers the definition of a term the glossary holds", () => {
	const answered = BriefingController.over(storeWithReview())
		.define(probe, Term.codec.decode("ledger"))
		.pipe(Effect.map((definition) => typeof definition));

	assert.equal(Effect.runSync(answered), "object");
});

it("define fails for a term nothing declares", () => {
	const answered = BriefingController.over(storeWithReview()).define(
		probe,
		Term.codec.decode("Nothing"),
	);

	assert.equal(
		Effect.runSync(Effect.flip(answered)) instanceof NotDefined,
		true,
	);
});
