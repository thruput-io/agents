import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Assignment } from "../../domain/assignment.ts";
import { Instructions } from "../../domain/instructions.ts";
import { PendingReview } from "../../domain/pending-review.ts";
import type { ReviewStore } from "../../domain/review.ts";
import { Definition } from "../../generated/domain/definition.g.ts";
import { NoReview } from "../../generated/domain/no-review.g.ts";
import { Probe } from "../../generated/domain/probe.g.ts";
import { Ruleset } from "../../generated/domain/ruleset.g.ts";
import { Term } from "../../generated/domain/term.g.ts";
import { BriefingController } from "./briefing-controller.ts";

const store: ReviewStore = {
	save: (_workdir, review) => Effect.succeed(review),
	inWorkdir: () => Effect.succeed(PendingReview.create()),
	ofProbe: () => Effect.succeed(Assignment.create()),
	append: () => Effect.succeed(PendingReview.create()),
};

it("instructions answers the instructions of the briefing", () => {
	const answered = BriefingController.over(store).instructions(Probe.create());

	assert.equal(Effect.runSync(answered) instanceof Instructions, true);
});

it("rules answers the ruleset of the briefing", () => {
	const answered = BriefingController.over(store).rules(Probe.create());

	assert.equal(Effect.runSync(answered) instanceof Ruleset, true);
});

it("define answers the definition of the term", () => {
	const answered = BriefingController.over(store).define(
		Probe.create(),
		Term.create(),
	);

	assert.equal(Effect.runSync(answered) instanceof Definition, true);
});

it("instructions fails for a probe that holds no review", () => {
	const noReview = NoReview.create();
	const empty: ReviewStore = { ...store, ofProbe: () => Effect.fail(noReview) };
	const answered = BriefingController.over(empty).instructions(Probe.create());

	assert.equal(Effect.runSync(Effect.flip(answered)), noReview);
});
