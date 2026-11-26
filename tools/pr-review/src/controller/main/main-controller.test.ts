import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Assignment } from "../../domain/assignment.ts";
import { Change } from "../../domain/change.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import type { Poster } from "../../domain/posting.ts";
import {
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
} from "../../domain/sample.test-support.ts";
import type { Probes } from "../../domain/task.ts";
import { HostError } from "../../generated/domain/host-error.g.ts";
import { NoReview } from "../../generated/domain/no-review.g.ts";
import { NotStarted } from "../../generated/domain/not-started.g.ts";
import type { Rule } from "../../generated/domain/rule.g.ts";
import type { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { UnknownFormat } from "../../generated/domain/unknown-format.g.ts";
import { Workdir } from "../../generated/domain/workdir.g.ts";
import { emptyStore } from "../common/stand-in.test-support.ts";
import { MainController } from "./main-controller.ts";

type Outcome = Parameters<Poster["post"]>[1];

const url: TargetUrl = urlSample();
const workdir: Workdir = Workdir.codec.decode("/work");
const purpose: Rule = ruleSample("Stated purpose");
const probes: Probes = [taskSample(probeSample("probe-1"), [purpose])];

const host: Host = {
	getChange: (to: TargetUrl): Effect.Effect<Change, NotReviewable> =>
		Effect.succeed(Change.of(to, [])),
	post: (): Effect.Effect<Outcome, HostError> =>
		Effect.fail(HostError.create()),
};

const agent: Agent = {
	spawn: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
	terminate: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
};

it("prepare answers the rules the review has to judge", () => {
	const controller: MainController = MainController.over(
		host,
		emptyStore(),
		agent,
	);
	const prepared = controller.prepare(url, workdir, probes);

	assert.deepEqual(Effect.runSync(prepared).remaining, [purpose]);
});

it("prepare spawns a sub agent for each probe", () => {
	const spawned: Assignment[] = [];
	const recording: Agent = {
		...agent,
		spawn: (assignment: Assignment): Effect.Effect<Assignment> =>
			Effect.sync((): Assignment => {
				spawned.push(assignment);

				return assignment;
			}),
	};

	Effect.runSync(
		MainController.over(host, emptyStore(), recording).prepare(
			url,
			workdir,
			probes,
		),
	);

	assert.equal(spawned.length, 1);
});

it("prepare fails with what the host answers", () => {
	const unknownFormat: UnknownFormat = UnknownFormat.create();
	const refusing: Host = {
		...host,
		getChange: (): Effect.Effect<Change, NotReviewable> =>
			Effect.fail(unknownFormat),
	};
	const prepared = MainController.over(refusing, emptyStore(), agent).prepare(
		url,
		workdir,
		probes,
	);

	assert.equal(Effect.runSync(Effect.flip(prepared)), unknownFormat);
});

it("prepare fails when a sub agent is not started", () => {
	const notStarted: NotStarted = NotStarted.create();
	const stalling: Agent = {
		...agent,
		spawn: (): Effect.Effect<Assignment, NotStarted> => Effect.fail(notStarted),
	};
	const prepared = MainController.over(host, emptyStore(), stalling).prepare(
		url,
		workdir,
		probes,
	);

	assert.equal(Effect.runSync(Effect.flip(prepared)), notStarted);
});

it("status answers how the prepared review stands", () => {
	const controller: MainController = MainController.over(
		host,
		emptyStore(),
		agent,
	);
	const answered = controller
		.prepare(url, workdir, probes)
		.pipe(Effect.flatMap(() => controller.status(workdir)));

	assert.deepEqual(Effect.runSync(answered).remaining, [purpose]);
});

it("status fails when the workdir holds no review", () => {
	const answered = MainController.over(host, emptyStore(), agent).status(
		workdir,
	);

	assert.equal(Effect.runSync(Effect.flip(answered)) instanceof NoReview, true);
});
