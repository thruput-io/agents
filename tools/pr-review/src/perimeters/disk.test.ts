import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Change } from "../domain/change.ts";
import { NoReview } from "../domain/no-review.ts";
import type { Review } from "../domain/review.ts";
import type { Rule } from "../domain/rule.ts";
import { ruleSample, urlSample } from "../domain/sample.test-support.ts";
import { Verdict } from "../domain/verdict.ts";
import { WorkdirFailed } from "../domain/workdir-failed.ts";
import {
	fileIn,
	fileOf,
	nothingStored,
	notWritable,
	reviewOfText,
	writtenRecording,
	writtenReview,
} from "./disk.ts";
import { probeIn } from "./probe-session.ts";
import {
	purposeRules,
	purposeRulesAfterTheFirst,
} from "./rulebook.test-support.ts";
import { tasksOf } from "./rulebook.ts";
import { sessionAt } from "./session.test-support.ts";
import { RuleCodec } from "./values.ts";

const probe = probeIn(sessionAt("/work"), "purpose");
const review: Review = Change.of(urlSample(), []).review(tasksOf(probe));

const remainingIn = (text: string): readonly string[] =>
	reviewOfText(text)
		.status()
		.remaining.map((rule: Rule): string => RuleCodec.encode(rule));

it("a review is kept in one file in its workdir", () => {
	assert.equal(fileIn(sessionAt("/work")), "/work/review.jsonl");
});

it("a probe leads to the file of its review", () => {
	const held = probeIn(sessionAt("/work"), "purpose");

	assert.equal(fileOf(held), "/work/review.jsonl");
});

it("a review is written as one line", () => {
	assert.equal(writtenReview(review).trimEnd().split("\n").length, 1);
});

it("a written review reads back with every rule left", () => {
	assert.deepEqual(remainingIn(writtenReview(review)), purposeRules);
});

it("a line written after the review is applied to it when read", () => {
	const text = [
		writtenReview(review),
		writtenRecording(probe, Verdict.on(ruleSample("Stated purpose"))),
	].join("");

	assert.deepEqual(remainingIn(text), purposeRulesAfterTheFirst);
});

it("nothing stored is a no review", () => {
	assert.equal(nothingStored() instanceof NoReview, true);
});

it("a file that cannot be written is a failed workdir", () => {
	assert.equal(notWritable() instanceof WorkdirFailed, true);
});
