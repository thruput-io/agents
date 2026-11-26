import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import { Assignment } from "../../domain/assignment.ts";
import { Change } from "../../domain/change.ts";
import { CompleteReview } from "../../domain/complete-review.ts";
import type { Host } from "../../domain/host.ts";
import type { Entry, Review, ReviewStore } from "../../domain/review.ts";
import { Acknowledgement } from "../../generated/domain/acknowledgement.g.ts";
import { HostError } from "../../generated/domain/host-error.g.ts";
import { Outcome } from "../../generated/domain/outcome.g.ts";
import { Probe } from "../../generated/domain/probe.g.ts";
import { Progress } from "../../generated/domain/progress.g.ts";
import { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { Verdict } from "../../generated/domain/verdict.g.ts";
import type { Workdir } from "../../generated/domain/workdir.g.ts";
import { ProgressController } from "./progress-controller.ts";

const url = Effect.runSync(TargetUrl.from("https://host.test/change"));
const appended: Entry[] = [];

const host: Host = {
	getChange: () => Effect.succeed(Change.create()),
	post: () => Effect.succeed(Outcome.create()),
};

const store: ReviewStore = {
	save: (_workdir: Workdir, review: Review): Effect.Effect<Review> =>
		Effect.succeed(review),
	inWorkdir: () => Effect.succeed(CompleteReview.of(url)),
	ofProbe: () => Effect.succeed(Assignment.create()),
	append: (_probe: Probe, entry: Entry): Effect.Effect<Review> =>
		Effect.sync(() => {
			appended.push(entry);

			return CompleteReview.of(url);
		}),
};

const agent: Agent = {
	spawn: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
	terminate: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
};

it("ack answers the progress of the assignment", () => {
	const controller = ProgressController.over(host, store, agent);
	const answered = controller.ack(Probe.create(), Acknowledgement.create());

	assert.equal(Effect.runSync(answered) instanceof Progress, true);
});

it("ack appends the acknowledgement", () => {
	const acknowledgement = Acknowledgement.create();
	const controller = ProgressController.over(host, store, agent);

	Effect.runSync(controller.ack(Probe.create(), acknowledgement));

	assert.equal(appended.includes(acknowledgement), true);
});

it("report answers the progress of the assignment", () => {
	const controller = ProgressController.over(host, store, agent);
	const answered = controller.report(Probe.create(), Verdict.create());

	assert.equal(Effect.runSync(answered) instanceof Progress, true);
});

it("report appends the verdict", () => {
	const verdict = Verdict.create();
	const controller = ProgressController.over(host, store, agent);

	Effect.runSync(controller.report(Probe.create(), verdict));

	assert.equal(appended.includes(verdict), true);
});

it("report appends the error of the host and still answers the progress", () => {
	const hostError = HostError.create();
	const refusing: Host = { ...host, post: () => Effect.fail(hostError) };
	const controller = ProgressController.over(refusing, store, agent);
	const answered = Effect.runSync(
		controller.report(Probe.create(), Verdict.create()),
	);

	assert.deepEqual(
		[answered instanceof Progress, appended.includes(hostError)],
		[true, true],
	);
});
