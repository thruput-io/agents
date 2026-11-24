import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	modelFrom,
	noReviewFrom,
	notStartedFrom,
	outcomeFrom,
	reviewStatusFrom,
	sessionFrom,
	targetUrlFrom,
	unknownFormatFrom,
	workdirFrom,
} from "../../domain/factory.ts";
import { changeFrom, pendingLedgerFrom } from "../../domain/minted-review.ts";
import type {
	Agent,
	Change,
	Host,
	Ledger,
	PendingLedger,
	ReviewStore,
} from "../../domain/review.ts";
import { MainController } from "./main-controller.ts";

const session = sessionFrom();
const status = reviewStatusFrom();
const spawned: PendingLedger = {
	...pendingLedgerFrom(),
	spawnedBy: () => Effect.succeed(session),
};
const reviewed: Change = { ...changeFrom(), review: () => spawned };
const stored: Ledger = { ...pendingLedgerFrom(), status: () => status };

const host: Host = {
	getChange: () => Effect.succeed(reviewed),
	post: () => Effect.succeed(outcomeFrom()),
};

const store: ReviewStore = {
	save: () => Effect.succeed(stored),
	inWorkdir: () => Effect.succeed(stored),
	ofSession: () => Effect.succeed(stored),
	replace: () => Effect.succeed(stored),
};

const agent: Agent = {
	spawn: (assignment) => Effect.succeed(assignment),
	terminate: (assignment) => Effect.succeed(assignment),
};

it("prepare answers the session the sub agents were spawned with", () => {
	const controller = MainController.over(host, store, agent);
	const prepared = controller.prepare(
		targetUrlFrom(),
		workdirFrom(),
		modelFrom(),
	);

	assert.equal(Effect.runSync(prepared), session);
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
		modelFrom(),
	);

	assert.equal(Effect.runSync(Effect.flip(prepared)), unknownFormat);
});

it("prepare fails when a sub agent is not started", () => {
	const notStarted = notStartedFrom();
	const unspawned: PendingLedger = {
		...pendingLedgerFrom(),
		spawnedBy: () => Effect.fail(notStarted),
	};
	const stalling: Host = {
		...host,
		getChange: () =>
			Effect.succeed({ ...changeFrom(), review: () => unspawned }),
	};
	const controller = MainController.over(stalling, store, agent);
	const prepared = controller.prepare(
		targetUrlFrom(),
		workdirFrom(),
		modelFrom(),
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
	const answered = controller.status(workdirFrom());

	assert.equal(Effect.runSync(Effect.flip(answered)), noReview);
});
