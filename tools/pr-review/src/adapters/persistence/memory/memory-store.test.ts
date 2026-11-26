import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { PendingReview } from "../../../domain/pending-review.ts";
import { NoReview } from "../../../generated/domain/no-review.g.ts";
import { Probe } from "../../../generated/domain/probe.g.ts";
import { Verdict } from "../../../generated/domain/verdict.g.ts";
import { Workdir } from "../../../generated/domain/workdir.g.ts";
import { memoryStore } from "./memory-store.ts";

const workdir = Effect.runSync(Workdir.from("/work"));

it("a saved review is answered as saved", () => {
	const review = PendingReview.create();

	assert.equal(Effect.runSync(memoryStore.save(workdir, review)), review);
});

it("a workdir holds no review", () => {
	const answered = Effect.runSync(Effect.flip(memoryStore.inWorkdir(workdir)));

	assert.equal(answered instanceof NoReview, true);
});

it("a probe holds no review", () => {
	const answered = memoryStore.ofProbe(Probe.create());

	assert.equal(Effect.runSync(Effect.flip(answered)) instanceof NoReview, true);
});

it("an entry is appended to no review", () => {
	const appended = memoryStore.append(Probe.create(), Verdict.create());

	assert.equal(Effect.runSync(Effect.flip(appended)) instanceof NoReview, true);
});
