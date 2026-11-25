import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	acknowledgementFrom,
	hostErrorFrom,
	notStartedFrom,
	outcomeFrom,
	probesFrom,
	termFrom,
} from "./factory.ts";
import {
	acknowledgementRequestMark,
	briefingMark,
	completeReviewMark,
	contextMark,
	cursorMark,
	definitionMark,
	instructionsMark,
	pendingReviewMark,
	progressMark,
	reviewStatusMark,
	rulesetMark,
	surfaceMark,
	usageMark,
	workflowMark,
} from "./mark.ts";
import {
	assignmentFrom,
	changeFrom,
	completeReviewFrom,
	pendingReviewFrom,
} from "./minted-review.ts";
import type { Agent, Host } from "./review.ts";

const host: Host = {
	getChange: () => Effect.succeed(changeFrom()),
	post: () => Effect.succeed(outcomeFrom()),
};

const agent: Agent = {
	spawn: (assignment) => Effect.succeed(assignment),
	terminate: (assignment) => Effect.succeed(assignment),
};

it("a change is reviewed with probes in a pending review", () => {
	const review = changeFrom().review(probesFrom());

	assert.equal(review[pendingReviewMark], pendingReviewMark);
});

it("a review states its status", () => {
	assert.equal(
		completeReviewFrom().status()[reviewStatusMark],
		reviewStatusMark,
	);
});

it("a pending review spawned by an agent stays pending", () => {
	const spawned = Effect.runSync(pendingReviewFrom().spawnedBy(agent));

	assert.equal(spawned[pendingReviewMark], pendingReviewMark);
});

it("a pending review fails when the agent starts no sub agent", () => {
	const notStarted = notStartedFrom();
	const stalling: Agent = { ...agent, spawn: () => Effect.fail(notStarted) };
	const spawned = pendingReviewFrom().spawnedBy(stalling);

	assert.equal(Effect.runSync(Effect.flip(spawned)), notStarted);
});

it("a pending review is submitted to no host", () => {
	const refusing: Host = { ...host, post: () => Effect.fail(hostErrorFrom()) };
	const review = Effect.runSync(pendingReviewFrom().submittedTo(refusing));

	assert.equal(pendingReviewMark in review, true);
});

it("a complete review is posted and stays complete", () => {
	const review = Effect.runSync(completeReviewFrom().submittedTo(host));

	assert.equal(completeReviewMark in review, true);
});

it("a complete review fails with the error of the host", () => {
	const hostError = hostErrorFrom();
	const refusing: Host = { ...host, post: () => Effect.fail(hostError) };
	const submitted = completeReviewFrom().submittedTo(refusing);

	assert.equal(Effect.runSync(Effect.flip(submitted)), hostError);
});

it("a pending review dismissed by an agent stays pending", () => {
	const review = Effect.runSync(pendingReviewFrom().dismissedBy(agent));

	assert.equal(pendingReviewMark in review, true);
});

it("a complete review dismissed by an agent stays complete", () => {
	const review = Effect.runSync(completeReviewFrom().dismissedBy(agent));

	assert.equal(completeReviewMark in review, true);
});

it("an assignment has a briefing", () => {
	assert.equal(assignmentFrom().briefing()[briefingMark], briefingMark);
});

it("an assignment has a cursor", () => {
	assert.equal(assignmentFrom().cursor()[cursorMark], cursorMark);
});

it("an assignment states its progress", () => {
	assert.equal(assignmentFrom().progress()[progressMark], progressMark);
});

it("an assignment accepts an acknowledgement", () => {
	const acknowledgement = acknowledgementFrom();
	const accepted = assignmentFrom().accepted(acknowledgement);

	assert.equal(Effect.runSync(accepted), acknowledgement);
});

it("a briefing holds the instructions", () => {
	const instructions = assignmentFrom().briefing().instructions();

	assert.equal(instructions[instructionsMark], instructionsMark);
});

it("a briefing holds the ruleset", () => {
	const briefing = assignmentFrom().briefing();

	assert.equal(briefing.rules()[rulesetMark], rulesetMark);
});

it("a briefing defines a term", () => {
	const definition = assignmentFrom().briefing().definitionOf(termFrom());

	assert.equal(definition[definitionMark], definitionMark);
});

it("instructions hold a workflow", () => {
	const instructions = assignmentFrom().briefing().instructions();

	assert.equal(instructions.workflow()[workflowMark], workflowMark);
});

it("instructions hold a context", () => {
	const instructions = assignmentFrom().briefing().instructions();

	assert.equal(instructions.context()[contextMark], contextMark);
});

it("instructions hold a usage", () => {
	const instructions = assignmentFrom().briefing().instructions();

	assert.equal(instructions.usage()[usageMark], usageMark);
});

it("instructions end with an acknowledgement request", () => {
	const request = assignmentFrom().briefing().instructions().request();

	assert.equal(request[acknowledgementRequestMark], acknowledgementRequestMark);
});

it("a cursor turns to the next page of the surface", () => {
	assert.equal(assignmentFrom().cursor().next()[surfaceMark], surfaceMark);
});

it("a cursor turns to the previous page of the surface", () => {
	assert.equal(assignmentFrom().cursor().previous()[surfaceMark], surfaceMark);
});
