import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Probes } from "../generated/domain/probes.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import { Assignments } from "./assignments.ts";
import { Change } from "./change.ts";
import { PendingReview } from "./pending-review.ts";

it("a change is reviewed in the pending review it holds", () => {
	const pending: PendingReview = PendingReview.of(
		ReviewStatus.codec.decode({}),
		Assignments.of([]),
	);

	assert.equal(Change.of(pending).review(Probes.codec.decode({})), pending);
});
