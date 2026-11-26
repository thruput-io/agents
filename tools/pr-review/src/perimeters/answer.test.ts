import assert from "node:assert/strict";
import { test as it } from "node:test";
import { AlreadyReviewed } from "../generated/domain/already-reviewed.g.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { NotStarted } from "../generated/domain/not-started.g.ts";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Refused } from "../generated/domain/refused.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import { TooLarge } from "../generated/domain/too-large.g.ts";
import { UnknownFormat } from "../generated/domain/unknown-format.g.ts";
import { failureAnswer, statusAnswer } from "./answer.ts";

it("a review status is answered as an object without properties", () => {
	assert.deepEqual(statusAnswer(ReviewStatus.create()), {});
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
