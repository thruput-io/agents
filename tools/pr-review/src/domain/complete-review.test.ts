import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { HostError } from "../generated/domain/host-error.g.ts";
import { Outcome } from "../generated/domain/outcome.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import type { Agent } from "./agent.ts";
import type { Assignment } from "./assignment.ts";
import { Change } from "./change.ts";
import { CompleteReview } from "./complete-review.ts";
import type { Host } from "./host.ts";

const url = Effect.runSync(TargetUrl.from("https://host.test/change"));

const host: Host = {
	getChange: () => Effect.succeed(Change.create()),
	post: () => Effect.succeed(Outcome.create()),
};

const agent: Agent = {
	spawn: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
	terminate: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
};

it("a complete review states its status", () => {
	assert.equal(CompleteReview.of(url).status() instanceof ReviewStatus, true);
});

it("a complete review is posted and stays complete", () => {
	const submitted = Effect.runSync(CompleteReview.of(url).submittedTo(host));

	assert.equal(submitted instanceof CompleteReview, true);
});

it("a complete review fails with the error of the host", () => {
	const hostError = HostError.create();
	const refusing: Host = { ...host, post: () => Effect.fail(hostError) };
	const submitted = CompleteReview.of(url).submittedTo(refusing);

	assert.equal(Effect.runSync(Effect.flip(submitted)), hostError);
});

it("a complete review dismissed by an agent stays complete", () => {
	const dismissed = Effect.runSync(CompleteReview.of(url).dismissedBy(agent));

	assert.equal(dismissed instanceof CompleteReview, true);
});
