import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	definitionFrom,
	noReviewFrom,
	probeFrom,
	rulesetFrom,
	termFrom,
} from "../../domain/factory.ts";
import {
	assignmentFrom,
	pendingReviewFrom,
} from "../../domain/minted-review.ts";
import type { Assignment, Briefing, ReviewStore } from "../../domain/review.ts";
import { BriefingController } from "./briefing-controller.ts";

const instructions = assignmentFrom().briefing().instructions();
const ruleset = rulesetFrom();
const definition = definitionFrom();
const briefing: Briefing = {
	...assignmentFrom().briefing(),
	instructions: () => instructions,
	rules: () => ruleset,
	definitionOf: () => definition,
};
const assignment: Assignment = {
	...assignmentFrom(),
	briefing: () => briefing,
};

const store: ReviewStore = {
	save: () => Effect.succeed(pendingReviewFrom()),
	inWorkdir: () => Effect.succeed(pendingReviewFrom()),
	ofProbe: () => Effect.succeed(assignment),
	append: () => Effect.succeed(pendingReviewFrom()),
};

it("instructions answers the instructions of the briefing", () => {
	const answered = BriefingController.over(store).instructions(probeFrom());

	assert.equal(Effect.runSync(answered), instructions);
});

it("rules answers the ruleset of the briefing", () => {
	const answered = BriefingController.over(store).rules(probeFrom());

	assert.equal(Effect.runSync(answered), ruleset);
});

it("define answers the definition of the term", () => {
	const answered = BriefingController.over(store).define(
		probeFrom(),
		termFrom(),
	);

	assert.equal(Effect.runSync(answered), definition);
});

it("instructions fails for a probe that holds no review", () => {
	const noReview = noReviewFrom();
	const empty: ReviewStore = { ...store, ofProbe: () => Effect.fail(noReview) };
	const answered = BriefingController.over(empty).instructions(probeFrom());

	assert.equal(Effect.runSync(Effect.flip(answered)), noReview);
});
