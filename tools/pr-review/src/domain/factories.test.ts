import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	alreadyReviewedFrom,
	changeFrom,
	completeLedgerFrom,
	hostErrorFrom,
	outcomeFrom,
	pendingLedgerFrom,
	probeFrom,
	refusedFrom,
	reportFrom,
	reviewStatusFrom,
	ruleFrom,
	sessionFrom,
	surfaceFrom,
	targetUrlFrom,
	termFrom,
	tooLargeFrom,
	unknownFormatFrom,
	verdictFrom,
	violationFrom,
	workdirFrom,
} from "./factories.ts";
import { isMinted } from "./mint.ts";

it("a target URL is minted", () => {
	assert.equal(isMinted(targetUrlFrom()), true);
});

it("a workdir is minted", () => {
	assert.equal(isMinted(workdirFrom()), true);
});

it("a change is minted", () => {
	assert.equal(isMinted(changeFrom()), true);
});

it("a surface is minted", () => {
	assert.equal(isMinted(surfaceFrom()), true);
});

it("a probe is minted", () => {
	assert.equal(isMinted(probeFrom()), true);
});

it("a rule is minted", () => {
	assert.equal(isMinted(ruleFrom()), true);
});

it("a term is minted", () => {
	assert.equal(isMinted(termFrom()), true);
});

it("a session is minted", () => {
	assert.equal(isMinted(sessionFrom()), true);
});

it("a report is minted", () => {
	assert.equal(isMinted(reportFrom()), true);
});

it("a verdict is minted", () => {
	assert.equal(isMinted(verdictFrom()), true);
});

it("a violation is minted", () => {
	assert.equal(isMinted(violationFrom()), true);
});

it("a pending ledger is minted", () => {
	assert.equal(isMinted(pendingLedgerFrom()), true);
});

it("a complete ledger is minted", () => {
	assert.equal(isMinted(completeLedgerFrom()), true);
});

it("an outcome is minted", () => {
	assert.equal(isMinted(outcomeFrom()), true);
});

it("a review status is minted", () => {
	assert.equal(isMinted(reviewStatusFrom()), true);
});

it("an unknown format is minted", () => {
	assert.equal(isMinted(unknownFormatFrom()), true);
});

it("an already reviewed is minted", () => {
	assert.equal(isMinted(alreadyReviewedFrom()), true);
});

it("a too large is minted", () => {
	assert.equal(isMinted(tooLargeFrom()), true);
});

it("a refused is minted", () => {
	assert.equal(isMinted(refusedFrom()), true);
});

it("a host error is minted", () => {
	assert.equal(isMinted(hostErrorFrom()), true);
});
