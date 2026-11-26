import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test as it } from "node:test";
import { Change } from "../domain/change.ts";
import type { Review } from "../domain/review.ts";
import {
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
} from "../domain/sample.test-support.ts";
import { Verdict } from "../domain/verdict.ts";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { Rule } from "../generated/domain/rule.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";
import { WorkdirFailed } from "../generated/domain/workdir-failed.g.ts";
import {
	fileIn,
	fileOf,
	nothingStored,
	notWritable,
	reviewOfText,
	writtenRecording,
	writtenReview,
} from "./disk.ts";

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
		.remaining.map((rule: Rule): string => Rule.codec.encode(rule));

it("a review is kept in one file in its workdir", () => {
	assert.equal(fileIn(Workdir.codec.decode("/work")), "/work/review.jsonl");
});

it("a probe leads to the file of its review", () => {
	const place = Buffer.from("/work").toString("base64url");

	assert.equal(fileOf(probeSample(`probe-1.${place}`)), "/work/review.jsonl");
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
