import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Change } from "../../../domain/change.ts";
import type { Review } from "../../../domain/review.ts";
import {
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
} from "../../../domain/sample.test-support.ts";
import { Acknowledgement } from "../../../generated/domain/acknowledgement.g.ts";
import { NoReview } from "../../../generated/domain/no-review.g.ts";
import type { Probe } from "../../../generated/domain/probe.g.ts";
import { Workdir } from "../../../generated/domain/workdir.g.ts";
import { memoryStore } from "./memory-store.ts";

const workdir: Workdir = Workdir.codec.decode("/work");
const probe: Probe = probeSample("probe-1");
const review: Review = Change.of(urlSample(), []).review([
	taskSample(probe, [ruleSample("Stated purpose")]),
]);
const sent: Acknowledgement = Acknowledgement.codec.decode(
	"By sending this ack I acknowledge that I have read all instructions, and implicitly that I know how to use the review tool.",
);

it("a saved review is found in its workdir", () => {
	const store = memoryStore();
	const found = store
		.save(workdir, review)
		.pipe(Effect.flatMap(() => store.inWorkdir(Workdir.codec.decode("/work"))));

	assert.equal(Effect.runSync(found), review);
});

it("a workdir nothing was saved in holds no review", () => {
	const missing = Effect.runSync(Effect.flip(memoryStore().inWorkdir(workdir)));

	assert.equal(missing instanceof NoReview, true);
});

it("a probe of a saved review has its assignment", () => {
	const store = memoryStore();
	const remaining = store.save(workdir, review).pipe(
		Effect.flatMap(() => store.ofProbe(probeSample("probe-1"))),
		Effect.map((assignment) => assignment.ledger().remaining.length),
	);

	assert.equal(Effect.runSync(remaining), 1);
});

it("a probe of no saved review has none", () => {
	const missing = Effect.runSync(Effect.flip(memoryStore().ofProbe(probe)));

	assert.equal(missing instanceof NoReview, true);
});

it("what is appended for a probe is kept in its review", () => {
	const store = memoryStore();
	const acknowledged = store.save(workdir, review).pipe(
		Effect.flatMap(() => store.append(probe, sent)),
		Effect.flatMap(() => store.ofProbe(probe)),
		Effect.flatMap((assignment) => assignment.standing()),
		Effect.map((remaining) => remaining.length),
	);

	assert.equal(Effect.runSync(acknowledged), 1);
});

it("nothing is appended for a probe of no saved review", () => {
	const missing = Effect.runSync(
		Effect.flip(memoryStore().append(probe, sent)),
	);

	assert.equal(missing instanceof NoReview, true);
});
