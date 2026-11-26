import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Assignment } from "../../domain/assignment.ts";
import { Assignments } from "../../domain/assignments.ts";
import { Change } from "../../domain/change.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import { PendingReview } from "../../domain/pending-review.ts";
import type { Review, ReviewStore } from "../../domain/review.ts";
import { HostError } from "../../generated/domain/host-error.g.ts";
import { NoReview } from "../../generated/domain/no-review.g.ts";
import type { Outcome } from "../../generated/domain/outcome.g.ts";
import { Probes } from "../../generated/domain/probes.g.ts";
import { ReviewStatus } from "../../generated/domain/review-status.g.ts";
import { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { UnknownFormat } from "../../generated/domain/unknown-format.g.ts";
import { Workdir } from "../../generated/domain/workdir.g.ts";
import { MainController } from "./main-controller.ts";

const url: TargetUrl = TargetUrl.codec.decode("https://host.test/change");
const workdir: Workdir = Workdir.codec.decode("/work");
const status: ReviewStatus = ReviewStatus.codec.decode({});
const pending: PendingReview = PendingReview.of(status, Assignments.of([]));
const saved: Review[] = [];

const host: Host = {
	getChange: (): Effect.Effect<Change, NotReviewable> =>
		Effect.succeed(Change.of(pending)),
	post: (): Effect.Effect<Outcome, HostError> =>
		Effect.fail(HostError.create()),
};

const store: ReviewStore = {
	save: (_workdir: Workdir, review: Review): Effect.Effect<Review> =>
		Effect.sync((): Review => {
			saved.push(review);

			return review;
		}),
	inWorkdir: (): Effect.Effect<Review, NoReview> => Effect.succeed(pending),
	ofProbe: (): Effect.Effect<Assignment, NoReview> =>
		Effect.fail(NoReview.create()),
	append: (): Effect.Effect<Review, NoReview> => Effect.fail(NoReview.create()),
};

const agent: Agent = {
	spawn: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(given),
	terminate: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(given),
};

it("prepare answers the status of the review of the change", () => {
	const controller: MainController = MainController.over(host, store, agent);
	const prepared = controller.prepare(url, workdir, Probes.codec.decode({}));

	assert.equal(Effect.runSync(prepared), status);
});

it("prepare saves the review of the change", () => {
	const controller: MainController = MainController.over(host, store, agent);

	Effect.runSync(controller.prepare(url, workdir, Probes.codec.decode({})));

	assert.equal(saved.includes(pending), true);
});

it("prepare fails with what the host answers", () => {
	const unknownFormat: UnknownFormat = UnknownFormat.create();
	const refusing: Host = {
		...host,
		getChange: (): Effect.Effect<Change, NotReviewable> =>
			Effect.fail(unknownFormat),
	};
	const controller: MainController = MainController.over(
		refusing,
		store,
		agent,
	);
	const prepared = controller.prepare(url, workdir, Probes.codec.decode({}));

	assert.equal(Effect.runSync(Effect.flip(prepared)), unknownFormat);
});

it("status answers the status of the stored review", () => {
	const controller: MainController = MainController.over(host, store, agent);

	assert.equal(Effect.runSync(controller.status(workdir)), status);
});

it("status fails when the workdir holds no review", () => {
	const noReview: NoReview = NoReview.create();
	const empty: ReviewStore = {
		...store,
		inWorkdir: (): Effect.Effect<Review, NoReview> => Effect.fail(noReview),
	};
	const controller: MainController = MainController.over(host, empty, agent);

	assert.equal(
		Effect.runSync(Effect.flip(controller.status(workdir))),
		noReview,
	);
});
