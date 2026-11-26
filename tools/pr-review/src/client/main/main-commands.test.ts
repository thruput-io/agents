import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { MainController } from "../../controller/main/main-controller.ts";
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
import { ReviewStatus } from "../../generated/domain/review-status.g.ts";
import type { Workdir } from "../../generated/domain/workdir.g.ts";
import { type Commands, run } from "../common/runner.ts";
import { mainCommands } from "./main-commands.ts";

const pending: PendingReview = PendingReview.of(
	ReviewStatus.create(),
	Assignments.of([]),
);

const host: Host = {
	getChange: (): Effect.Effect<Change, NotReviewable> =>
		Effect.succeed(Change.of(pending)),
	post: (): Effect.Effect<Outcome, HostError> =>
		Effect.fail(HostError.create()),
};

const store: ReviewStore = {
	save: (_workdir: Workdir, review: Review): Effect.Effect<Review> =>
		Effect.succeed(review),
	inWorkdir: (): Effect.Effect<Review, NoReview> =>
		Effect.fail(NoReview.create()),
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

const commands: Commands = mainCommands(
	MainController.over(host, store, agent),
);

it("prepare answers the review status", () => {
	const printed = Effect.runSync(
		run(commands, ["prepare", "https://host.test/change", "/work"]),
	);

	assert.deepEqual(printed, { line: "{}\n", exitCode: 0 });
});

it("prepare without a workdir is answered as not valid", () => {
	const printed = Effect.runSync(
		run(commands, ["prepare", "https://host.test/change"]),
	);

	assert.deepEqual(printed, {
		line: '{"failure":"not-valid"}\n',
		exitCode: 1,
	});
});

it("status of a workdir without a review is answered as no review", () => {
	const printed = Effect.runSync(run(commands, ["status", "/work"]));

	assert.deepEqual(printed, {
		line: '{"failure":"no-review"}\n',
		exitCode: 1,
	});
});
