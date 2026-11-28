import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Acknowledgement } from "../domain/acknowledgement.ts";
import type { Probe } from "../domain/probe.ts";
import type { Rule } from "../domain/rule.ts";
import type { TargetUrl } from "../domain/target-url.ts";
import type { Agent } from "./agent.ts";
import type { Assignment } from "./assignment.ts";
import { Change } from "./change.ts";
import { HostError } from "./host-error.ts";
import { NoReview } from "./no-review.ts";
import { NotStarted } from "./not-started.ts";
import { Posted } from "./posted.ts";
import type { Poster } from "./posting.ts";
import type { Review } from "./review.ts";
import {
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
} from "./sample.test-support.ts";
import { Verdict } from "./verdict.ts";

type Outcome = Parameters<Poster["post"]>[1];

const url: TargetUrl = urlSample();
const one: Probe = probeSample("probe-1");
const two: Probe = probeSample("probe-2");
const purpose: Rule = ruleSample("Stated purpose");
const unused: Rule = ruleSample("Delete unused");
const sent: Acknowledgement = Acknowledgement.of(
	"By sending this ack I acknowledge I read all instructions and implicitly I know how to use the review tool",
);
const started: Review = Change.of(url, []).review([
	taskSample(one, [purpose]),
	taskSample(two, [unused]),
]);
const judgedByOne: Review = started
	.after(one, sent)
	.after(one, Verdict.on(purpose));
const complete: Review = judgedByOne
	.after(two, sent)
	.after(two, Verdict.on(unused));

const accepting: Poster = {
	post: (_to: TargetUrl, outcome: Outcome): Effect.Effect<Outcome, HostError> =>
		Effect.succeed(outcome),
};

it("a probe of the review has an assignment", () => {
	const rules = started
		.assignmentOf(one)
		.pipe(
			Effect.map((assignment: Assignment) => assignment.ledger().remaining),
		);

	assert.deepEqual(Effect.runSync(rules), [purpose]);
});

it("a probe that is not of the review has none", () => {
	const missing = started.assignmentOf(probeSample("probe-9"));

	assert.equal(Effect.runSync(Effect.flip(missing)) instanceof NoReview, true);
});

it("the status holds the rules still to judge across all probes", () => {
	assert.deepEqual(started.status().remaining, [purpose, unused]);
});

it("what one probe records changes only that probe", () => {
	assert.deepEqual(judgedByOne.status().remaining, [unused]);
});

it("a review with rules still to judge posts nothing", () => {
	assert.deepEqual(Effect.runSync(judgedByOne.posting(accepting)), []);
});

it("a complete review posts every verdict to its target URL", () => {
	const received: [TargetUrl, number][] = [];
	const recording: Poster = {
		post: (
			to: TargetUrl,
			outcome: Outcome,
		): Effect.Effect<Outcome, HostError> =>
			Effect.sync((): Outcome => {
				received.push([to, outcome.verdicts.length]);

				return outcome;
			}),
	};

	Effect.runSync(complete.posting(recording));

	assert.deepEqual(received, [[url, 2]]);
});

it("a complete review that was posted is posted", () => {
	const posts = Effect.runSync(complete.posting(accepting));

	assert.deepEqual(
		posts.map((post): boolean => post instanceof Posted),
		[true],
	);
});

it("a review that is already posted posts nothing more", () => {
	const posted: Review = complete.after(one, Posted.create());

	assert.deepEqual(Effect.runSync(posted.posting(accepting)), []);
});

it("a failed post is answered as the error of the host", () => {
	const hostError: HostError = HostError.create();
	const refusing: Poster = {
		post: (): Effect.Effect<Outcome, HostError> => Effect.fail(hostError),
	};

	assert.deepEqual(Effect.runSync(complete.posting(refusing)), [hostError]);
});

it("a recorded post shows in the status", () => {
	const hostError: HostError = HostError.create();

	assert.deepEqual(complete.after(one, hostError).status().posts, [hostError]);
});

it("every assignment is spawned by the agent", () => {
	const spawned: Assignment[] = [];
	const agent: Agent = {
		spawn: (assignment: Assignment): Effect.Effect<Assignment> =>
			Effect.sync((): Assignment => {
				spawned.push(assignment);

				return assignment;
			}),
		terminate: (assignment: Assignment): Effect.Effect<Assignment> =>
			Effect.succeed(assignment),
	};

	Effect.runSync(started.spawnedBy(agent));

	assert.equal(spawned.length, 2);
});

it("a review fails to spawn when the agent starts no sub agent", () => {
	const notStarted: NotStarted = NotStarted.create();
	const stalling: Agent = {
		spawn: (): Effect.Effect<Assignment, NotStarted> => Effect.fail(notStarted),
		terminate: (assignment: Assignment): Effect.Effect<Assignment> =>
			Effect.succeed(assignment),
	};

	assert.equal(
		Effect.runSync(Effect.flip(started.spawnedBy(stalling))),
		notStarted,
	);
});

it("only the assignments with nothing left are terminated", () => {
	const terminated: Assignment[] = [];
	const agent: Agent = {
		spawn: (assignment: Assignment): Effect.Effect<Assignment> =>
			Effect.succeed(assignment),
		terminate: (assignment: Assignment): Effect.Effect<Assignment> =>
			Effect.sync((): Assignment => {
				terminated.push(assignment);

				return assignment;
			}),
	};

	Effect.runSync(judgedByOne.dismissedBy(agent));

	assert.equal(terminated.length, 1);
});
