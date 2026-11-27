import assert from "node:assert/strict";
import { test as it } from "node:test";
import { AlreadyReviewed } from "../domain/already-reviewed.ts";
import { HostError } from "../domain/host-error.ts";
import { NoPage } from "../domain/no-page.ts";
import { NoReview } from "../domain/no-review.ts";
import { NotAcknowledged } from "../domain/not-acknowledged.ts";
import { NotAssigned } from "../domain/not-assigned.ts";
import { NotDefined } from "../domain/not-defined.ts";
import { NotStarted } from "../domain/not-started.ts";
import { NotValid } from "../domain/not-valid.ts";
import { Posted } from "../domain/posted.ts";
import { Refused } from "../domain/refused.ts";
import {
	instructionsSample,
	ruleSample,
} from "../domain/sample.test-support.ts";
import { TooLarge } from "../domain/too-large.ts";
import { UnknownFormat } from "../domain/unknown-format.ts";
import { WorkdirFailed } from "../domain/workdir-failed.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { Page } from "../generated/domain/page.g.ts";
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

const fourEmptyParts = {
	workflow: {},
	context: {},
	usage: {},
	request: "a request",
};

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
	assert.equal(
		definitionAnswer(Definition.codec.decode("a definition")),
		"a definition",
	);
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
			failureAnswer(WorkdirFailed.create()),
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
			{ failure: "workdir-failed" },
		],
	);
});
