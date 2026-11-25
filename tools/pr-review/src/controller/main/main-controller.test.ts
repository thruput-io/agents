import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	noReviewFrom,
	notStartedFrom,
	outcomeFrom,
	probesFrom,
	reviewStatusFrom,
	targetUrlFrom,
	unknownFormatFrom,
	workdirFrom,
} from "../../domain/factory.ts";
import { changeFrom, pendingReviewFrom } from "../../domain/minted-review.ts";
import type {
	Agent,
	Change,
	Host,
	PendingReview,
	ReviewStore,
} from "../../domain/review.ts";
import { MainController } from "./main-controller.ts";

const status = reviewStatusFrom();
const stored: PendingReview = { ...pendingReviewFrom(), status: () => status };
const reviewed: Change = {
	...changeFrom(),
	review: () => ({ ...stored, spawnedBy: () => Effect.succeed(stored) }),
};

const host: Host = {
	getChange: () => Effect.succeed(reviewed),
	post: () => Effect.succeed(outcomeFrom()),
};

const store: ReviewStore = {
	save: () => Effect.succeed(stored),
	inWorkdir: () => Effect.succeed(stored),
	ofProbe: () => Effect.fail(noReviewFrom()),
	append: () => Effect.succeed(stored),
};

const agent: Agent = {
	spawn: (assignment) => Effect.succeed(assignment),
	terminate: (assignment) => Effect.succeed(assignment),
};

it("prepare answers the status of the review its sub agents were spawned for", () => {
	const controller = MainController.over(host, store, agent);
	const prepared = controller.prepare(
		targetUrlFrom(),
		workdirFrom(),
		probesFrom(),
	);

	assert.equal(Effect.runSync(prepared), status);
});

it("prepare fails with what the host answers", () => {
	const unknownFormat = unknownFormatFrom();
	const refusing: Host = {
		...host,
		getChange: () => Effect.fail(unknownFormat),
	};
	const controller = MainController.over(refusing, store, agent);
	const prepared = controller.prepare(
		targetUrlFrom(),
		workdirFrom(),
		probesFrom(),
	);

	assert.equal(Effect.runSync(Effect.flip(prepared)), unknownFormat);
});

it("prepare fails when a sub agent is not started", () => {
	const notStarted = notStartedFrom();
	const unspawned: Change = {
		...changeFrom(),
		review: () => ({ ...stored, spawnedBy: () => Effect.fail(notStarted) }),
	};
	const stalling: Host = {
		...host,
		getChange: () => Effect.succeed(unspawned),
	};
	const controller = MainController.over(stalling, store, agent);
	const prepared = controller.prepare(
		targetUrlFrom(),
		workdirFrom(),
		probesFrom(),
	);

	assert.equal(Effect.runSync(Effect.flip(prepared)), notStarted);
});

it("status answers the status of the stored review", () => {
	const controller = MainController.over(host, store, agent);

	assert.equal(Effect.runSync(controller.status(workdirFrom())), status);
});

it("status fails when the workdir holds no review", () => {
	const noReview = noReviewFrom();
	const empty: ReviewStore = {
		...store,
		inWorkdir: () => Effect.fail(noReview),
	};
	const controller = MainController.over(host, empty, agent);

	assert.equal(
		Effect.runSync(Effect.flip(controller.status(workdirFrom()))),
		noReview,
	);
});
