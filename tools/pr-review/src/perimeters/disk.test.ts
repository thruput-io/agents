import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Change } from "../domain/change.ts";
import { NoReview } from "../domain/no-review.ts";
import type { Review } from "../domain/review.ts";
import type { Rule } from "../domain/rule.ts";
import {
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
} from "../domain/sample.test-support.ts";
import { Verdict } from "../domain/verdict.ts";
import { WorkdirFailed } from "../domain/workdir-failed.ts";
import {
	fileIn,
	fileOf,
	nothingStored,
	notWritable,
	probeIn,
	reviewOfText,
	writtenRecording,
	writtenReview,
} from "./disk.ts";
import { RuleCodec } from "./values.ts";
import { workdirOf } from "./workdir.ts";

const probe = probeSample("probe-1");
const review: Review = Change.of(urlSample(), []).review([
	taskSample(probe, [
		ruleSample("Stated purpose"),
		ruleSample("Delete unused"),
	]),
]);

const remainingIn = (text: string): readonly string[] =>
	reviewOfText(text)
		.status()
		.remaining.map((rule: Rule): string => RuleCodec.encode(rule));

it("a review is kept in one file in its workdir", () => {
	assert.equal(fileIn(workdirOf("/work")), "/work/review.jsonl");
});

it("a probe leads to the file of its review", () => {
	const held = probeIn(workdirOf("/work"), "probe-1");

	assert.equal(fileOf(held), "/work/review.jsonl");
});

it("a review is written as one line", () => {
	assert.equal(writtenReview(review).trimEnd().split("\n").length, 1);
});

it("a written review reads back with every rule left", () => {
	assert.deepEqual(remainingIn(writtenReview(review)), [
		"Stated purpose",
		"Delete unused",
	]);
});

it("a line written after the review is applied to it when read", () => {
	const text = [
		writtenReview(review),
		writtenRecording(probe, Verdict.on(ruleSample("Stated purpose"))),
	].join("");

	assert.deepEqual(remainingIn(text), ["Delete unused"]);
});

it("nothing stored is a no review", () => {
	assert.equal(nothingStored() instanceof NoReview, true);
});

it("a file that cannot be written is a failed workdir", () => {
	assert.equal(notWritable() instanceof WorkdirFailed, true);
});
