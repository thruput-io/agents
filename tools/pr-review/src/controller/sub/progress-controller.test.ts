import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	acknowledgementFrom,
	hostErrorFrom,
	outcomeFrom,
	probeFrom,
	progressFrom,
	verdictFrom,
} from "../../domain/factory.ts";
import {
	assignmentFrom,
	changeFrom,
	completeReviewFrom,
} from "../../domain/minted-review.ts";
import type {
	Agent,
	Assignment,
	Entry,
	Host,
	ReviewStore,
} from "../../domain/review.ts";
import { ProgressController } from "./progress-controller.ts";

const progress = progressFrom();
const assignment: Assignment = {
	...assignmentFrom(),
	progress: () => progress,
};
const appended: Entry[] = [];

const host: Host = {
	getChange: () => Effect.succeed(changeFrom()),
	post: () => Effect.succeed(outcomeFrom()),
};

const store: ReviewStore = {
	save: () => Effect.succeed(completeReviewFrom()),
	inWorkdir: () => Effect.succeed(completeReviewFrom()),
	ofProbe: () => Effect.succeed(assignment),
	append: (_probe, entry) =>
		Effect.sync(() => {
			appended.push(entry);

			return completeReviewFrom();
		}),
};

const agent: Agent = {
	spawn: (spawned) => Effect.succeed(spawned),
	terminate: (terminated) => Effect.succeed(terminated),
};

it("ack answers the progress of the assignment", () => {
	const controller = ProgressController.over(host, store, agent);
	const answered = controller.ack(probeFrom(), acknowledgementFrom());

	assert.equal(Effect.runSync(answered), progress);
});

it("ack answers more detailed instructions when it is not accepted", () => {
	const detailed = assignmentFrom().briefing().instructions();
	const strict: ReviewStore = {
		...store,
		ofProbe: () =>
			Effect.succeed({ ...assignment, accepted: () => Effect.fail(detailed) }),
	};
	const controller = ProgressController.over(host, strict, agent);
	const answered = controller.ack(probeFrom(), acknowledgementFrom());

	assert.equal(Effect.runSync(Effect.flip(answered)), detailed);
});

it("report answers the progress of the assignment", () => {
	const controller = ProgressController.over(host, store, agent);
	const answered = controller.report(probeFrom(), verdictFrom());

	assert.equal(Effect.runSync(answered), progress);
});

it("report appends the verdict", () => {
	const verdict = verdictFrom();
	const controller = ProgressController.over(host, store, agent);

	Effect.runSync(controller.report(probeFrom(), verdict));

	assert.equal(appended.includes(verdict), true);
});

it("report appends the error of the host and still answers the progress", () => {
	const hostError = hostErrorFrom();
	const refusing: Host = { ...host, post: () => Effect.fail(hostError) };
	const controller = ProgressController.over(refusing, store, agent);
	const answered = Effect.runSync(
		controller.report(probeFrom(), verdictFrom()),
	);

	assert.deepEqual([answered, appended.includes(hostError)], [progress, true]);
});
