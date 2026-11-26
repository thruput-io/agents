import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Assignment } from "../../domain/assignment.ts";
import type { Host } from "../../domain/host.ts";
import { Instructions } from "../../domain/instructions.ts";
import type { Poster } from "../../domain/posting.ts";
import type { ReviewStore } from "../../domain/review.ts";
import { ruleSample } from "../../domain/sample.test-support.ts";
import { Verdict } from "../../domain/verdict.ts";
import { HostError } from "../../generated/domain/host-error.g.ts";
import { NotAcknowledged } from "../../generated/domain/not-acknowledged.g.ts";
import { NotAssigned } from "../../generated/domain/not-assigned.g.ts";
import type { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { Workdir } from "../../generated/domain/workdir.g.ts";
import {
	agent,
	host,
	probe,
	purpose,
	sent,
	storeWithReview,
	unused,
} from "../common/stand-in.test-support.ts";
import { ProgressController } from "./progress-controller.ts";

type Outcome = Parameters<Poster["post"]>[1];

const workdir: Workdir = Workdir.codec.decode("/work");

it("standing before an acknowledgement is the detailed instructions", () => {
	const answered = ProgressController.over(
		host,
		storeWithReview(),
		agent,
	).standing(probe);

	assert.equal(
		Effect.runSync(Effect.flip(answered)) instanceof Instructions,
		true,
	);
});

it("ack answers every rule as left to judge", () => {
	const answered = ProgressController.over(host, storeWithReview(), agent).ack(
		probe,
		sent,
	);

	assert.deepEqual(Effect.runSync(answered), [purpose, unused]);
});

it("report fails before the instructions are acknowledged", () => {
	const answered = ProgressController.over(
		host,
		storeWithReview(),
		agent,
	).report(probe, Verdict.on(purpose));

	assert.equal(
		Effect.runSync(Effect.flip(answered)) instanceof NotAcknowledged,
		true,
	);
});

it("report on a rule of the probe answers the rules still left", () => {
	const progress: ProgressController = ProgressController.over(
		host,
		storeWithReview(),
		agent,
	);
	const answered = progress
		.ack(probe, sent)
		.pipe(Effect.flatMap(() => progress.report(probe, Verdict.on(purpose))));

	assert.deepEqual(Effect.runSync(answered), [unused]);
});

it("report on a rule that is not the probe's is refused", () => {
	const progress: ProgressController = ProgressController.over(
		host,
		storeWithReview(),
		agent,
	);
	const answered = progress
		.ack(probe, sent)
		.pipe(
			Effect.flatMap(() =>
				progress.report(probe, Verdict.on(ruleSample("Another rule"))),
			),
		);

	assert.equal(
		Effect.runSync(Effect.flip(answered)) instanceof NotAssigned,
		true,
	);
});

it("the last report posts the review once and records it", () => {
	const posted: Outcome[] = [];
	const recording: Host = {
		...host,
		post: (
			_to: TargetUrl,
			outcome: Outcome,
		): Effect.Effect<Outcome, HostError> =>
			Effect.sync((): Outcome => {
				posted.push(outcome);

				return outcome;
			}),
	};
	const store: ReviewStore = storeWithReview();
	const progress: ProgressController = ProgressController.over(
		recording,
		store,
		agent,
	);
	const finished = progress.ack(probe, sent).pipe(
		Effect.flatMap(() => progress.report(probe, Verdict.on(purpose))),
		Effect.flatMap(() => progress.report(probe, Verdict.on(unused))),
		Effect.flatMap(() => progress.report(probe, Verdict.on(unused))),
		Effect.flatMap(() => store.inWorkdir(workdir)),
		Effect.map((review) => review.status().posts.length),
	);

	assert.deepEqual([Effect.runSync(finished), posted.length], [1, 1]);
});

it("a failed post is recorded and the sub agent is still answered", () => {
	const refusing: Host = {
		...host,
		post: (): Effect.Effect<Outcome, HostError> =>
			Effect.fail(HostError.create()),
	};
	const store: ReviewStore = storeWithReview();
	const progress: ProgressController = ProgressController.over(
		refusing,
		store,
		agent,
	);
	const finished = progress.ack(probe, sent).pipe(
		Effect.flatMap(() => progress.report(probe, Verdict.on(purpose))),
		Effect.flatMap(() => progress.report(probe, Verdict.on(unused))),
		Effect.flatMap((remaining) =>
			Effect.map(store.inWorkdir(workdir), (review) => [
				remaining.length,
				review.status().posts.some((post) => post instanceof HostError),
			]),
		),
	);

	assert.deepEqual(Effect.runSync(finished), [0, true]);
});

it("the last report terminates the sub agent that has nothing left", () => {
	const terminated: Assignment[] = [];
	const recording: Agent = {
		...agent,
		terminate: (assignment: Assignment): Effect.Effect<Assignment> =>
			Effect.sync((): Assignment => {
				terminated.push(assignment);

				return assignment;
			}),
	};
	const progress: ProgressController = ProgressController.over(
		host,
		storeWithReview(),
		recording,
	);

	Effect.runSync(
		progress.ack(probe, sent).pipe(
			Effect.flatMap(() => progress.report(probe, Verdict.on(purpose))),
			Effect.flatMap(() => progress.report(probe, Verdict.on(unused))),
		),
	);

	assert.equal(terminated.length, 1);
});
