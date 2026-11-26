import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Assignments } from "../../../domain/assignments.ts";
import { PendingReview } from "../../../domain/pending-review.ts";
import { NoReview } from "../../../generated/domain/no-review.g.ts";
import { ReviewStatus } from "../../../generated/domain/review-status.g.ts";
import { Workdir } from "../../../generated/domain/workdir.g.ts";
import { memoryStore } from "./memory-store.ts";

const workdir: Workdir = Workdir.codec.decode("/work");
const review: PendingReview = PendingReview.of(
	ReviewStatus.codec.decode({}),
	Assignments.of([]),
);

it("a saved review is answered as saved", () => {
	assert.equal(Effect.runSync(memoryStore().save(workdir, review)), review);
});

it("a saved review is found in its workdir", () => {
	const store = memoryStore();
	const found = store
		.save(workdir, review)
		.pipe(Effect.flatMap(() => store.inWorkdir(workdir)));

	assert.equal(Effect.runSync(found), review);
});

it("a saved review is found by another value of the same workdir", () => {
	const store = memoryStore();
	const again: Workdir = Workdir.codec.decode("/work");
	const found = store
		.save(workdir, review)
		.pipe(Effect.flatMap(() => store.inWorkdir(again)));

	assert.equal(Effect.runSync(found), review);
});

it("a workdir nothing was saved in holds no review", () => {
	const missing = Effect.runSync(Effect.flip(memoryStore().inWorkdir(workdir)));

	assert.equal(missing instanceof NoReview, true);
});
