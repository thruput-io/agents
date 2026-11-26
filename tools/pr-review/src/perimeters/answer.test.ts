import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Instructions } from "../domain/instructions.ts";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { AlreadyReviewed } from "../generated/domain/already-reviewed.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { NotStarted } from "../generated/domain/not-started.g.ts";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Progress } from "../generated/domain/progress.g.ts";
import { Refused } from "../generated/domain/refused.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import { Ruleset } from "../generated/domain/ruleset.g.ts";
import { Surface } from "../generated/domain/surface.g.ts";
import { TooLarge } from "../generated/domain/too-large.g.ts";
import { UnknownFormat } from "../generated/domain/unknown-format.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";
import {
	definitionAnswer,
	failureAnswer,
	instructionsAnswer,
	notAcceptedAnswer,
	progressAnswer,
	rulesAnswer,
	statusAnswer,
	surfaceAnswer,
} from "./answer.ts";

const instructions: Instructions = Instructions.of({
	workflow: Workflow.codec.decode({}),
	context: Context.codec.decode({}),
	usage: Usage.codec.decode({}),
	request: AcknowledgementRequest.codec.decode({}),
});
const fourEmptyParts = { workflow: {}, context: {}, usage: {}, request: {} };

it("a review status is answered as an object without properties", () => {
	assert.deepEqual(statusAnswer(ReviewStatus.codec.decode({})), {});
});

it("a not valid is answered by its name", () => {
	assert.deepEqual(failureAnswer(NotValid.create()), { failure: "not-valid" });
});

it("an unknown format is answered by its name", () => {
	assert.deepEqual(failureAnswer(UnknownFormat.create()), {
		failure: "unknown-format",
	});
});

it("an already reviewed is answered by its name", () => {
	assert.deepEqual(failureAnswer(AlreadyReviewed.create()), {
		failure: "already-reviewed",
	});
});

it("a too large is answered by its name", () => {
	assert.deepEqual(failureAnswer(TooLarge.create()), { failure: "too-large" });
});

it("a refused is answered by its name", () => {
	assert.deepEqual(failureAnswer(Refused.create()), { failure: "refused" });
});

it("a host error is answered by its name", () => {
	assert.deepEqual(failureAnswer(HostError.create()), {
		failure: "host-error",
	});
});

it("a not started is answered by its name", () => {
	assert.deepEqual(failureAnswer(NotStarted.create()), {
		failure: "not-started",
	});
});

it("a no review is answered by its name", () => {
	assert.deepEqual(failureAnswer(NoReview.create()), { failure: "no-review" });
});

it("a progress is answered as an object without properties", () => {
	assert.deepEqual(progressAnswer(Progress.codec.decode({})), {});
});

it("a ruleset is answered as an object without properties", () => {
	assert.deepEqual(rulesAnswer(Ruleset.codec.decode({})), {});
});

it("a definition is answered as an object without properties", () => {
	assert.deepEqual(definitionAnswer(Definition.codec.decode({})), {});
});

it("a surface is answered as an object without properties", () => {
	assert.deepEqual(surfaceAnswer(Surface.codec.decode({})), {});
});

it("instructions are answered by their four parts", () => {
	assert.deepEqual(instructionsAnswer(instructions), fourEmptyParts);
});

it("an acknowledgement that is not accepted is answered with the instructions", () => {
	assert.deepEqual(notAcceptedAnswer(instructions), fourEmptyParts);
});

it("an acknowledgement refused for another reason is answered by that reason", () => {
	assert.deepEqual(notAcceptedAnswer(NoReview.create()), {
		failure: "no-review",
	});
});
