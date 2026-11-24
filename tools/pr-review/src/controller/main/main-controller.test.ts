import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	noReviewFrom,
	outcomeFrom,
	reviewStatusFrom,
	sessionFrom,
	targetUrlFrom,
	unknownFormatFrom,
	workdirFrom,
} from "../../domain/factory.ts";
import { changeFrom, pendingLedgerFrom } from "../../domain/minted-review.ts";
import type { Host, Ledger, ReviewStore } from "../../domain/review.ts";
import { MainController } from "./main-controller.ts";

const session = sessionFrom();
const status = reviewStatusFrom();
const stored: Ledger = {
	...pendingLedgerFrom(),
	session: () => session,
	status: () => status,
};

const host: Host = {
	getChange: () => Effect.succeed(changeFrom()),
	post: () => Effect.succeed(outcomeFrom()),
};

const store: ReviewStore = {
	save: () => Effect.succeed(stored),
	inWorkdir: () => Effect.succeed(stored),
	ofSession: () => Effect.succeed(stored),
	replace: () => Effect.succeed(stored),
};

it("prepare answers the session of the saved review", () => {
	const controller = MainController.over(host, store);
	const prepared = controller.prepare(targetUrlFrom(), workdirFrom());

	assert.equal(Effect.runSync(prepared), session);
});

it("prepare fails with what the host answers", () => {
	const unknownFormat = unknownFormatFrom();
	const refusing: Host = {
		...host,
		getChange: () => Effect.fail(unknownFormat),
	};
	const controller = MainController.over(refusing, store);
	const prepared = controller.prepare(targetUrlFrom(), workdirFrom());

	assert.equal(Effect.runSync(Effect.flip(prepared)), unknownFormat);
});

it("status answers the status of the stored review", () => {
	const controller = MainController.over(host, store);

	assert.equal(Effect.runSync(controller.status(workdirFrom())), status);
});

it("status fails when the workdir holds no review", () => {
	const noReview = noReviewFrom();
	const empty: ReviewStore = {
		...store,
		inWorkdir: () => Effect.fail(noReview),
	};
	const controller = MainController.over(host, empty);
	const answered = controller.status(workdirFrom());

	assert.equal(Effect.runSync(Effect.flip(answered)), noReview);
});
