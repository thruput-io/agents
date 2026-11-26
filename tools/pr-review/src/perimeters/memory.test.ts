import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";
import { keyOf, nothingStored } from "./memory.ts";

it("a workdir is kept under its own text", () => {
	assert.equal(keyOf(Effect.runSync(Workdir.from("/work"))), "/work");
});

it("nothing stored is a no review", () => {
	assert.equal(nothingStored() instanceof NoReview, true);
});
