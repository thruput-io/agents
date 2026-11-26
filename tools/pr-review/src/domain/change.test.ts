import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Probes } from "../generated/domain/probes.g.ts";
import { Change } from "./change.ts";
import { PendingReview } from "./pending-review.ts";

it("a change is reviewed with probes in a pending review", () => {
	const review = Change.create().review(Probes.create());

	assert.equal(review instanceof PendingReview, true);
});

it("a change carries no data yet", () => {
	assert.deepEqual(Change.dataOf(Change.create()), {});
});
