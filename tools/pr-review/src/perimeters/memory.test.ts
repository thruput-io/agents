import assert from "node:assert/strict";
import { test as it } from "node:test";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { nothingStored } from "./memory.ts";

it("nothing stored is a no review", () => {
	assert.equal(nothingStored() instanceof NoReview, true);
});
