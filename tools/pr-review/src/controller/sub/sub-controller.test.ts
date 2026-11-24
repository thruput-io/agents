import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	hostErrorFrom,
	noReviewFrom,
	outcomeFrom,
	probeFrom,
	reportFrom,
	reviewStatusFrom,
	sessionFrom,
	termFrom,
} from "../../domain/factory.ts";
import {
	changeFrom,
	completeLedgerFrom,
	pendingLedgerFrom,
} from "../../domain/minted-review.ts";
import type { Host, Ledger, ReviewStore } from "../../domain/review.ts";
import { BriefingController } from "./briefing-controller.ts";
import { PagingController } from "./paging-controller.ts";
import { ProgressController } from "./progress-controller.ts";

const status = reviewStatusFrom();
const assignment = pendingLedgerFrom().assignmentOf(probeFrom());
const briefing = assignment.briefing();
const cursor = assignment.cursor();
const complete: Ledger = { ...completeLedgerFrom(), status: () => status };
const stored: Ledger = {
	...pendingLedgerFrom(),
	assignmentOf: () => ({
		...assignment,
		acknowledged: () => complete,
		briefing: () => briefing,
		cursor: () => cursor,
		recorded: () => complete,
	}),
};

const host: Host = {
	getChange: () => Effect.succeed(changeFrom()),
	post: () => Effect.succeed(outcomeFrom()),
};

const store: ReviewStore = {
	save: () => Effect.succeed(stored),
	inWorkdir: () => Effect.succeed(stored),
	ofSession: () => Effect.succeed(stored),
	replace: () => Effect.succeed(complete),
};

it("instructions answers the instruction of the briefing", () => {
	const answered = BriefingController.over(store).instructions(
		sessionFrom(),
		probeFrom(),
	);

	assert.deepEqual(Effect.runSync(answered), briefing.instruction());
});

it("rules answers the ruleset of the briefing", () => {
	const answered = BriefingController.over(store).rules(
		sessionFrom(),
		probeFrom(),
	);

	assert.deepEqual(Effect.runSync(answered), briefing.ruleset());
});

it("define answers the definition of the term", () => {
	const term = termFrom();
	const answered = BriefingController.over(store).define(
		sessionFrom(),
		probeFrom(),
		term,
	);

	assert.deepEqual(Effect.runSync(answered), briefing.definitionOf(term));
});

it("next answers the next page", () => {
	const answered = PagingController.over(store).next(
		sessionFrom(),
		probeFrom(),
	);

	assert.deepEqual(Effect.runSync(answered), cursor.next());
});

it("prev answers the previous page", () => {
	const answered = PagingController.over(store).prev(
		sessionFrom(),
		probeFrom(),
	);

	assert.deepEqual(Effect.runSync(answered), cursor.previous());
});

it("a command fails for a session that holds no review", () => {
	const noReview = noReviewFrom();
	const empty: ReviewStore = {
		...store,
		ofSession: () => Effect.fail(noReview),
	};
	const answered = PagingController.over(empty).next(
		sessionFrom(),
		probeFrom(),
	);

	assert.equal(Effect.runSync(Effect.flip(answered)), noReview);
});

it("ack answers the status of the acknowledged review", () => {
	const answered = ProgressController.over(host, store).ack(
		sessionFrom(),
		probeFrom(),
	);

	assert.equal(Effect.runSync(answered), status);
});

it("report answers the status of the submitted review", () => {
	const answered = ProgressController.over(host, store).report(
		sessionFrom(),
		probeFrom(),
		reportFrom(),
	);

	assert.equal(Effect.runSync(answered), status);
});

it("report fails with the error of the host", () => {
	const hostError = hostErrorFrom();
	const refusing: Host = { ...host, post: () => Effect.fail(hostError) };
	const answered = ProgressController.over(refusing, store).report(
		sessionFrom(),
		probeFrom(),
		reportFrom(),
	);

	assert.equal(Effect.runSync(Effect.flip(answered)), hostError);
});
