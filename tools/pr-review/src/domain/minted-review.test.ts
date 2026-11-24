import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	hostErrorFrom,
	outcomeFrom,
	probeFrom,
	reportFrom,
	termFrom,
} from "./factories.ts";
import {
	assignmentMark,
	briefingMark,
	completeLedgerMark,
	definitionMark,
	instructionsMark,
	pagesMark,
	pendingLedgerMark,
	reviewStatusMark,
	rulesetMark,
	sessionMark,
	surfaceMark,
} from "./marks.ts";
import {
	changeFrom,
	completeLedgerFrom,
	pendingLedgerFrom,
} from "./minted-review.ts";
import type { Hosts } from "./review.ts";

const accepting: Hosts = {
	getChange: () => Effect.succeed(changeFrom()),
	post: () => Effect.succeed(outcomeFrom()),
};

it("a change is reviewed in a pending ledger", () => {
	assert.equal(changeFrom().review()[pendingLedgerMark], pendingLedgerMark);
});

it("a ledger names its session", () => {
	assert.equal(pendingLedgerFrom().session()[sessionMark], sessionMark);
});

it("a ledger states its status", () => {
	assert.equal(
		completeLedgerFrom().status()[reviewStatusMark],
		reviewStatusMark,
	);
});

it("a ledger hands a probe its assignment", () => {
	const assignment = pendingLedgerFrom().assignmentOf(probeFrom());

	assert.equal(assignment[assignmentMark], assignmentMark);
});

it("a complete ledger hands a probe its assignment", () => {
	const assignment = completeLedgerFrom().assignmentOf(probeFrom());

	assert.equal(assignment[assignmentMark], assignmentMark);
});

it("an assignment has a briefing", () => {
	const assignment = pendingLedgerFrom().assignmentOf(probeFrom());

	assert.equal(assignment.briefing()[briefingMark], briefingMark);
});

it("a briefing holds the instructions", () => {
	const briefing = pendingLedgerFrom().assignmentOf(probeFrom()).briefing();

	assert.equal(briefing.instructions()[instructionsMark], instructionsMark);
});

it("a briefing holds the ruleset", () => {
	const briefing = pendingLedgerFrom().assignmentOf(probeFrom()).briefing();

	assert.equal(briefing.rules()[rulesetMark], rulesetMark);
});

it("a briefing defines a term", () => {
	const briefing = pendingLedgerFrom().assignmentOf(probeFrom()).briefing();

	assert.equal(
		briefing.definitionOf(termFrom())[definitionMark],
		definitionMark,
	);
});

it("an assignment has pages", () => {
	const assignment = pendingLedgerFrom().assignmentOf(probeFrom());

	assert.equal(assignment.pages()[pagesMark], pagesMark);
});

it("pages turn to the next page of the surface", () => {
	const pages = pendingLedgerFrom().assignmentOf(probeFrom()).pages();

	assert.equal(pages.next()[surfaceMark], surfaceMark);
});

it("pages turn to the previous page of the surface", () => {
	const pages = pendingLedgerFrom().assignmentOf(probeFrom()).pages();

	assert.equal(pages.previous()[surfaceMark], surfaceMark);
});

it("an acknowledged assignment leaves the ledger pending", () => {
	const ledger = pendingLedgerFrom().assignmentOf(probeFrom()).acknowledged();

	assert.equal(pendingLedgerMark in ledger, true);
});

it("a recorded report completes the ledger", () => {
	const assignment = pendingLedgerFrom().assignmentOf(probeFrom());

	assert.equal(completeLedgerMark in assignment.recorded(reportFrom()), true);
});

it("a pending ledger is submitted to no host", () => {
	const refusing: Hosts = {
		getChange: () => Effect.succeed(changeFrom()),
		post: () => Effect.fail(hostErrorFrom()),
	};
	const ledger = Effect.runSync(pendingLedgerFrom().submittedTo(refusing));

	assert.equal(pendingLedgerMark in ledger, true);
});

it("a complete ledger is posted and stays complete", () => {
	const ledger = Effect.runSync(completeLedgerFrom().submittedTo(accepting));

	assert.equal(completeLedgerMark in ledger, true);
});

it("a complete ledger fails with the error of the host", () => {
	const hostError = hostErrorFrom();
	const refusing: Hosts = {
		getChange: () => Effect.succeed(changeFrom()),
		post: () => Effect.fail(hostError),
	};
	const submitted = completeLedgerFrom().submittedTo(refusing);

	assert.equal(Effect.runSync(Effect.flip(submitted)), hostError);
});
