import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import type { Agent } from "./agent.ts";
import type { Assignment } from "./assignment.ts";
import { Assignments } from "./assignments.ts";
import { PendingReview } from "./pending-review.ts";

const status: ReviewStatus = ReviewStatus.codec.decode({});
const review: PendingReview = PendingReview.of(status, Assignments.of([]));

const agent: Agent = {
	spawn: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(given),
	terminate: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(given),
};

it("a pending review answers the status it holds", () => {
	assert.equal(review.status(), status);
});

it("a pending review spawned by an agent answers itself", () => {
	assert.equal(Effect.runSync(review.spawnedBy(agent)), review);
});

it("a pending review is submitted to no host and answers itself", () => {
	assert.equal(Effect.runSync(review.submittedTo()), review);
});

it("a pending review dismisses no sub agent and answers itself", () => {
	assert.equal(Effect.runSync(review.dismissedBy()), review);
});
