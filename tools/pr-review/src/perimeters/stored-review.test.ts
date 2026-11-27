import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Change } from "../domain/change.ts";
import { Forward } from "../domain/forward.ts";
import { HostError } from "../domain/host-error.ts";
import type { Page } from "../domain/page.ts";
import { Posted } from "../domain/posted.ts";
import type { Probe } from "../domain/probe.ts";
import type { Review } from "../domain/review.ts";
import type { Rule } from "../domain/rule.ts";
import {
	pageSample,
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
} from "../domain/sample.test-support.ts";
import { Verdict } from "../domain/verdict.ts";
import { reviewOfText, writtenRecording, writtenReview } from "./disk.ts";
import { TermCodec } from "./term.ts";
import { AcknowledgementCodec, PageCodec, RuleCodec } from "./values.ts";

const probe: Probe = probeSample("probe-1");
const sentence =
	"By sending this ack I acknowledge I read all instructions and implicitly I know how to use the review tool";
const started: Review = Change.of(urlSample(), [pageSample()]).review([
	taskSample(probe, [
		ruleSample("Stated purpose"),
		ruleSample("Delete unused"),
	]),
]);
const text = [
	writtenReview(started),
	writtenRecording(probe, AcknowledgementCodec.decode(sentence)),
	writtenRecording(probe, Forward.create()),
	writtenRecording(probe, Verdict.on(ruleSample("Stated purpose"))),
	writtenRecording(probe, HostError.create()),
	writtenRecording(probe, Posted.create()),
].join("");

const readBack = (): Review => reviewOfText(text);

it("a review read back has the same rules left", () => {
	assert.deepEqual(
		readBack()
			.status()
			.remaining.map((rule: Rule): string => RuleCodec.encode(rule)),
		["Delete unused"],
	);
});

it("a review read back remembers what happened to posting, in order", () => {
	assert.deepEqual(
		readBack()
			.status()
			.posts.map((post): boolean => post instanceof Posted),
		[false, true],
	);
});

it("a review read back is on the same page", () => {
	const page = readBack()
		.assignmentOf(probe)
		.pipe(
			Effect.flatMap((assignment) => assignment.briefing().page()),
			Effect.map((found: Page): string => PageCodec.encode(found)),
		);

	assert.equal(Effect.runSync(page), "a page");
});

it("a review read back still defines its terms", () => {
	const defined = readBack()
		.assignmentOf(probe)
		.pipe(
			Effect.flatMap((assignment) =>
				assignment.briefing().definitionOf(TermCodec.decode("ledger")),
			),
			Effect.map((definition): string => typeof definition),
		);

	assert.equal(Effect.runSync(defined), "object");
});

it("text that does not hold what a review was started from is not read", () => {
	assert.throws((): Review => reviewOfText('{"url":""}\n'));
});
