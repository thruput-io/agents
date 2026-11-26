import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { pendingReviewFrom } from "../../../domain/minted-review.ts";
import {
	probeFrom,
	verdictFrom,
	workdirFrom,
} from "../../../generated/domain/factory.g.ts";
import { noReviewMark } from "../../../generated/domain/mark.g.ts";
import { memoryStore } from "./memory-store.ts";

const workdir = workdirFrom("/work");
const review = pendingReviewFrom();

it("a saved review is answered as saved", () => {
	assert.equal(Effect.runSync(memoryStore.save(workdir, review)), review);
});

it("a workdir holds no review", () => {
	const answered = Effect.runSync(Effect.flip(memoryStore.inWorkdir(workdir)));

	assert.equal(answered[noReviewMark], noReviewMark);
});

it("a probe holds no review", () => {
	const answered = Effect.runSync(
		Effect.flip(memoryStore.ofProbe(probeFrom())),
	);

	assert.equal(answered[noReviewMark], noReviewMark);
});

it("an entry is appended to no review", () => {
	const appended = memoryStore.append(probeFrom(), verdictFrom());

	assert.equal(
		Effect.runSync(Effect.flip(appended))[noReviewMark],
		noReviewMark,
	);
});
