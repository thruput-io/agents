import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Assignment } from "../../domain/assignment.ts";
import { Change } from "../../domain/change.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import { HostError } from "../../domain/host-error.ts";
import { NoReview } from "../../domain/no-review.ts";
import { NotStarted } from "../../domain/not-started.ts";
import type { Poster } from "../../domain/posting.ts";
import type { Rule } from "../../domain/rule.ts";
import {
	probeSample,
	ruleSample,
	sessionSample,
	taskSample,
	urlSample,
	workdirSample,
} from "../../domain/sample.test-support.ts";
import type { Session } from "../../domain/session.ts";
import type { TargetUrl } from "../../domain/target-url.ts";
import type { Probes } from "../../domain/task.ts";
import { UnknownFormat } from "../../domain/unknown-format.ts";
import type { Workdir } from "../../domain/workdir.ts";
import { emptyStore } from "../common/stand-in.test-support.ts";
import { MainController } from "./main-controller.ts";

type Outcome = Parameters<Poster["post"]>[1];

const url: TargetUrl = urlSample();
const workdir: Workdir = workdirSample();
const probesFor = (): Probes => probes;
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
	const prepared = controller
		.prepare(url, workdir, probesFor)
		.pipe(Effect.flatMap((session: Session) => controller.status(session)));

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
			probesFor,
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
		probesFor,
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
		probesFor,
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
		.prepare(url, workdir, probesFor)
		.pipe(Effect.flatMap((session: Session) => controller.status(session)));

	assert.deepEqual(Effect.runSync(answered).remaining, [purpose]);
});

it("status fails when the workdir holds no review", () => {
	const answered = MainController.over(host, emptyStore(), agent).status(
		sessionSample(),
	);

	assert.equal(Effect.runSync(Effect.flip(answered)) instanceof NoReview, true);
});
