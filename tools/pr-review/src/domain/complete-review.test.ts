import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { HostError } from "../generated/domain/host-error.g.ts";
import { Outcome } from "../generated/domain/outcome.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import type { Agent } from "./agent.ts";
import type { Assignment } from "./assignment.ts";
import { Assignments } from "./assignments.ts";
import type { Change } from "./change.ts";
import { CompleteReview } from "./complete-review.ts";
import type { Host, NotReviewable } from "./host.ts";

const url: TargetUrl = TargetUrl.codec.decode("https://host.test/change");
const outcome: Outcome = Outcome.codec.decode({});
const status: ReviewStatus = ReviewStatus.codec.decode({});
const review: CompleteReview = CompleteReview.of({
	url,
	outcome,
	state: status,
	assignments: Assignments.of([]),
});
const posted: [TargetUrl, Outcome][] = [];

const host: Host = {
	getChange: (): Effect.Effect<Change, NotReviewable> =>
		Effect.fail(HostError.create()),
	post: (to: TargetUrl, what: Outcome): Effect.Effect<Outcome, HostError> =>
		Effect.sync((): Outcome => {
			posted.push([to, what]);

			return what;
		}),
};

const agent: Agent = {
	spawn: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(given),
	terminate: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(given),
};

it("a complete review answers the status it holds", () => {
	assert.equal(review.status(), status);
});

it("a complete review posts its outcome to its target URL", () => {
	Effect.runSync(review.submittedTo(host));

	assert.deepEqual(posted, [[url, outcome]]);
});

it("a posted complete review answers itself", () => {
	assert.equal(Effect.runSync(review.submittedTo(host)), review);
});

it("a complete review fails with the error of the host", () => {
	const hostError: HostError = HostError.create();
	const refusing: Host = {
		...host,
		post: (): Effect.Effect<Outcome, HostError> => Effect.fail(hostError),
	};

	assert.equal(
		Effect.runSync(Effect.flip(review.submittedTo(refusing))),
		hostError,
	);
});

it("a complete review dismissed by an agent answers itself", () => {
	assert.equal(Effect.runSync(review.dismissedBy(agent)), review);
});
