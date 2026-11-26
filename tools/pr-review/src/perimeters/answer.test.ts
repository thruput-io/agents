import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	instructionsSample,
	ruleSample,
} from "../domain/sample.test-support.ts";
import { AlreadyReviewed } from "../generated/domain/already-reviewed.g.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { NoPage } from "../generated/domain/no-page.g.ts";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { NotAcknowledged } from "../generated/domain/not-acknowledged.g.ts";
import { NotAssigned } from "../generated/domain/not-assigned.g.ts";
import { NotDefined } from "../generated/domain/not-defined.g.ts";
import { NotStarted } from "../generated/domain/not-started.g.ts";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Page } from "../generated/domain/page.g.ts";
import { Posted } from "../generated/domain/posted.g.ts";
import { Refused } from "../generated/domain/refused.g.ts";
import { TooLarge } from "../generated/domain/too-large.g.ts";
import { UnknownFormat } from "../generated/domain/unknown-format.g.ts";
import {
	definitionAnswer,
	failureAnswer,
	instructionsAnswer,
	notReadyAnswer,
	pageAnswer,
	rulesAnswer,
	standingAnswer,
	statusAnswer,
} from "./answer.ts";

const fourEmptyParts = { workflow: {}, context: {}, usage: {}, request: {} };

it("rules are answered by their ids", () => {
	assert.deepEqual(rulesAnswer([ruleSample("Stated purpose")]), {
		rules: ["Stated purpose"],
	});
});

it("a standing is answered by the ids of the rules left", () => {
	assert.deepEqual(standingAnswer([ruleSample("Delete unused")]), {
		remaining: ["Delete unused"],
	});
});

it("a status says what is left and that nothing was posted", () => {
	const answer = statusAnswer({ remaining: [ruleSample("A rule")], posts: [] });

	assert.deepEqual(answer, {
		remaining: ["A rule"],
		posted: false,
		postFailed: false,
	});
});

it("a status says that the review was posted", () => {
	const answer = statusAnswer({ remaining: [], posts: [Posted.create()] });

	assert.deepEqual(answer, { remaining: [], posted: true, postFailed: false });
});

it("a status says that posting failed", () => {
	const answer = statusAnswer({ remaining: [], posts: [HostError.create()] });

	assert.deepEqual(answer, { remaining: [], posted: false, postFailed: true });
});

it("a definition is answered as an object without properties", () => {
	assert.deepEqual(definitionAnswer(Definition.codec.decode({})), {});
});

it("a page is answered as its text", () => {
	assert.equal(pageAnswer(Page.codec.decode("a page")), "a page");
});

it("instructions are answered by their four parts", () => {
	assert.deepEqual(instructionsAnswer(instructionsSample()), fourEmptyParts);
});

it("a sub agent that is not ready is answered the instructions", () => {
	assert.deepEqual(notReadyAnswer(instructionsSample()), fourEmptyParts);
});

it("a sub agent refused for another reason is answered that reason", () => {
	assert.deepEqual(notReadyAnswer(NoReview.create()), { failure: "no-review" });
});

it("every failure is answered by its name", () => {
	assert.deepEqual(
		[
			failureAnswer(NotValid.create()),
			failureAnswer(UnknownFormat.create()),
			failureAnswer(AlreadyReviewed.create()),
			failureAnswer(TooLarge.create()),
			failureAnswer(Refused.create()),
			failureAnswer(HostError.create()),
			failureAnswer(NotStarted.create()),
			failureAnswer(NoReview.create()),
			failureAnswer(NotDefined.create()),
			failureAnswer(NotAssigned.create()),
			failureAnswer(NoPage.create()),
			failureAnswer(NotAcknowledged.create()),
		],
		[
			{ failure: "not-valid" },
			{ failure: "unknown-format" },
			{ failure: "already-reviewed" },
			{ failure: "too-large" },
			{ failure: "refused" },
			{ failure: "host-error" },
			{ failure: "not-started" },
			{ failure: "no-review" },
			{ failure: "not-defined" },
			{ failure: "not-assigned" },
			{ failure: "no-page" },
			{ failure: "not-acknowledged" },
		],
	);
});
