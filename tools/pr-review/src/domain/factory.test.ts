import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	acknowledgementFrom,
	acknowledgementRequestFrom,
	alreadyReviewedFrom,
	contextFrom,
	definitionFrom,
	hostErrorFrom,
	noReviewFrom,
	notStartedFrom,
	outcomeFrom,
	probeFrom,
	probesFrom,
	progressFrom,
	refusedFrom,
	reviewStatusFrom,
	ruleFrom,
	rulesetFrom,
	surfaceFrom,
	targetUrlFrom,
	termFrom,
	tooLargeFrom,
	unknownFormatFrom,
	usageFrom,
	verdictFrom,
	violationFrom,
	workdirFrom,
	workflowFrom,
} from "./factory.ts";
import { isMinted } from "./mint.ts";

it("a target URL is minted", () => {
	assert.equal(isMinted(targetUrlFrom()), true);
});

it("a workdir is minted", () => {
	assert.equal(isMinted(workdirFrom()), true);
});

it("a surface is minted", () => {
	assert.equal(isMinted(surfaceFrom()), true);
});

it("a probe is minted", () => {
	assert.equal(isMinted(probeFrom()), true);
});

it("probes are minted", () => {
	assert.equal(isMinted(probesFrom()), true);
});

it("a rule is minted", () => {
	assert.equal(isMinted(ruleFrom()), true);
});

it("a ruleset is minted", () => {
	assert.equal(isMinted(rulesetFrom()), true);
});

it("a term is minted", () => {
	assert.equal(isMinted(termFrom()), true);
});

it("a definition is minted", () => {
	assert.equal(isMinted(definitionFrom()), true);
});

it("a workflow is minted", () => {
	assert.equal(isMinted(workflowFrom()), true);
});

it("a context is minted", () => {
	assert.equal(isMinted(contextFrom()), true);
});

it("a usage is minted", () => {
	assert.equal(isMinted(usageFrom()), true);
});

it("an acknowledgement request is minted", () => {
	assert.equal(isMinted(acknowledgementRequestFrom()), true);
});

it("an acknowledgement is minted", () => {
	assert.equal(isMinted(acknowledgementFrom()), true);
});

it("a verdict is minted", () => {
	assert.equal(isMinted(verdictFrom()), true);
});

it("a violation is minted", () => {
	assert.equal(isMinted(violationFrom()), true);
});

it("an outcome is minted", () => {
	assert.equal(isMinted(outcomeFrom()), true);
});

it("a review status is minted", () => {
	assert.equal(isMinted(reviewStatusFrom()), true);
});

it("a progress is minted", () => {
	assert.equal(isMinted(progressFrom()), true);
});

it("a not started is minted", () => {
	assert.equal(isMinted(notStartedFrom()), true);
});

it("a no review is minted", () => {
	assert.equal(isMinted(noReviewFrom()), true);
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
