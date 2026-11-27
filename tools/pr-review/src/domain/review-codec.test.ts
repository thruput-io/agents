import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { Forward } from "../generated/domain/forward.g.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { Page } from "../generated/domain/page.g.ts";
import { Posted } from "../generated/domain/posted.g.ts";
import type { Probe } from "../generated/domain/probe.g.ts";
import { Rule } from "../generated/domain/rule.g.ts";
import { Change } from "./change.ts";
import { Review } from "./review.ts";
import {
	pageSample,
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
} from "./sample.test-support.ts";
import { Term } from "./term.ts";
import { Verdict } from "./verdict.ts";

const probe: Probe = probeSample("probe-1");
const sentence =
	"By sending this ack I acknowledge I read all instructions and implicitly I know how to use the review tool";
const review: Review = Change.of(urlSample(), [pageSample()])
	.review([
		taskSample(probe, [
			ruleSample("Stated purpose"),
			ruleSample("Delete unused"),
		]),
	])
	.after(probe, Acknowledgement.codec.decode(sentence))
	.after(probe, Forward.create())
	.after(probe, Verdict.on(ruleSample("Stated purpose")))
	.after(probe, HostError.create())
	.after(probe, Posted.create());

const readBack = (): Review => Review.codec.decode(Review.codec.encode(review));

it("a review read back has the same rules left", () => {
	assert.deepEqual(
		readBack()
			.status()
			.remaining.map((rule: Rule): string => Rule.codec.encode(rule)),
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
			Effect.map((found: Page): string => Page.codec.encode(found)),
		);

	assert.equal(Effect.runSync(page), "a page");
});

it("a review read back still defines its terms", () => {
	const defined = readBack()
		.assignmentOf(probe)
		.pipe(
			Effect.flatMap((assignment) =>
				assignment.briefing().definitionOf(Term.codec.decode("ledger")),
			),
			Effect.map((definition): string => typeof definition),
		);

	assert.equal(Effect.runSync(defined), "object");
});

it("data that is not a review is not read", () => {
	assert.equal(Review.codec.safeParse({ url: "" }).success, false);
});
