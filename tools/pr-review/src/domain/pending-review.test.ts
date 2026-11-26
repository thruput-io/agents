import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { NotStarted } from "../generated/domain/not-started.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import type { Agent } from "./agent.ts";
import type { Assignment } from "./assignment.ts";
import { PendingReview } from "./pending-review.ts";

const agent: Agent = {
	spawn: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
	terminate: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
};

it("a pending review states its status", () => {
	assert.equal(PendingReview.create().status() instanceof ReviewStatus, true);
});

it("a pending review spawned by an agent stays pending", () => {
	const spawned = Effect.runSync(PendingReview.create().spawnedBy(agent));

	assert.equal(spawned instanceof PendingReview, true);
});

it("a pending review fails when the agent starts no sub agent", () => {
	const notStarted = NotStarted.create();
	const stalling: Agent = { ...agent, spawn: () => Effect.fail(notStarted) };
	const spawned = PendingReview.create().spawnedBy(stalling);

	assert.equal(Effect.runSync(Effect.flip(spawned)), notStarted);
});

it("a pending review is submitted to no host", () => {
	const submitted = Effect.runSync(PendingReview.create().submittedTo());

	assert.equal(submitted instanceof PendingReview, true);
});

it("a pending review dismisses no sub agent", () => {
	const dismissed = Effect.runSync(PendingReview.create().dismissedBy());

	assert.equal(dismissed instanceof PendingReview, true);
});

it("a pending review serializes as its kind", () => {
	assert.deepEqual(PendingReview.create().toJSON(), { kind: "pending-review" });
});
